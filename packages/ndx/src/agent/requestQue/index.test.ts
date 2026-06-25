import assert from "node:assert/strict";
import test from "node:test";
import { createNDXSessionRequestQueueRegistry } from "./index.js";
import type { NDXSessionModelConfig } from "../../common/protocol/index.js";

const textModel: NDXSessionModelConfig = { type: "openai", provider: "local", model: "text-model", url: "http://localhost", token: "", contextsize: 100_000, modalities: ["text"] };
const imageModel: NDXSessionModelConfig = { type: "openai", provider: "local", model: "image-model", url: "http://localhost", token: "", contextsize: 100_000, modalities: ["text", "image"] };
const fileModel: NDXSessionModelConfig = { type: "openai", provider: "local", model: "file-model", url: "http://localhost", token: "", contextsize: 100_000, modalities: ["text", "file"] };

test("session request queue keeps sessions isolated and projects visible items", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const first = registry.enqueue({
    sessionid: "session-a",
    text: "  first request  ",
    attachments: [{ kind: "file", path: "/tmp/a.txt", name: "a.txt", mimeType: "text/plain", size: 12 }],
    model: fileModel,
    now: "2026-06-21T00:00:00.000Z"
  });
  registry.enqueue({ sessionid: "session-b", text: "other request", model: textModel, now: "2026-06-21T00:00:01.000Z" });

  const projected = registry.items("session-a");
  assert.equal(projected[0]?.model.model, "file-model");
  assert.equal(projected[0]?.attachments?.[0]?.attachmentid.length, 36);
  assert.deepEqual(projected.map(({ attachments, ...item }) => ({ ...item, attachments: attachments?.map(({ attachmentid, ...attachment }) => attachment) })), [{
    itemid: first.itemid,
    sessionid: "session-a",
    text: "first request",
    attachments: [{ name: "a.txt", mimeType: "text/plain", size: 12 }],
    model: fileModel,
    createdat: "2026-06-21T00:00:00.000Z",
    updatedat: "2026-06-21T00:00:00.000Z"
  }]);
  assert.equal(registry.items("session-b").length, 1);
});

test("session request queue updates, deletes, and claims fifo", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const first = registry.enqueue({ sessionid: "session-a", text: "first", model: textModel, now: "2026-06-21T00:00:00.000Z" });
  const second = registry.enqueue({ sessionid: "session-a", text: "second", model: textModel, now: "2026-06-21T00:00:01.000Z" });

  registry.updateText("session-a", second.itemid, "  changed  ", "2026-06-21T00:00:02.000Z");
  assert.equal(registry.items("session-a")[1]?.text, "changed");
  assert.equal(registry.items("session-a")[1]?.updatedat, "2026-06-21T00:00:02.000Z");

  assert.equal(registry.delete("session-a", "missing"), false);
  assert.equal(registry.claimNextRunnable("session-a")?.itemid, first.itemid);
  assert.deepEqual(registry.items("session-a").map((item) => item.itemid), [second.itemid]);
  assert.equal(registry.releaseClaim("session-a", first.itemid), true);
  assert.deepEqual(registry.items("session-a").map((item) => item.itemid), [first.itemid, second.itemid]);
  assert.equal(registry.claimNextRunnable("session-a")?.itemid, first.itemid);
  assert.equal(registry.completeClaim("session-a", first.itemid), true);
  assert.equal(registry.claimNextRunnable("session-a")?.itemid, second.itemid);
  assert.equal(registry.completeClaim("session-a", second.itemid), true);
  assert.deepEqual(registry.items("session-a"), []);
});

test("session request queue claim skips empty head items", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  registry.enqueue({ sessionid: "session-a", text: "", model: textModel, now: "2026-06-21T00:00:00.000Z" });
  const next = registry.enqueue({ sessionid: "session-a", text: "next", model: textModel, now: "2026-06-21T00:00:01.000Z" });

  assert.equal(registry.claimNextRunnable("session-a")?.itemid, next.itemid);
  assert.deepEqual(registry.items("session-a"), []);
});

test("session request queue inserts at front, end, before, and after", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const first = registry.enqueue({ sessionid: "session-a", text: "first", model: textModel, now: "2026-06-21T00:00:00.000Z" });
  const last = registry.insert({ sessionid: "session-a", text: "last", model: textModel, position: { type: "end" }, now: "2026-06-21T00:00:01.000Z" });
  const front = registry.insert({ sessionid: "session-a", text: "front", model: textModel, position: { type: "front" }, now: "2026-06-21T00:00:02.000Z" });
  registry.insert({ sessionid: "session-a", text: "before last", model: textModel, position: { type: "before", itemid: last.itemid }, now: "2026-06-21T00:00:03.000Z" });
  registry.insert({ sessionid: "session-a", text: "after first", model: textModel, position: { type: "after", itemid: first.itemid }, now: "2026-06-21T00:00:04.000Z" });
  registry.insert({ sessionid: "session-b", text: "other", model: textModel, position: { type: "front" }, now: "2026-06-21T00:00:05.000Z" });

  assert.deepEqual(registry.items("session-a").map((item) => item.text), ["front", "first", "after first", "before last", "last"]);
  assert.equal(registry.items("session-a")[0]?.itemid, front.itemid);
  assert.deepEqual(registry.items("session-b").map((item) => item.text), ["other"]);
});

test("session request queue update changes model and removes unsupported kept attachments", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const item = registry.enqueue({
    sessionid: "session-a",
    text: "image request",
    model: imageModel,
    attachments: [{ kind: "image", path: "/tmp/a.png", name: "a.png", mimeType: "image/png", size: 12 }],
    now: "2026-06-21T00:00:00.000Z"
  });
  const attachmentid = registry.items("session-a")[0]?.attachments?.[0]?.attachmentid;
  assert.ok(attachmentid);

  registry.update({
    sessionid: "session-a",
    itemid: item.itemid,
    text: "file request",
    model: fileModel,
    keepAttachmentIds: [attachmentid],
    attachments: [{ kind: "file", path: "/tmp/a.txt", name: "a.txt", mimeType: "text/plain", size: 5 }],
    now: "2026-06-21T00:00:01.000Z"
  });

  const projected = registry.items("session-a")[0];
  assert.equal(projected?.model.model, "file-model");
  assert.deepEqual(projected?.attachments?.map((attachment) => attachment.name), ["a.txt"]);
});

test("session request queue claim returns assigned model and strips queue attachment ids", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  registry.enqueue({
    sessionid: "session-a",
    text: "",
    model: imageModel,
    attachments: [{ kind: "image", path: "/tmp/a.png", name: "a.png", mimeType: "image/png", size: 12 }]
  });

  const claimed = registry.claimNextRunnable("session-a");

  assert.equal(claimed?.model.model, "image-model");
  assert.deepEqual(Object.keys(claimed?.attachments[0] ?? {}).sort(), ["kind", "mimeType", "name", "path", "size"].sort());
});
