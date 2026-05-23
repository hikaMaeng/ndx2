import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import request from "supertest";
import { createApp } from "./app.js";
import type { NDXDatabase } from "ndx/agent/server";

test("GET /health returns agent health", async () => {
  const response = await request(createApp()).get("/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "agent",
    version: "0.1.4",
    packageName: "ndx",
    surface: "agent"
  });
});

test("GET /api/health returns agent health", async () => {
  const response = await request(createApp()).get("/api/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "agent",
    version: "0.1.4",
    packageName: "ndx",
    surface: "agent"
  });
});

test("GET /api/session/health returns session health from the same agent app", async () => {
  const response = await request(createApp()).get("/api/session/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "agent",
    surface: "session"
  });
});

test("GET /api/agent returns agent metadata for the web client", async () => {
  const response = await request(createApp())
    .get("/api/agent")
    .set("Host", "127.0.0.1:18082")
    .expect(200);

  assert.deepEqual(response.body, {
    service: "agent",
    version: "0.1.4",
    surface: "agent",
    session: {
      path: "/session",
      healthUrl: "http://127.0.0.1:18082/api/session/health",
      socketUrl: "ws://127.0.0.1:18082/session"
    },
    workspace: {
      hostRoot: "F:/dev/ndx2/volume",
      hostWorkspaceRoot: "F:/dev/ndx2/volume/workspace",
      containerWorkspaceRoot: "/ndx/workspace"
    }
  });
});

test("GET /assets/i18n/ko.json serves front-end translation resources", async () => {
  const response = await request(createApp()).get("/assets/i18n/ko.json").expect(200);

  assert.equal(response.body["session.model.dialog.provider.add.button"], "프로바이더 추가");
  assert.equal(response.body["session.model.dialog.provider.url.input.placeholder"], "http://192.168.0.1:1234/v1");
});

test("GET /api/agent/web-client-state returns initial state when no row exists", async () => {
  const database: NDXDatabase = {
    async query() {
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  const response = await request(createApp({ database }))
    .get("/api/agent/web-client-state")
    .query({ clientid: "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5" })
    .expect(200);

  assert.equal(response.body.clientid, "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5");
  assert.equal(response.body.userid, null);
  assert.equal(response.body.state.locale, "ko");
  assert.deepEqual(response.body.state.projects, []);
});

test("PUT /api/agent/web-client-state persists normalized browser state", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      return {
        rows: [
          {
            clientid: values?.[0],
            userid: values?.[1],
            state: JSON.parse(String(values?.[2])),
            updatedat: new Date("2026-05-12T00:00:00.000Z")
          }
        ],
        rowCount: 1
      } as never;
    },
    async close() {}
  };

  const response = await request(createApp({ database }))
    .put("/api/agent/web-client-state")
    .send({
      clientid: "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5",
      userid: "ndev",
      state: {
        locale: "en",
        projects: [{ id: "project-1", name: "NDX", path: "/mnt/f/dev/ndx2", source: "local" }],
        activeProjectId: "project-1"
      }
    })
    .expect(200);

  assert.equal(response.body.userid, "ndev");
  assert.equal(response.body.state.version, 1);
  assert.equal(response.body.state.activeProjectId, "project-1");
  assert.match(queries[0].text, /INSERT INTO webclientstate/);
});

