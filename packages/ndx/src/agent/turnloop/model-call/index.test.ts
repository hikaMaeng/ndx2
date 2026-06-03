import assert from "node:assert/strict";
import test from "node:test";
import { createNDXAgentResourceResolver, NDX_AGENT_RESOURCE } from "../../../common/resource/index.js";
import { NDX_TURN_EVENT } from "../../../common/protocol/index.js";
import { startModelProgressNotice } from "./index.js";
import type { NDXContextUsage } from "../../contextusage/index.js";
import type { NDXActiveTurnPipelineState, NDXTurnLoopEvent } from "../types.js";

test("model progress notice emits periodic socket-side turn events without ending the request", async () => {
  const events: NDXTurnLoopEvent[] = [];
  const contextUsage: NDXContextUsage = { tokens: 10, messageTokens: 10, toolDefinitionTokens: 0, contextsize: 1000, percent: 1 };
  const resource = createNDXAgentResourceResolver();
  const state = {
    database: { logger: { warn() {} } },
    runningSession: { sessionid: "018f0000-0000-7000-8000-000000000000" },
    events: {
      async onEvent(event: NDXTurnLoopEvent) {
        events.push(event);
      }
    },
    t: (key: typeof NDX_AGENT_RESOURCE[keyof typeof NDX_AGENT_RESOURCE], values?: Record<string, string | number>) => resource(key, { language: "ko", values })
  } as unknown as NDXActiveTurnPipelineState;

  const stop = startModelProgressNotice(state, 1, Date.now() - 20, contextUsage, 20);
  await new Promise((resolve) => setTimeout(resolve, 55));
  stop();
  const countAfterStop = events.length;
  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.ok(countAfterStop >= 2);
  assert.equal(events.length, countAfterStop);
  assert.equal(events[0]?.type, NDX_TURN_EVENT.ModelProgress);
  assert.equal(events[0]?.iteration, 1);
  assert.equal(events[0]?.intervalMs, 20);
  assert.equal(events[0]?.contextUsage, contextUsage);
  assert.match(events[0]?.message ?? "", /인터럽트/);
});
