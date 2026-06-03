import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import request from "supertest";
import { createApp } from "./app.js";
import type { NDXDatabase } from "ndx/agent";

test("GET /health returns agent health", async () => {
  const response = await request(createApp()).get("/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "ndx",
    version: "0.2.2",
    packageName: "ndx",
    surface: "agent"
  });
});

test("GET /api/health returns agent health", async () => {
  const response = await request(createApp()).get("/api/health").expect(200);

  assert.deepEqual(response.body, {
    status: "ok",
    service: "ndx",
    version: "0.2.2",
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
  const previousNdxRoot = process.env.NDX_ROOT;
  const previousNdxHostRoot = process.env.NDX_HOST_ROOT;
  process.env.NDX_ROOT = "/ndx";
  process.env.NDX_HOST_ROOT = "F:/dev/ndx2/volume";

  let response;
  try {
    response = await request(createApp())
      .get("/api/agent")
      .set("Host", "127.0.0.1:18082")
      .expect(200);
  } finally {
    if (previousNdxRoot === undefined) {
      delete process.env.NDX_ROOT;
    } else {
      process.env.NDX_ROOT = previousNdxRoot;
    }
    if (previousNdxHostRoot === undefined) {
      delete process.env.NDX_HOST_ROOT;
    } else {
      process.env.NDX_HOST_ROOT = previousNdxHostRoot;
    }
  }

  assert.deepEqual(response.body, {
    service: "agent",
    version: "0.2.2",
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
        projects: [{ projectName: "project-1", name: "NDX", path: "/mnt/f/dev/ndx2", source: "local" }],
        activeProjectName: "project-1"
      }
    })
    .expect(200);

  assert.equal(response.body.userid, "ndev");
  assert.equal(response.body.state.version, 1);
  assert.equal(response.body.state.activeProjectName, "project-1");
  assert.match(queries[0].text, /INSERT INTO webclientstate/);
});

test("POST /api/agent/web-projects creates project rows without project id files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-web-project-root-"));
  const previousRoot = process.env.NDX_ROOT;
  const previousContainerRoot = process.env.NDX_CONTAINER_ROOT;
  process.env.NDX_ROOT = root;
  process.env.NDX_CONTAINER_ROOT = root;
  const projectPath = path.join(root, "workspace", "project-a");
  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  const database: NDXDatabase = {
    async query(text, values) {
      if (/INSERT INTO web_project/i.test(text)) {
        return {
          rows: [
            {
              projectname: values?.[0],
              screenorder: 0,
              userid: values?.[2],
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
      .send({ name: "project-a", userid: "ndev" })
      .expect(201);

    assert.equal(response.body.path, projectPath);
    assert.equal(response.body.projectName, "project-a");
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

test("DELETE /api/agent/web-projects/:projectName accepts asynchronous project folder deletion", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-web-project-delete-"));
  const previousRoot = process.env.NDX_ROOT;
  const previousContainerRoot = process.env.NDX_CONTAINER_ROOT;
  process.env.NDX_ROOT = root;
  process.env.NDX_CONTAINER_ROOT = root;
  await fs.mkdir(path.join(root, "workspace", "project-1"), { recursive: true });
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (/DELETE FROM web_project/.test(text)) {
        return {
          rows: [
            {
              projectname: values?.[0],
              screenorder: 0,
              userid: "ndev",
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

  try {
    const response = await request(createApp({ database }))
      .delete("/api/agent/web-projects/project-1")
      .expect(202);

    assert.equal(response.body.projectName, "project-1");
    assert.match(queries[0].text, /DELETE FROM web_project/);
    assert.match(queries[1].text, /UPDATE webclientstate/);
    assert.match(queries[1].text, /activeProjectName/);
    assert.match(queries[1].text, /lastSession/);
    assert.deepEqual(queries[1].values, ["project-1"]);
  } finally {
    if (previousRoot === undefined) delete process.env.NDX_ROOT;
    else process.env.NDX_ROOT = previousRoot;
    if (previousContainerRoot === undefined) delete process.env.NDX_CONTAINER_ROOT;
    else process.env.NDX_CONTAINER_ROOT = previousContainerRoot;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("POST /api/agent/web-projects/:projectid/open-vscode launches VS Code in a new window with the host project path", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-vscode-open-"));
  const bin = path.join(root, "bin");
  const argsFile = path.join(root, "args.txt");
  await fs.mkdir(bin, { recursive: true });
  await fs.writeFile(path.join(bin, "code"), "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$NDX_VSCODE_ARGS_FILE\"\n");
  await fs.chmod(path.join(bin, "code"), 0o755);

  const previousPath = process.env.PATH;
  const previousArgsFile = process.env.NDX_VSCODE_ARGS_FILE;
  const previousNdxRoot = process.env.NDX_ROOT;
  const previousNdxHostRoot = process.env.NDX_HOST_ROOT;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  process.env.NDX_VSCODE_ARGS_FILE = argsFile;
  process.env.NDX_ROOT = "/ndx";
  process.env.NDX_HOST_ROOT = "F:/dev/ndx2/volume";

  try {
    await request(createApp())
      .post("/api/agent/web-projects/test-a/open-vscode")
      .expect(204);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await fs.stat(argsFile).then(() => true).catch(() => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.deepEqual((await fs.readFile(argsFile, "utf8")).trim().split("\n"), [
      "--new-window",
      "F:/dev/ndx2/volume/workspace/test-a"
    ]);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (previousArgsFile === undefined) {
      delete process.env.NDX_VSCODE_ARGS_FILE;
    } else {
      process.env.NDX_VSCODE_ARGS_FILE = previousArgsFile;
    }
    if (previousNdxRoot === undefined) {
      delete process.env.NDX_ROOT;
    } else {
      process.env.NDX_ROOT = previousNdxRoot;
    }
    if (previousNdxHostRoot === undefined) {
      delete process.env.NDX_HOST_ROOT;
    } else {
      process.env.NDX_HOST_ROOT = previousNdxHostRoot;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("GET /api/agent/projects/:projectName/sessions lists sessions by workspace project name", async () => {
  const queries: { text: string; values: unknown[] }[] = [];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-web-session-list-"));
  const previousRoot = process.env.NDX_ROOT;
  const previousContainerRoot = process.env.NDX_CONTAINER_ROOT;
  process.env.NDX_ROOT = root;
  process.env.NDX_CONTAINER_ROOT = root;
  await fs.mkdir(path.join(root, "workspace", "test3"), { recursive: true });
  const database: NDXDatabase = {
    async query(text, values) {
      queries.push({ text, values: values ?? [] });
      if (/FROM "session"/i.test(text) && /ORDER BY lastupdated DESC/i.test(text)) {
        return {
          rows: [
            {
              sessionid: "018f0000-0000-7000-8000-000000000001",
              userid: "ndev",
              title: "현재 프로젝트 세션",
              mode: "none",
              projectname: "test3",
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

  try {
    const response = await request(createApp({ database }))
      .get("/api/agent/projects/test3/sessions")
      .query({ userid: "ndev" })
      .expect(200);

    assert.equal(response.body.sessions.length, 1);
    assert.equal(response.body.sessions[0].projectname, "test3");
    assert.deepEqual(queries[0].values, ["ndev", "test3"]);
  } finally {
    if (previousRoot === undefined) delete process.env.NDX_ROOT;
    else process.env.NDX_ROOT = previousRoot;
    if (previousContainerRoot === undefined) delete process.env.NDX_CONTAINER_ROOT;
    else process.env.NDX_CONTAINER_ROOT = previousContainerRoot;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("GET /api/agent/sessions/:sessionid/attachments/:dataid/:index serves stored image attachments", async () => {
  const projectHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-web-attachment-"));
  const previousWorkspace = process.env.NDX_CONTAINER_WORKSPACE;
  process.env.NDX_CONTAINER_WORKSPACE = path.dirname(projectHome);
  const projectName = path.basename(projectHome);
  const sessionid = "018f0000-0000-7000-8000-000000000000";
  const dataid = "018f0000-0000-7000-8000-000000000001";
  const attachmentDirectory = path.join(projectHome, ".ndx", "sessions", sessionid);
  const attachmentPath = path.join(attachmentDirectory, "sample.png");
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  await fs.mkdir(attachmentDirectory, { recursive: true });
  await fs.writeFile(attachmentPath, imageBytes);

  const database: NDXDatabase = {
    async query(text, values) {
      if (/FROM "session"/i.test(text)) {
        return {
          rows: [{
            sessionid,
            userid: "ndev",
            title: "이미지 세션",
            mode: "none",
            projectname: projectName,
            model: { type: "openai", model: "gpt-test", url: "https://example.test", token: "", contextsize: 200000 },
            isrunning: false,
            turnphase: "idle",
            interruptrequested: false,
            interruptrequestedat: null,
            interruptcompletedat: null,
            runtimedata: {},
            lastupdated: new Date("2026-05-12T00:00:00.000Z")
          }],
          rowCount: 1
        } as never;
      }
      if (/FROM sessiondata/i.test(text)) {
        return {
          rows: [{
            dataid,
            sessionid: values?.[0],
            type: "user",
            contents: {
              kind: "user_message",
              text: "이미지를 봐줘.",
              attachments: [{ kind: "image", path: attachmentPath, name: "sample.png", mimeType: "image/png", size: imageBytes.length }]
            },
            createdat: new Date("2026-05-12T00:00:01.000Z")
          }],
          rowCount: 1
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };

  const response = await request(createApp({ database }))
    .get(`/api/agent/sessions/${sessionid}/attachments/${dataid}/0`)
    .expect(200);

  assert.equal(response.headers["content-type"], "image/png");
  assert.deepEqual(response.body, imageBytes);
  if (previousWorkspace === undefined) delete process.env.NDX_CONTAINER_WORKSPACE;
  else process.env.NDX_CONTAINER_WORKSPACE = previousWorkspace;
  await fs.rm(projectHome, { recursive: true, force: true });
});
