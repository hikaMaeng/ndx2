import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import express from "express";
import request from "supertest";
import WebSocket from "ws";
import { acquireAgentServerInstanceLock, attachSessionRoutes, attachSessionSocketServer } from "./index.js";
import { sendJson } from "./sendJson.js";
import type { NDXDatabase } from "ndx/agent";

process.env.NDX_CONTAINER_ROOT = os.tmpdir();
process.env.NDX_ROOT = os.tmpdir();

function createDatabase(): NDXDatabase {
  return {
    async query(text, values) {
      if (/FROM users/i.test(text)) {
        return {
          rows: [{ userid: "ndev", created: new Date("2026-05-12T00:00:00.000Z") }],
          rowCount: 1
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };
}

function createDatabaseWithSessionInsert(): NDXDatabase {
  return {
    async query(text, values) {
      if (/FROM users/i.test(text)) {
        return {
          rows: [{ userid: "ndev", created: new Date("2026-05-12T00:00:00.000Z") }],
          rowCount: 1
        } as never;
      }

      if (/INSERT INTO "session"/i.test(text)) {
        return {
          rows: [
            {
              sessionid: values?.[0],
              userid: values?.[1],
              title: values?.[2],
              mode: values?.[3],
              projectname: values?.[4],
              model: JSON.parse(String(values?.[5])),
              isrunning: false,
              slidewindow: 0,
              lastupdated: new Date("2026-05-12T00:00:00.000Z")
            }
          ],
          rowCount: 1
        } as never;
      }

      if (/DELETE FROM sessiontoken/i.test(text)) {
        return { rows: [], rowCount: 0 } as never;
      }

      if (/INSERT INTO sessiontoken/i.test(text)) {
        return {
          rows: [
            {
              token: values?.[0],
              createdat: new Date(String(values?.[1])),
              sessionid: values?.[2]
            }
          ],
          rowCount: 1
        } as never;
      }

      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };
}

function createDatabaseWithExistingSession(input: { projectName: string; sessionid: string }): NDXDatabase {
  const tokens = new Map<string, { sessionid: string; createdat: Date }>();
  let slidewindow = 0;
  return {
    async query(text, values) {
      if (/FROM users/i.test(text)) {
        return {
          rows: [{ userid: "ndev", created: new Date("2026-05-12T00:00:00.000Z") }],
          rowCount: 1
        } as never;
      }

      if (/FROM "session"/i.test(text) && /WHERE sessionid = \$1/i.test(text)) {
        return {
          rows: [
            {
              sessionid: values?.[0],
              userid: "ndev",
              title: "기존 세션",
              mode: "none",
              projectname: input.projectName,
              model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 },
              isrunning: false,
              slidewindow,
              lastupdated: new Date("2026-05-12T00:00:00.000Z")
            }
          ],
          rowCount: 1
        } as never;
      }

      if (/DELETE FROM sessiontoken/i.test(text)) {
        return { rows: [], rowCount: 0 } as never;
      }

      if (/INSERT INTO sessiontoken/i.test(text)) {
        tokens.set(String(values?.[0]), { sessionid: String(values?.[2]), createdat: new Date(String(values?.[1])) });
        return {
          rows: [
            {
              token: values?.[0],
              createdat: new Date(String(values?.[1])),
              sessionid: values?.[2]
            }
          ],
          rowCount: 1
        } as never;
      }

      if (/FROM sessiontoken/i.test(text) && /JOIN "session"/i.test(text)) {
        const token = tokens.get(String(values?.[0]));
        return {
          rows: token
            ? [{
              token: values?.[0],
              createdat: token.createdat,
              sessionid: token.sessionid,
              userid: "ndev",
              projectname: input.projectName
            }]
            : [],
          rowCount: token ? 1 : 0
        } as never;
      }

      if (/UPDATE "session"/i.test(text) && /slidewindow = \$2/i.test(text)) {
        slidewindow = Number(values?.[1]);
        return {
          rows: [
            {
              sessionid: values?.[0],
              userid: "ndev",
              title: "기존 세션",
              mode: "none",
              projectname: input.projectName,
              model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 },
              isrunning: false,
              turnphase: "idle",
              interruptrequested: false,
              interruptrequestedat: null,
              interruptcompletedat: null,
              slidewindow,
              runtimedata: {},
              lastupdated: new Date("2026-05-12T00:00:01.000Z")
            }
          ],
          rowCount: 1
        } as never;
      }

      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };
}

async function closeServer(server: http.Server) {
  if (!server.listening) {
    return;
  }

  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  server.closeAllConnections?.();
  await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
}

function closeSocketServer(socketServer: ReturnType<typeof attachSessionSocketServer>) {
  for (const client of socketServer.clients) {
    client.terminate();
  }
  socketServer.close();
}

async function listenOnRandomPort(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

function waitForMessages(messages: Buffer[], count: number) {
  if (messages.length >= count) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (messages.length >= count) {
        resolve();
      } else if (Date.now() - startedAt > 2_000) {
        reject(new Error(`Timed out waiting for ${count} messages; received ${messages.length}: ${messages.map((message) => message.toString()).join("\n")}`));
      } else {
        setTimeout(check, 5);
      }
    };
    check();
  });
}

async function createWorkspaceProjectPath() {
  const workspace = path.join(os.tmpdir(), "workspace");
  await fs.mkdir(workspace, { recursive: true });
  return fs.mkdtemp(path.join(workspace, "ndx-session-project-"));
}

async function assertNoProjectIdFile(projectPath: string) {
  await assert.rejects(
    () => fs.stat(path.join(projectPath, ".ndx", ".projectid")),
    (error) => (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

test("session websocket requires clientid during upgrade", async () => {
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabase(),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);

    const socket = new WebSocket(`ws://127.0.0.1:${port}/session`);
    const [error] = (await once(socket, "error")) as [Error];

    assert.match(error.message, /Unexpected server response: 400/);
    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
  }
});

test("session websocket allows concurrent connections with the same clientid", async () => {
  const clientid = "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5";
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabase(),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const first = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=${clientid}`);
    await once(first, "open");

    const second = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=${clientid}`);
    await once(second, "open");

    assert.equal(first.readyState, WebSocket.OPEN);
    assert.equal(second.readyState, WebSocket.OPEN);
    first.close();
    second.close();
    await Promise.all([once(first, "close"), once(second, "close")]);
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
  }
});

