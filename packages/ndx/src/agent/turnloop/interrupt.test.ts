import assert from "node:assert/strict";
import test from "node:test";
import { turnInterruptPolicy } from "./interruptPolicy.js";

test("turn interrupt policy separates model, tool, and checkpoint-only phases", () => {
  assert.deepEqual(turnInterruptPolicy("model_request"), {
    phase: "model_request",
    action: "abort_model_request",
    abortSignal: true
  });
  assert.deepEqual(turnInterruptPolicy("tool_execution"), {
    phase: "tool_execution",
    action: "abort_tool_execution",
    abortSignal: true
  });
  assert.deepEqual(turnInterruptPolicy("context"), {
    phase: "context",
    action: "checkpoint_only",
    abortSignal: false
  });
  assert.deepEqual(turnInterruptPolicy("finalizing"), {
    phase: "finalizing",
    action: "checkpoint_only",
    abortSignal: false
  });
});
