import assert from "node:assert/strict";
import test from "node:test";
import { inspectContextPreparedMessagesPrefix, inspectModelRequestPrefix, readSessionModelRequestPrefixPreview, rememberSessionModelRequestPrefixPreview, snapshotModelRequestStablePrefix } from "./index.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

test("inspectModelRequestPrefix allows append-only iteration messages", () => {
  const first: ResponseInputItem[] = [
    { role: "system", content: "developer" },
    { role: "user", content: "prelude" },
    { role: "user", content: "request" }
  ];
  const second: ResponseInputItem[] = [
    ...first,
    { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{\"path\":\"a.ts\"}" },
    { type: "function_call_output", call_id: "call_1", output: "file" }
  ];

  assert.equal(inspectModelRequestPrefix(snapshotModelRequestStablePrefix(first), second), undefined);
});

test("inspectModelRequestPrefix reports stable prefix rewrites", () => {
  const first: ResponseInputItem[] = [
    { role: "system", content: "developer" },
    { role: "user", content: "prelude" },
    { role: "user", content: "request" }
  ];
  const second: ResponseInputItem[] = [
    { role: "system", content: "developer" },
    { role: "user", content: "prelude changed" },
    { role: "user", content: "request" }
  ];

  assert.deepEqual(inspectModelRequestPrefix(snapshotModelRequestStablePrefix(first), second), {
    label: "model request",
    message: "model request changed stable model-request prefix message 2.",
    messageIndex: 1,
    previousMessageCount: 3,
    nextMessageCount: 3,
    stablePrefixLength: 3,
    previousPreview: "user:\nprelude",
    nextPreview: "user:\nprelude changed"
  });
});

test("inspectModelRequestPrefix permits dropping one-request attachment payload tail", () => {
  const first: ResponseInputItem[] = [
    { role: "system", content: "developer" },
    { role: "user", content: "prelude" },
    { role: "user", content: "request with image path" },
    { role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AA==" }] },
    { role: "user", content: "cot_work reminder persisted later" }
  ];
  const second: ResponseInputItem[] = [
    { role: "system", content: "developer" },
    { role: "user", content: "prelude" },
    { role: "user", content: "request with image path" },
    { role: "user", content: "cot_work reminder persisted later" },
    { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" }
  ];

  assert.equal(inspectModelRequestPrefix(snapshotModelRequestStablePrefix(first), second), undefined);
});

test("inspectContextPreparedMessagesPrefix reports hook message replacement before stable tail", () => {
  const before: ResponseInputItem[] = [
    { role: "system", content: "developer" },
    { role: "user", content: "prelude" },
    { role: "user", content: "request" }
  ];
  const after: ResponseInputItem[] = [
    { role: "system", content: "developer" },
    { role: "user", content: "other prelude" },
    { role: "user", content: "request" }
  ];

  assert.match(inspectContextPreparedMessagesPrefix(snapshotModelRequestStablePrefix(before), after)?.message ?? "", /changed stable model-request prefix/);
});

test("snapshotModelRequestStablePrefix snapshots later in-place mutation", () => {
  const messages: ResponseInputItem[] = [{ role: "user", content: "before" }];
  const snapshot = snapshotModelRequestStablePrefix(messages);
  messages[0] = { role: "user", content: "after" };

  assert.deepEqual(snapshot, ["user:\nbefore"]);
});

test("session model request prefix preview is stored as a defensive copy", () => {
  const snapshot = rememberSessionModelRequestPrefixPreview("session-1", [{ role: "user", content: "before" }]);
  snapshot?.push("mutated");

  assert.deepEqual(readSessionModelRequestPrefixPreview("session-1"), ["user:\nbefore"]);
});