test("session route health is served from the agent server surface", async () => {
  const app = express();
  attachSessionRoutes(app);

  const response = await request(app).get("/api/session/health").expect(200);

  assert.equal(response.headers["access-control-allow-origin"], "*");
  assert.deepEqual(response.body, {
    status: "ok",
    service: "agent",
    surface: "session"
  });
});

test("agent server singleton lock rejects a second live instance", async () => {
  const lockDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-lock-"));
  const lockPath = path.join(lockDirectory, "session.lock");
  const release = acquireAgentServerInstanceLock(lockPath);

  try {
    assert.throws(() => acquireAgentServerInstanceLock(lockPath), /already running/);
  } finally {
    release();
    await fs.rm(lockDirectory, { recursive: true, force: true });
  }
});

test("agent server singleton lock replaces a same-pid stale lock from an older process start", async () => {
  const lockDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-session-lock-"));
  const lockPath = path.join(lockDirectory, "session.lock");
  await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, created: new Date(Date.now() - ((process.uptime() + 10) * 1000)).toISOString() }));

  const release = acquireAgentServerInstanceLock(lockPath);

  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const lock = JSON.parse(raw) as { pid?: unknown };
    assert.equal(lock.pid, process.pid);
  } finally {
    release();
    await fs.rm(lockDirectory, { recursive: true, force: true });
  }
});

