import assert from "node:assert/strict";
import test from "node:test";
import { countTextTokens, encodingNameForModel, estimateTextTokens } from "./index.js";

test("countTextTokens uses the default o200k BPE tokenizer", () => {
  const count = countTextTokens({ text: "hello world" });

  assert.deepEqual(count, {
    tokens: 2,
    encodingName: "o200k_base",
    method: "bpe"
  });
});

test("estimateTextTokens counts Korean text with BPE ranks", () => {
  assert.equal(estimateTextTokens("한글 테스트"), 3);
});

test("encodingNameForModel maps legacy and modern model families", () => {
  assert.equal(encodingNameForModel("gpt-4o"), "o200k_base");
  assert.equal(encodingNameForModel("gpt-4-turbo"), "cl100k_base");
  assert.equal(encodingNameForModel("text-davinci-003"), "p50k_base");
});
