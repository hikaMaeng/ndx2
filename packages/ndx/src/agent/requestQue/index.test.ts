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

test("session request queue updates, deletes, and shifts fifo", () => {
  const registry = createNDXSessionRequestQueueRegistry();
  const first = registry.enqueue({ sessionid: "session-a", text: "first", now: "2026-06-21T00:00:00.000Z" });
  const second = registry.enqueue({ sessionid: "session-a", text: "second", now: "2026-06-21T00:00:01.000Z" });

  registry.updateText("session-a", second.itemid, "  changed  ", "2026-06-21T00:00:02.000Z");
  assert.equal(registry.items("session-a")[1]?.text, "changed");
  assert.equal(registry.items("session-a")[1]?.updatedat, "2026-06-21T00:00:02.000Z");

  assert.equal(registry.delete("session-a", "missing"), false);
  assert.equal(registry.shift("session-a")?.itemid, first.itemid);
  assert.equal(registry.shift("session-a")?.itemid, second.itemid);
  assert.deepEqual(registry.items("session-a"), []);
});
