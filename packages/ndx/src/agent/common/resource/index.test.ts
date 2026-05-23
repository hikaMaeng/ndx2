import assert from "node:assert/strict";
import test from "node:test";
import {
  NDX_AGENT_RESOURCE,
  createNDXAgentResourceResolver,
  normalizeNDXAgentLanguage
} from "./index.js";

test("normalizeNDXAgentLanguage accepts exact and region-tagged languages", () => {
  assert.equal(normalizeNDXAgentLanguage("ko"), "ko");
  assert.equal(normalizeNDXAgentLanguage("ko-KR"), "ko");
  assert.equal(normalizeNDXAgentLanguage("fr"), "en");
});

test("createNDXAgentResourceResolver formats runtime resource overrides", () => {
  const resource = createNDXAgentResourceResolver({
    ko: {
      [NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_EMPTY_RESPONSE_MESSAGE]: "한도 {maxIterations}"
    }
  });

  assert.equal(resource(NDX_AGENT_RESOURCE.TURN_ITERATION_LIMIT_EMPTY_RESPONSE_MESSAGE, { language: "ko", values: { maxIterations: 3 } }), "한도 3");
  assert.equal(resource(NDX_AGENT_RESOURCE.PROTOCOL_INVALID_JSON_ERROR), "Message must be JSON.");
});

