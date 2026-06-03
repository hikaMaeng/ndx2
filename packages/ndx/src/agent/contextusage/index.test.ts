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
    tokens: 3,
    messageTokens: 3,
    toolDefinitionTokens: 0,
    percent: 30,
    contextsize: 10
  });
});

test("calculateContextUsage includes tool definition tokens separately", () => {
  const usage = calculateContextUsage([{ role: "user", content: "abcd" }], 100, "", [{ type: "function", name: "now" }]);

  assert.equal(usage.messageTokens, 1);
  assert.ok(usage.toolDefinitionTokens > 0);
  assert.equal(usage.tokens, usage.messageTokens + usage.toolDefinitionTokens);
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

  assert.equal(usage.messageTokens, 4);
  assert.equal(usage.parts?.find((part) => part.key === "developer")?.tokens, 1);
  assert.equal(usage.parts?.find((part) => part.key === "user")?.tokens, 1);
  assert.equal(usage.parts?.find((part) => part.key === "history")?.tokens, 2);
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
