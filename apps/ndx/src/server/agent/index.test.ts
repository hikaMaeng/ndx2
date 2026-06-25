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
import { createSessionRequestQueueBridge, sessionGrantOwnerTargets, sessionSidebarItemSocketMessage, sessionSocketMessagesFromTurnLoopEvent } from "./connection.js";
import { sendJson } from "./sendJson.js";
import type { NDXDatabase } from "ndx/agent/init";
import type { NDXSessionRow } from "ndx/agent/session";
import { NDX_SESSION_EVENT, NDX_SESSION_READY, NDX_SESSION_REQUEST_QUEUE_CHANGED, NDX_SESSION_SIDEBAR_ITEM, NDX_TURN_EVENT } from "ndx/common";
import type { NDXSessionEventMessage } from "ndx/common";

process.env.NDX_CONTAINER_ROOT = os.tmpdir();
process.env.NDX_ROOT = os.tmpdir();

const queueModel = { type: "openai" as const, provider: "local", model: "queue-default", url: "http://localhost", token: "", contextsize: 100_000, modalities: ["text" as const] };

function createDatabase(): NDXDatabase {
  return {
    async query(text, values) {
      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };
}

function createDatabaseWithSessionInsert(): NDXDatabase {
  const sessions = new Map<string, Record<string, unknown>>();
  return {
    async query(text, values) {
      if (/INSERT INTO "session"/i.test(text)) {
        const session = {
          sessionid: values?.[0],
          title: values?.[1],
          mode: values?.[2],
          projectname: values?.[3],
          parentsessionid: values?.[4] ?? values?.[0],
          rootsessionid: values?.[5],
          createdbytoolcallid: values?.[6] ?? null,
          createdbytoolname: values?.[7] ?? null,
          subagenttype: values?.[8] ?? null,
          subagentconfig: JSON.parse(String(values?.[9] ?? "{}")),
          subagentstatus: values?.[10] ?? "none",
          model: JSON.parse(String(values?.[11])),
          isrunning: false,
          turnphase: "idle",
          interruptrequested: false,
          interruptrequestedat: null,
          interruptcompletedat: null,
          runtimedata: {},
          lastupdated: new Date("2026-05-12T00:00:00.000Z")
        };
        sessions.set(String(session.sessionid), session);
        return {
          rows: [session],
          rowCount: 1
        } as never;
      }

      if (/FROM "session"/i.test(text) && /WHERE sessionid = \$1/i.test(text)) {
        const session = sessions.get(String(values?.[0]));
        return { rows: session ? [session] : [], rowCount: session ? 1 : 0 } as never;
      }

      return { rows: [], rowCount: 0 } as never;
    },
    async close() {}
  };
}

function createDatabaseWithExistingSession(input: { projectName: string; sessionid: string; isrunning?: boolean }): NDXDatabase {
  return {
    async query(text, values) {
      if (/FROM "session"/i.test(text) && /WHERE sessionid = \$1/i.test(text)) {
        return {
          rows: [
            {
              sessionid: values?.[0],
              title: "기존 세션",
              mode: "none",
              projectname: input.projectName,
              parentsessionid: values?.[0],
              rootsessionid: values?.[0],
              createdbytoolcallid: null,
              createdbytoolname: null,
              subagenttype: null,
              subagentconfig: {},
              subagentstatus: "none",
              model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 },
              isrunning: input.isrunning ?? false,
              turnphase: "idle",
              interruptrequested: false,
              interruptrequestedat: null,
              interruptcompletedat: null,
              runtimedata: {},
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

test("session websocket negotiates project before ready", async () => {
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
    assert.equal(JSON.parse(messages[0].toString()).type, "project.negotiation.required");

    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 3);
    const negotiated = JSON.parse(messages[1].toString()) as { type: string; projectName: string };
    assert.equal(negotiated.type, "project.negotiated");
    assert.equal(negotiated.projectName, projectName);
    const ready = JSON.parse(messages[2].toString()) as { type: string; projectName: string };
    assert.equal(ready.type, "session.ready");
    assert.equal(ready.projectName, negotiated.projectName);
    await assertNoProjectIdFile(projectPath);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket creates a new session after project negotiation", async () => {
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
    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 3);
    const ready = JSON.parse(messages[2].toString()) as { type: string; projectName: string };
    assert.equal(ready.type, "session.ready");

    socket.send(
      JSON.stringify({
        type: "session.create",
        model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 },
        initialInput: { text: "첫 요청 제목" }
      })
    );
    await waitForMessages(messages, 5);
    const created = JSON.parse(messages[3].toString()) as {
      type: string;
      initialInputAccepted?: boolean;
      sessionid: string;
      title: string;
      projectname: string;
      path: string;
      model: { model: string };
    };

    assert.equal(created.type, "session.created");
    assert.equal(created.initialInputAccepted, true);
    assert.match(created.sessionid, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(created.title, "첫 요청 제목");
    assert.equal(created.projectname, ready.projectName);
    assert.equal(created.path, projectPath);
    assert.equal(created.model.model, "qwen3.6-35b.mm");
    const changed = JSON.parse(messages[4].toString()) as { type: string; projectname: string };
    assert.equal(changed.type, "session.list.changed");
    assert.equal(changed.projectname, ready.projectName);
    await assertNoProjectIdFile(projectPath);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket rejects idle interrupts without recording interrupt events", async () => {
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
    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({
      type: "session.create",
      model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 }
    }));
    await waitForMessages(messages, 5);
    const created = JSON.parse(messages[3].toString()) as { type: string; sessionid: string };
    assert.equal(created.type, "session.created");

    socket.send(JSON.stringify({ type: "session.interrupt", sessionid: created.sessionid }));
    await waitForMessages(messages, 6);
    const rejected = JSON.parse(messages[5].toString()) as { type: string; error: string };
    assert.equal(rejected.type, "protocol.error");
    assert.match(rejected.error, /실행 중이 아닙니다/);
    assert.equal(messages.some((message) => message.toString().includes("interrupt_started")), false);

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
    socket.send(JSON.stringify({ type: "project.configure", projectName }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({ type: "session.skill.list" }));
    await waitForMessages(messages, 4);

    const result = JSON.parse(messages[3].toString()) as { type: string; projectName: string; skills: Array<{ name: string; description: string; scope: string }> };
    assert.equal(result.type, "session.skill.list.result");
    assert.equal(result.projectName, projectName);
    assert.deepEqual(result.skills, [{ name: "demo", description: "demo skill", scope: "repo" }]);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket lists skills for a draft project target", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const skillPath = path.join(projectPath, ".ndx", "skills", "draft-demo", "SKILL.md");
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabase(),
    heartbeatIntervalMs: 60_000
  });

  try {
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, "---\nname: draft-demo\ndescription: draft project skill\n---\nUse draft workflow.\n", "utf8");
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf6`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "session.skill.list", projectName }));
    await waitForMessages(messages, 2);

    const result = JSON.parse(messages[1].toString()) as { type: string; projectName: string; skills: Array<{ name: string; description: string; scope: string }> };
    assert.equal(result.type, "session.skill.list.result");
    assert.equal(result.projectName, projectName);
    assert.deepEqual(result.skills, [{ name: "draft-demo", description: "draft project skill", scope: "repo" }]);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session sidebar turn events map to dedicated socket messages", () => {
  const message = sessionSidebarItemSocketMessage(
    { sessionid: "session-1" },
    {
      type: NDX_TURN_EVENT.SidebarItem,
      iteration: 2,
      tool: "loadSkill",
      callId: "call-1",
      item: {
        group: { id: "skills", title: "스킬" },
        key: "skill:demo:/project/.ndx/skills/demo/SKILL.md",
        title: "demo",
        body: "/project/.ndx/skills/demo/SKILL.md",
        kind: "skill"
      },
      contextUsage: { tokens: 0, messageTokens: 0, toolDefinitionTokens: 0, percent: 0, contextsize: 0 }
    }
  );

  assert.equal(message.type, NDX_SESSION_SIDEBAR_ITEM);
  assert.equal(message.sessionid, "session-1");
  assert.equal(message.tool, "loadSkill");
  assert.equal(message.callId, "call-1");
  assert.deepEqual(message.item.group, { id: "skills", title: "스킬" });
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
    socket.send(JSON.stringify({ type: "project.configure", projectName: negotiatedProjectName }));
    await waitForMessages(messages, 3);
    const ready = JSON.parse(messages[2].toString()) as { type: string; projectName: string };
    assert.equal(ready.type, "session.ready");
    assert.notEqual(ready.projectName, targetProjectName);

    socket.send(
      JSON.stringify({
        type: "session.create",
        projectName: targetProjectName,
        model: { type: "openai", model: "qwen3.6-35b.mm", url: "", token: "", contextsize: 100_000 }
      })
    );
    await waitForMessages(messages, 4);
    const created = JSON.parse(messages[3].toString()) as { type: string; projectname: string; path: string };

    assert.equal(created.type, "session.created");
    assert.equal(created.projectname, targetProjectName);
    assert.equal(created.path, targetProjectPath);
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

test("session websocket rejects unattached session input before project negotiation", async () => {
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
    socket.send(JSON.stringify({ type: "session.input", sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8", text: "hello" }));
    await waitForMessages(messages, 2);

    const rejected = JSON.parse(messages[1].toString()) as { type: string; error: string };
    assert.equal(rejected.type, "protocol.error");
    assert.match(rejected.error, /session is not attached to this socket/i);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
  }
});

test("session websocket attaches an existing session before project ready without issuing a token", async () => {
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
    assert.equal(JSON.parse(messages[0].toString()).type, "project.negotiation.required");
    socket.send(JSON.stringify({ type: "session.attach", projectName, sessionid }));
    await waitForMessages(messages, 2);
    const attached = JSON.parse(messages[1].toString()) as {
      type: string;
      sessionid: string;
      projectName: string;
    };

    assert.equal(attached.type, "session.attached");
    assert.equal(attached.sessionid, sessionid);
    assert.equal(attached.projectName, projectName);

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
    socket.send(JSON.stringify({ type: "session.attach", projectName, sessionid }));
    await waitForMessages(messages, 2);
    const attached = JSON.parse(messages[1].toString()) as { type: string; sessionid: string };
    assert.equal(attached.type, "session.attached");

    socket.send(JSON.stringify({
      type: "session.input",
      sessionid: attached.sessionid,
      text: "이미지 확인",
      model: { type: "openai", model: "minimax-m2.7", url: "", token: "", contextsize: 196_000, modalities: ["text"] },
      attachments: [{ name: "screen.png", mimeType: "image/png", size: 3, data: "AQID" }]
    }));
    await waitForMessages(messages, 4);

    const rejected = JSON.parse(messages[3].toString()) as { type: string; error: string };
    assert.equal(rejected.type, "protocol.error");
    assert.match(rejected.error, /image modality support/);

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket assigns session model to queued requests when client omits model", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const sessionid = "019e2783-4512-70d0-b75b-40200d1d4fe9";
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabaseWithExistingSession({ projectName, sessionid, isrunning: true }),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf6`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "session.attach", projectName, sessionid }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({ type: "session.request_queue.add", sessionid, text: "큐 요청" }));
    await waitForMessages(messages, 4);

    const changed = JSON.parse(messages[3]!.toString()) as { type: string; items: Array<{ text: string; model: { model: string } }> };
    assert.equal(changed.type, NDX_SESSION_REQUEST_QUEUE_CHANGED);
    assert.equal(changed.items[0]?.text, "큐 요청");
    assert.equal(changed.items[0]?.model.model, "qwen3.6-35b.mm");

    socket.terminate();
  } finally {
    closeSocketServer(socketServer);
    await closeServer(server);
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("session websocket queue update replaces model and removes unsupported kept attachments", async () => {
  const projectPath = await createWorkspaceProjectPath();
  const projectName = path.basename(projectPath);
  const sessionid = "019e2783-4512-70d0-b75b-40200d1d4fea";
  const server = http.createServer();
  const socketServer = attachSessionSocketServer(server, {
    database: createDatabaseWithExistingSession({ projectName, sessionid, isrunning: true }),
    heartbeatIntervalMs: 60_000
  });

  try {
    const port = await listenOnRandomPort(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/session?clientid=018f90d0-75cb-7d37-bfc9-6f9d0bb60cf7`);
    const messages: Buffer[] = [];
    socket.on("message", (data) => {
      messages.push(Buffer.from(data as Buffer));
    });
    await once(socket, "open");

    const imageModel = { type: "openai", model: "image-model", url: "", token: "", contextsize: 100_000, modalities: ["text", "image"] };
    const textModel = { type: "openai", model: "text-model", url: "", token: "", contextsize: 100_000, modalities: ["text"] };
    await waitForMessages(messages, 1);
    socket.send(JSON.stringify({ type: "session.attach", projectName, sessionid }));
    await waitForMessages(messages, 3);
    socket.send(JSON.stringify({
      type: "session.request_queue.add",
      sessionid,
      text: "이미지 요청",
      model: imageModel,
      attachments: [{ name: "screen.png", mimeType: "image/png", size: 3, data: "AQID" }]
    }));
    await waitForMessages(messages, 4);
    const added = JSON.parse(messages[3]!.toString()) as { items: Array<{ itemid: string; attachments: Array<{ attachmentid: string }> }> };
    const itemid = added.items[0]!.itemid;
    const attachmentid = added.items[0]!.attachments[0]!.attachmentid;

    socket.send(JSON.stringify({
      type: "session.request_queue.update",
      sessionid,
      itemid,
      text: "텍스트 요청",
      model: textModel,
      keepAttachmentIds: [attachmentid]
    }));
    await waitForMessages(messages, 5);

    const changed = JSON.parse(messages[4]!.toString()) as { type: string; items: Array<{ text: string; model: { model: string }; attachments?: unknown[] }> };
    assert.equal(changed.type, NDX_SESSION_REQUEST_QUEUE_CHANGED);
    assert.equal(changed.items[0]?.text, "텍스트 요청");
    assert.equal(changed.items[0]?.model.model, "text-model");
    assert.equal(changed.items[0]?.attachments, undefined);

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
        projectName: "memory-project",
        grants: new Map(),
        missedPings: 0,
        pongSinceLastPing: true
      },
      {
        type: NDX_SESSION_READY,
        clientid: "018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5",
        projectName: "message-project"
      }
    );

    assert.equal(JSON.parse(sent[0]).projectName, "message-project");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
});

test("turn loop socket serialization emits terminal session events for session grants", () => {
  const session = turnEventSessionRow("session-a");
  const messages = sessionSocketMessagesFromTurnLoopEvent({
    type: NDX_TURN_EVENT.TurnEnd,
    iteration: 3,
    session,
    contextUsage: { tokens: 12, messageTokens: 8, toolDefinitionTokens: 4, percent: 1, contextsize: 1000 }
  }, {
    session,
    now: "2026-06-05T00:00:00.000Z",
    timeKey: 123,
    sessionState: { isrunning: false }
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, NDX_SESSION_EVENT);
  assert.equal(messages[0]?.event, NDX_TURN_EVENT.TurnEnd);
  assert.equal(messages[0]?.dataid, "turn-end:session-a:3:123");
  assert.equal((messages[0]?.contents as { kind?: unknown }).kind, "turn_end");
  assert.deepEqual((messages[0] as NDXSessionEventMessage).sessionState, { isrunning: false });
});

test("turn loop socket serialization carries authoritative running state from context", () => {
  const session = turnEventSessionRow("session-a");
  const messages = sessionSocketMessagesFromTurnLoopEvent({
    type: NDX_TURN_EVENT.InputRecorded,
    input: {
      dataid: "input-1",
      sessionid: session.sessionid,
      type: "user",
      contents: { kind: "user_message", text: "요청" },
      createdat: new Date("2026-06-05T00:00:00.000Z")
    },
    contextUsage: { tokens: 12, messageTokens: 8, toolDefinitionTokens: 4, percent: 1, contextsize: 1000 }
  }, {
    session,
    now: "2026-06-05T00:00:00.000Z",
    timeKey: 123,
    sessionState: { isrunning: true }
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, NDX_SESSION_EVENT);
  assert.equal(messages[0]?.event, NDX_TURN_EVENT.InputRecorded);
  assert.deepEqual((messages[0] as NDXSessionEventMessage).sessionState, { isrunning: true });
});

test("turn loop socket serialization emits sidebar items without receiver token fields", () => {
  const session = turnEventSessionRow("session-a");
  const messages = sessionSocketMessagesFromTurnLoopEvent({
    type: NDX_TURN_EVENT.SidebarItem,
    iteration: 1,
    tool: "edit",
    callId: "call-1",
    item: {
      group: { id: "files", title: "Files" },
      key: "file:a.ts",
      title: "a.ts"
    },
    contextUsage: { tokens: 12, messageTokens: 8, toolDefinitionTokens: 4, percent: 1, contextsize: 1000 }
  }, {
    session,
    now: "2026-06-05T00:00:00.000Z",
    timeKey: 123,
    sessionState: { isrunning: true }
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, NDX_SESSION_SIDEBAR_ITEM);
  assert.equal(("connection" + "Token") in (messages[0] ?? {}), false);
});

test("session grant owner routing targets every connected client attached to the session", () => {
  const first = sessionClient("client-a", ["session-a", "session-b"]);
  const second = sessionClient("client-b", ["session-a"]);
  const third = sessionClient("client-c", ["session-c"]);
  const connectedClients = new Map<string, ReturnType<typeof sessionClient>>([
    ["connection-a", first],
    ["connection-b", second],
    ["connection-c", third]
  ]);

  const targets = sessionGrantOwnerTargets(connectedClients, "session-a");

  assert.deepEqual(targets.map((target) => target.client.clientid), ["client-a", "client-b"]);
});

test("session request queue bridge broadcasts changed snapshots", async () => {
  const sessionid = "bridge-session-a";
  const sent: string[] = [];
  const client = {
    ...sessionClient("client-a", [sessionid]),
    socket: {
      readyState: WebSocket.OPEN,
      send(message: string) {
        sent.push(message);
      }
    } as never
  };
  const connectedClients = new Map([["connection-a", client]]);
  const bridge = createSessionRequestQueueBridge(connectedClients, undefined, queueModel);

  const added = await bridge.add({ sessionid, text: "queued by turnplan" });
  await bridge.updateText(sessionid, added.itemid, "changed by turnplan");

  assert.equal(sent.length, 2);
  const last = JSON.parse(sent[1]!) as { type: string; sessionid: string; items: Array<{ text: string }> };
  assert.equal(last.type, NDX_SESSION_REQUEST_QUEUE_CHANGED);
  assert.equal(last.sessionid, sessionid);
  assert.deepEqual(last.items.map((item) => item.text), ["changed by turnplan"]);
});

function turnEventSessionRow(sessionid: string): NDXSessionRow {
  return {
    sessionid,
    title: "test session",
    lastupdated: new Date("2026-06-05T00:00:00.000Z"),
    mode: "none",
    projectname: "project-a",
    path: "/ndx/workspace/project-a",
    parentsessionid: sessionid,
    rootsessionid: sessionid,
    model: { type: "openai", model: "gpt-5", url: "http://localhost", token: "", contextsize: 1000 },
    isrunning: false,
    turnphase: "idle",
    interruptrequested: false,
    interruptrequestedat: null,
    interruptcompletedat: null,
    runtimedata: {}
  };
}

function sessionClient(clientid: string, grants: string[]) {
  return {
    clientid,
    socket: {
      readyState: WebSocket.OPEN,
      send() {}
    } as never,
    projectName: "project-a",
    grants: new Map(grants.map((sessionid) => [sessionid, {
      sessionid,
      projectName: "project-a",
      createdat: new Date("2026-06-05T00:00:00.000Z")
    }])),
    missedPings: 0,
    pongSinceLastPing: true
  };
}