test("POST /api/agent/web-projects creates project rows without project id files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-web-project-root-"));
  const previousRoot = process.env.NDX_ROOT;
  const previousContainerRoot = process.env.NDX_CONTAINER_ROOT;
  process.env.NDX_ROOT = root;
  process.env.NDX_CONTAINER_ROOT = root;
  const projectPath = path.join(root, "workspace", "project-a");
  await fs.mkdir(projectPath, { recursive: true });
  const database: NDXDatabase = {
    async query(text, values) {
      if (/INSERT INTO project/i.test(text)) {
        return {
          rows: [{ projectid: values?.[0], target: values?.[1], path: values?.[2], title: values?.[3] }],
          rowCount: 1
        } as never;
      }
      if (/INSERT INTO web_project/i.test(text)) {
        return {
          rows: [
            {
              projectid: values?.[0],
              path: projectPath,
              target: "local",
              screenorder: 0,
              userid: values?.[2],
              isactive: values?.[3],
              updatedat: new Date("2026-05-12T00:00:00.000Z")
            }
          ],
          rowCount: 1
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  try {
    const response = await request(createApp({ database }))
      .post("/api/agent/web-projects")
      .send({ path: projectPath, userid: "ndev" })
      .expect(201);

    assert.equal(response.body.path, projectPath);
    await assert.rejects(
      () => fs.stat(path.join(projectPath, ".ndx", ".projectid")),
      (error) => (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  } finally {
    if (previousRoot === undefined) {
      delete process.env.NDX_ROOT;
    } else {
      process.env.NDX_ROOT = previousRoot;
    }
    if (previousContainerRoot === undefined) {
      delete process.env.NDX_CONTAINER_ROOT;
    } else {
      process.env.NDX_CONTAINER_ROOT = previousContainerRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("DELETE /api/agent/web-projects/:projectid soft-deletes project and cleans client state", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (/UPDATE web_project/.test(text)) {
        return {
          rows: [
            {
              projectid: values?.[0],
              path: "/mnt/f/dev/ndx2",
              target: "local",
              screenorder: 0,
              userid: "ndev",
              isactive: values?.[1],
              updatedat: new Date("2026-05-12T00:00:00.000Z")
            }
          ],
          rowCount: 1
        } as never;
      }
      return { rows: [], rowCount: 1 } as never;
    },
    async close() {}
  };

  const response = await request(createApp({ database }))
    .delete("/api/agent/web-projects/project-1")
    .expect(200);

  assert.equal(response.body.projectid, "project-1");
  assert.equal(response.body.isactive, false);
  assert.match(queries[0].text, /SET isactive = \$2/);
  assert.match(queries[1].text, /UPDATE webclientstate/);
  assert.match(queries[1].text, /\$1::text/);
  assert.match(queries[1].text, /activeProjectId/);
  assert.match(queries[1].text, /lastSession/);
  assert.deepEqual(queries[1].values, ["project-1"]);
});

test("GET /api/agent/projects/:projectid/sessions prunes same-path stale project sessions before listing", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (/FROM web_project/i.test(text)) {
        return { rows: [{ path: "/ndx/workspace/test3" }], rowCount: 1 } as never;
      }
      if (/DELETE FROM sessiontoken/i.test(text) || /DELETE FROM sessiondata/i.test(text) || /DELETE FROM "session"/i.test(text)) {
        return { rows: [], rowCount: 1 } as never;
      }
      if (/FROM "session"/i.test(text) && /ORDER BY lastupdated DESC/i.test(text)) {
        return {
          rows: [
            {
              sessionid: "018f0000-0000-7000-8000-000000000001",
              userid: "ndev",
              title: "현재 프로젝트 세션",
              mode: "none",
              path: "/ndx/workspace/test3",
              projectid: "project-current",
              model: { type: "openai", model: "gpt-test", url: "https://example.test", token: "", contextsize: 200000 },
              isrunning: false,
              turnphase: "idle",
              interruptrequested: false,
              interruptrequestedat: null,
              interruptcompletedat: null,
              lastupdated: new Date("2026-05-12T00:00:00.000Z")
            }
          ],
          rowCount: 1
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  const response = await request(createApp({ database }))
    .get("/api/agent/projects/project-current/sessions")
    .query({ userid: "ndev" })
    .expect(200);

  assert.equal(response.body.sessions.length, 1);
  assert.equal(response.body.sessions[0].projectid, "project-current");
  assert.match(queries[0].text, /FROM web_project/);
  assert.match(queries[1].text, /DELETE FROM sessiontoken/);
  assert.match(queries[2].text, /DELETE FROM sessiondata/);
  assert.match(queries[3].text, /DELETE FROM "session"/);
  assert.deepEqual(queries[1].values, ["ndev", "/ndx/workspace/test3", "project-current"]);
  assert.deepEqual(queries[4].values, ["ndev", "project-current"]);
});
