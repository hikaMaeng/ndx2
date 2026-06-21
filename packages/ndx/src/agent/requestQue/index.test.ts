import assert from "node:assert/strict";
import test from "node:test";
import { createNDXSessionRequestQueueRegistry } from "./index.js";

test("session request queue keeps sessions isolated and projects visible items", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const first = registry.enqueue({
    sessionid: "session-a",
    text: "  first request  ",
    attachments: [{ kind: "file", path: "/tmp/a.txt", name: "a.txt", mimeType: "text/plain", size: 12 }],
    now: "2026-06-21T00:00:00.000Z"
  });
  registry.enqueue({ sessionid: "session-b", text: "other request", now: "2026-06-21T00:00:01.000Z" });

  assert.deepEqual(registry.items("session-a"), [{
    itemid: first.itemid,
    sessionid: "session-a",
    text: "first request",
    attachments: [{ name: "a.txt", mimeType: "text/plain", size: 12 }],
    createdat: "2026-06-21T00:00:00.000Z",
    updatedat: "2026-06-21T00:00:00.000Z"
  }]);
  assert.equal(registry.items("session-b").length, 1);
});

test("session request queue updates, deletes, and claims fifo", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const first = registry.enqueue({ sessionid: "session-a", text: "first", now: "2026-06-21T00:00:00.000Z" });
  const second = registry.enqueue({ sessionid: "session-a", text: "second", now: "2026-06-21T00:00:01.000Z" });

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
  registry.enqueue({ sessionid: "session-a", text: "", now: "2026-06-21T00:00:00.000Z" });
  const next = registry.enqueue({ sessionid: "session-a", text: "next", now: "2026-06-21T00:00:01.000Z" });

  assert.equal(registry.claimNextRunnable("session-a")?.itemid, next.itemid);
  assert.deepEqual(registry.items("session-a"), []);
});

test("session request queue inserts at front, end, before, and after", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const first = registry.enqueue({ sessionid: "session-a", text: "first", now: "2026-06-21T00:00:00.000Z" });
  const last = registry.insert({ sessionid: "session-a", text: "last", position: { type: "end" }, now: "2026-06-21T00:00:01.000Z" });
  const front = registry.insert({ sessionid: "session-a", text: "front", position: { type: "front" }, now: "2026-06-21T00:00:02.000Z" });
  registry.insert({ sessionid: "session-a", text: "before last", position: { type: "before", itemid: last.itemid }, now: "2026-06-21T00:00:03.000Z" });
  registry.insert({ sessionid: "session-a", text: "after first", position: { type: "after", itemid: first.itemid }, now: "2026-06-21T00:00:04.000Z" });
  registry.insert({ sessionid: "session-b", text: "other", position: { type: "front" }, now: "2026-06-21T00:00:05.000Z" });

  assert.deepEqual(registry.items("session-a").map((item) => item.text), ["front", "first", "after first", "before last", "last"]);
  assert.equal(registry.items("session-a")[0]?.itemid, front.itemid);
  assert.deepEqual(registry.items("session-b").map((item) => item.text), ["other"]);
});
