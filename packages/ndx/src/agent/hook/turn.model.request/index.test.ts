import assert from "node:assert/strict";
import test from "node:test";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { snapshotModelRequestStablePrefix } from "../base/prefixDrift/index.js";
import { createNDXHookRuntime } from "../index.js";
import { runTurnModelRequestHook, systemHooks } from "./index.js";
import type { NDXDatabase, NDXSessionRow } from "../../session/types.js";

const database: NDXDatabase = {
  async query() {
    return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
  },
  async close() {}
};

const session: NDXSessionRow = {
  sessionid: "session-1",
  userid: "ndev",
  title: "title",
  lastupdated: new Date(0),
  mode: "none",
  path: "/workspace",
  projectname: "project-1",
  model: { type: "openai", model: "test-model", url: "http://model", token: "token", contextsize: 1000 },
  isrunning: true,
  turnphase: "context",
  interruptrequested: false,
  interruptrequestedat: null,
  interruptcompletedat: null
};

test("model request system hook reports prefix drift without stopping the turn", async () => {
  const result = await runTurnModelRequestHook(createNDXHookRuntime({ [NDX_TURN_EVENT.ModelRequest]: systemHooks }, {}), {
    database,
    session,
    requestText: "hello",
    userHome: "/home/ndx",
    projectHome: "/workspace",
    iteration: 2,
    previousModelRequestStablePrefix: snapshotModelRequestStablePrefix([
      { role: "system", content: "developer" },
      { role: "user", content: "stable prelude" },
      { role: "user", content: "request" }
    ]),
    messages: [
      { role: "system", content: "developer" },
      { role: "user", content: "changed prelude" },
      { role: "user", content: "request" }
    ]
  });

  assert.equal(result.result.effect.stopTurn, false);
  assert.deepEqual(result.result.effect.prefixDrifts?.map((drift) => ({
    message: drift.message,
    messageIndex: drift.messageIndex
  })), [{ message: "model request changed stable model-request prefix message 2.", messageIndex: 1 }]);
});
