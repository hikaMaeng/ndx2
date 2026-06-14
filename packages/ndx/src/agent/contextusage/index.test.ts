import assert from "node:assert/strict";
import test from "node:test";
import { calculateContextUsage, calculateDetailedContextUsage, estimateContextTokens, judgeContextAvailability } from "./index.js";

test("calculateContextUsage approximates tokens from UTF-8 bytes over messages and in-flight content", () => {
  const usage = calculateContextUsage(
    [
      { role: "system", content: "abc" },
      { role: "user", content: "de" }
    ],
    10,
    "fg"
  );

  assert.deepEqual(usage, {
    tokens: 6,
    messageTokens: 6,
    toolDefinitionTokens: 0,
    percent: 60,
    contextsize: 10
  });
});

test("calculateContextUsage includes tool definition tokens separately", () => {
  const usage = calculateContextUsage([{ role: "user", content: "abcd" }], 100, "", [{ type: "function", name: "now" }]);

  assert.equal(usage.messageTokens, 3);
  assert.ok(usage.toolDefinitionTokens > 0);
  assert.equal(usage.tokens, usage.messageTokens + usage.toolDefinitionTokens);
});

test("calculateContextUsage counts serialized tool continuation messages", () => {
  const usage = calculateContextUsage(
    [
      { role: "user", content: "파일을 읽어라" },
      { type: "function_call", call_id: "call_1", name: "read_file", arguments: JSON.stringify({ path: "a.ts" }) },
      { type: "function_call_output", call_id: "call_1", output: "export const value = 1;" }
    ],
    1000
  );

  assert.ok(usage.tokens > estimateContextTokens("파일을 읽어라export const value = 1;"));
});

test("calculateContextUsage uses matching previous prefix preview for stable prefix tokens", () => {
  const messages = [
    { role: "system", content: "developer" },
    { role: "user", content: "prelude" },
    { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" }
  ];
  const preview = ["system:\ndeveloper", "user:\nprelude"];
  const usage = calculateContextUsage(messages, 1000, "", [], preview);
  const expected = preview.reduce((total, item) => total + estimateContextTokens(item), 0) + estimateContextTokens("assistant function_call read_file (call_1):\n{}");

  assert.equal(usage.tokens, expected);
});

test("calculateContextUsage ignores stale previous prefix preview", () => {
  const messages = [
    { role: "system", content: "developer changed" },
    { role: "user", content: "prelude" }
  ];
  const usage = calculateContextUsage(messages, 1000, "", [], ["system:\ndeveloper", "user:\nprelude"]);

  assert.equal(usage.tokens, estimateContextTokens("system:\ndeveloper changed") + estimateContextTokens("user:\nprelude"));
});

test("calculateDetailedContextUsage breaks down developer, user, history, tools, and remaining tokens", () => {
  const usage = calculateDetailedContextUsage(
    [
      { role: "system", content: "abcd" },
      { role: "user", content: "efgh" },
      { role: "assistant", content: "ijkl" }
    ],
    20,
    "mnop",
    [{ type: "function", name: "now" }]
  );

  assert.equal(usage.messageTokens, 11);
  assert.equal(usage.parts?.find((part) => part.key === "developer")?.tokens, 3);
  assert.equal(usage.parts?.find((part) => part.key === "user")?.tokens, 3);
  assert.equal(usage.parts?.find((part) => part.key === "history")?.tokens, 5);
  assert.equal(usage.parts?.find((part) => part.key === "toolDefinitions")?.tokens, usage.toolDefinitionTokens);
  assert.equal(usage.parts?.find((part) => part.key === "remaining")?.tokens, Math.max(0, usage.contextsize - usage.tokens));
});

test("estimateContextTokens weights non-ASCII text by UTF-8 byte length", () => {
  assert.equal(estimateContextTokens("abcd"), 1);
  assert.equal(estimateContextTokens("한글"), 2);
});

test("judgeContextAvailability reserves output and average turn tokens", () => {
  const enough = judgeContextAvailability({ tokens: 1000, contextsize: 10000, percent: 10 }, { averageTurnTokens: 1000, outputReserveTokens: 1000 });
  assert.equal(enough.shouldCompact, false);
  assert.equal(enough.remainingTokens, 9000);

  const tight = judgeContextAvailability({ tokens: 8500, contextsize: 10000, percent: 85 }, { averageTurnTokens: 1000, outputReserveTokens: 1000 });
  assert.equal(tight.shouldCompact, true);
  assert.match(tight.reason, /remaining context/u);
});

test("judgeContextAvailability caps unusually large observed average turn budgets", () => {
  const availability = judgeContextAvailability(
    { tokens: 100_000, contextsize: 262_144, percent: 38.15 },
    { averageTurnTokens: 140_000, outputReserveTokens: 8192 }
  );

  assert.equal(availability.averageTurnTokens, Math.ceil(262_144 * 0.12));
  assert.equal(availability.shouldCompact, false);
});