test("session websocket forces account selection before project negotiation", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabase(),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);

    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    assert.equal(JSON.parse(messages[0].toString()).type, "account.selection.required");

    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 2);
    const forced = JSON.parse(messages[1].toString()) as { type: string; error: string };
    assert.equal(forced.type, "account.selection.required");
    assert.match(forced.error, /account selection is required/i);

    socket.send(JSON.stringify({ type: "account.select", userid: "ndev" }));
    await waitForMessages(messages, 4);
    assert.equal(JSON.parse(messages[2].toString()).type, "account.selected");
    assert.equal(JSON.parse(messages[3].toString()).type, "project.negotiation.required");

    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 6);
    const negotiated = JSON.parse(messages[4].toString()) as { type: string; projectName: string };
    assert.equal(negotiated.type, "project.negotiated");
    assert.equal(negotiated.projectName, projectName);
    const ready = JSON.parse(messages[5].toString()) as { type: string; userid: string; projectName: string };
    assert.equal(ready.type, "session.ready");
    assert.equal(ready.userid, "ndev");
    assert.equal(ready.projectName, negotiated.projectName);
    await assertNoProjectIdFile(projectPath);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket creates a new session after account and project negotiation", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabaseWithSessionInsert(),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "account.select", userid: "ndev" }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 5);
    const ready = JSON.parse(messages[4].toString()) as { type: string; projectName: string };
    assert.equal(ready.type, "session.ready");

    socket.send(
      JSON.stringify({
        type: "session.create",
        model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 }
      })
    );
    await waitForMessages(messages, 7);
    const created = JSON.parse(messages[5].toString()) as {
      type: string;
      connectionToken: string;
      sessionid: string;
      userid: string;
      projectname: string;
      path: string;
      model: { model: string };
    };

    assert.equal(created.type, "session.created");
    assert.match(created.connectionToken, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(created.sessionid, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(created.userid, "ndev");
    assert.equal(created.projectname, ready.projectName);
    assert.equal(created.path, projectPath);
    assert.equal(created.model.model, "qwen3.6-35b.mm");
    const changed = JSON.parse(messages[6].toString()) as { type: string; userid: string; projectname: string };
    assert.equal(changed.type, "session.list.changed");
    assert.equal(changed.userid, "ndev");
    assert.equal(changed.projectname, ready.projectName);
    await assertNoProjectIdFile(projectPath);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket lists skills for the negotiated project", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const skillPath = path.join(projectPath, ".ndx", "skills", "demo", "SKILL.md");
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabase(),
    heartbeatIntervalMs: 60_000
  });

  try {
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, "---\nname: demo\ndescription: demo skill\n---\nUse demo workflow.\n", "utf8");
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "account.select", userid: "ndev" }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 5);
    socket.send(JSON.stringify({ type: "session.skill.list" }));
    await waitForMessages(messages, 6);

    const result = JSON.parse(messages[5].toString()) as { type: string; skills: Array<{ name: string; description: string; scope: string }> };
    assert.equal(result.type, "session.skill.list.result");
    assert.deepEqual(result.skills, [{ name: "demo", description: "demo skill", scope: "repo" }]);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket creates a new session for the explicit project in the create message", async () => {
  const negotiatedProjectPath = await createWorkspaceProjectPath();
  const targetProjectPath = await createWorkspaceProjectPath();
  const negotiatedProjectName = path.basename(negotiatedProjectPath);
  const targetProjectName = path.basename(targetProjectPath);
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabaseWithSessionInsert(),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "account.select", userid: "ndev" }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({ type: "project.configure", projectName: negotiatedProjectName }));
    await waitForMessages(messages, 5);
    const ready = JSON.parse(messages[4].toString()) as { type: string; projectName: string };
    assert.equal(ready.type, "session.ready");
    assert.notEqual(ready.projectName, targetProjectName);

    socket.send(
      JSON.stringify({
        type: "session.create",
        userid: "ndev",
        projectName: targetProjectName,
        model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 }
      })
    );
    await waitForMessages(messages, 7);
    const created = JSON.parse(messages[5].toString()) as { type: string; userid: string; projectname: string; path: string };
    const changed = JSON.parse(messages[6].toString()) as { type: string; userid: string; projectname: string };

    assert.equal(created.type, "session.created");
    assert.equal(created.userid, "ndev");
    assert.equal(created.projectname, targetProjectName);
    assert.equal(created.path, targetProjectPath);
    assert.equal(changed.type, "session.list.changed");
    assert.equal(changed.projectname, targetProjectName);
    await assertNoProjectIdFile(negotiatedProjectPath);
    await assertNoProjectIdFile(targetProjectPath);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(negotiatedProjectPath, { recursive: true, force: true });
    await fs.rm(targetProjectPath, { recursive: true, force: true });
  }
});

