import assert from "node:assert/strict";
import test from "node:test";
import { NDXWebClientSessionUiManager } from "./sessionManager.js";

test("webclient session ui manager promotes draft state to a session key", () => {
  const manager = new NDXWebClientSessionUiManager(() => ({ input: "", scrollTop: 0 }));
  const draftKey = manager.setActiveDraft("project-1");

  manager.update(draftKey, (state) => ({ ...state, input: "hello", scrollTop: 42 }));
  manager.promoteToSession("session-1", draftKey);

  assert.equal(manager.activeKey, "session-1");
  assert.deepEqual(manager.get("session-1"), { input: "hello", scrollTop: 42 });
  assert.equal(manager.get(draftKey), undefined);
});

test("webclient session ui manager keeps independent session state", () => {
  const manager = new NDXWebClientSessionUiManager(() => ({ input: "", sidebarOpen: false }));

  manager.setActiveSession("session-1");
  manager.update("session-1", (state) => ({ ...state, input: "one" }));
  manager.setActiveSession("session-2");
  manager.update("session-2", (state) => ({ ...state, input: "two", sidebarOpen: true }));

  assert.deepEqual(manager.get("session-1"), { input: "one", sidebarOpen: false });
  assert.deepEqual(manager.get("session-2"), { input: "two", sidebarOpen: true });
});
