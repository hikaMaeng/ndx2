import assert from "node:assert/strict";
import test from "node:test";
import { SliceModel } from "./SliceModel.js";
import { WebClientBridge } from "../app/model.js";
import { getSettingsSlice } from "../settings/model.js";
import { WebClientSessionModelStore } from "../session/model/liveStore.js";

test("SliceModel versions are independent per slice", () => {
  const left = new SliceModel(1);
  const right = new SliceModel("idle");
  const leftVersions: number[] = [];
  const rightVersions: number[] = [];

  left.subscribe(() => leftVersions.push(left.getVersion()));
  right.subscribe(() => rightVersions.push(right.getVersion()));

  left.set(2);

  assert.deepEqual(leftVersions, [1]);
  assert.deepEqual(rightVersions, []);
  assert.equal(left.value, 2);
  assert.equal(right.value, "idle");
});

test("WebClientBridge exposes independent surface and pending-action slices", () => {
  const bridge = new WebClientBridge();
  const surfaceVersions: number[] = [];
  const pendingVersions: number[] = [];

  bridge.surface.subscribe(() => surfaceVersions.push(bridge.surface.getVersion()));
  bridge.pendingActions.subscribe(() => pendingVersions.push(bridge.pendingActions.getVersion()));

  bridge.openProject("alpha");
  bridge.startAction("session-submit");

  assert.deepEqual(surfaceVersions, [1]);
  assert.deepEqual(pendingVersions, [1]);
  assert.equal(bridge.surface.value.kind, "project");
  assert.equal(bridge.pendingActions.value.has("session-submit"), true);
});

test("settings slices live outside component lifecycle by key", () => {
  const first = getSettingsSlice("test.persisted", "initial");
  first.set("changed");
  const second = getSettingsSlice("test.persisted", "ignored");

  assert.equal(second.value, "changed");
  assert.equal(first, second);
});

test("session store keeps draft state outside React state", () => {
  const store = new WebClientSessionModelStore();
  store.draftSessionProjectId.set("project-a");
  store.updateActiveUi((current) => ({ ...current, chatInput: "hello" }));

  const key = store.activeUiKey;
  assert.equal(key, "draft:project-a");
  assert.equal(store.sessionUiByKey()[key!]?.chatInput, "hello");
  assert.deepEqual(store.surfaceKeys(), ["draft:project-a"]);
});