test("session websocket routes token input before project negotiation", async () => {
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabase(),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "account.select", userid: "ndev" }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({ type: "session.input", connectionToken: "missing-token", text: "hello" }));
    await waitForMessages(messages, 4);

    const rejected = JSON.parse(messages[3].toString()) as { type: string; error: string };
    assert.equal(rejected.type, "protocol.error");
    assert.match(rejected.error, /connection token is missing or expired/i);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
  }
});

test("session websocket attaches an existing session and issues a connection token before project ready", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const sessionid = "019e2783-4512-70d0-b75b-40200d1d4fe8";
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabaseWithExistingSession({ projectName, sessionid }),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    assert.equal(JSON.parse(messages[0].toString()).type, "account.selection.required");
    socket.send(JSON.stringify({ type: "session.attach", userid: "ndev", projectName, sessionid }));
    await waitForMessages(messages, 2);
    const attached = JSON.parse(messages[1].toString()) as {
      type: string;
      connectionToken: string;
      sessionid: string;
      userid: string;
      projectName: string;
    };

    assert.equal(attached.type, "session.attached");
    assert.match(attached.connectionToken, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(attached.sessionid, sessionid);
    assert.equal(attached.userid, "ndev");
    assert.equal(attached.projectName, projectName);

    socket.send(JSON.stringify({ type: "session.slidewindow.update", connectionToken: attached.connectionToken, slidewindow: 12 }));
    await waitForMessages(messages, 4);
    const updated = JSON.parse(messages[2].toString()) as { type: string; sessionid: string; slidewindow: number };
    const changed = JSON.parse(messages[3].toString()) as { type: string; projectname: string };
    assert.equal(updated.type, "session.slidewindow.updated");
    assert.equal(updated.sessionid, sessionid);
    assert.equal(updated.slidewindow, 12);
    assert.equal(changed.type, "session.list.changed");
    assert.equal(changed.projectname, projectName);
    await assertNoProjectIdFile(projectPath);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket rejects attachments unsupported by the selected model", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const sessionid = "019e2783-4512-70d0-b75b-40200d1d4fe8";
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabaseWithExistingSession({ projectName, sessionid }),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "account.select", userid: "ndev" }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({ type: "session.attach", userid: "ndev", projectName, sessionid }));
    await waitForMessages(messages, 4);
    const attached = JSON.parse(messages[3].toString()) as { type: string; connectionToken: string };
    assert.equal(attached.type, "session.attached");

    socket.send(JSON.stringify({
      type: "session.input",
      connectionToken: attached.connectionToken,
      text: "이미지 확인",
      model: { type: "openai", model: "minimax-m2.7", url: "", token: "", contextsize: 196_000, modalities: ["text"] },
      attachments: [{ name: "screen.png", mimeType: "image/png", size: 3, data: "AQID" }]
    }));
    await waitForMessages(messages, 5);

    const rejected = JSON.parse(messages[4].toString()) as { type: string; error: string };
    assert.equal(rejected.type, "protocol.error");
    assert.match(rejected.error, /image modality support/);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("socket send writes the provided message unchanged", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const sent: string[] = [];

  try {
    await sendJson(
      {
        clientid: "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5",
        socket: {
          readyState: WebSocket.OPEN,
          send(data: string) {
            sent.push(data);
          }
        } as never,
        userid: "ndev",
        projectName: "memory-project",
        grants: new Map(),
        missedPings: 0,
        pongSinceLastPing: true
      },
      { type: "session.ready", projectName: "message-project" }
    );

    assert.equal(JSON.parse(sent[0]).projectName, "message-project");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});
