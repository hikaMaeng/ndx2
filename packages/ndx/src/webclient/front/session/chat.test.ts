import test from "node:test";
import assert from "node:assert/strict";
import { sessionDataContentsText } from "./chat.js";

test("sessionDataContentsText shows only original user request from ndx request wrapper", () => {
  const text = [
    "<ndx_request reasoning=\"nothink\">",
    "<user_request>",
    "수정하고 배포해",
    "</user_request>",
    "<execution_policy>",
    "Do not think in the model response.",
    "</execution_policy>",
    "</ndx_request>"
  ].join("\n");

  assert.equal(sessionDataContentsText({ kind: "user_message", text }), "수정하고 배포해");
});
