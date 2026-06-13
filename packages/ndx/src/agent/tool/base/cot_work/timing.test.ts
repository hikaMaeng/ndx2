import assert from "node:assert/strict";
import test from "node:test";
import { createCotWorkTimingTracker } from "./timing.js";

test("cot work timing assigns the update interval to every newly completed step", () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const timing = createCotWorkTimingTracker();
    timing.update({
      kind: "cot_work",
      steps: [
        { task: "one", status: "in_progress" },
        { task: "two", status: "pending" },
        { task: "three", status: "pending" }
      ]
    });

    now = 61_000;
    const updated = timing.update({
      kind: "cot_work",
      steps: [
        { task: "one", status: "completed" },
        { task: "two", status: "completed" },
        { task: "three", status: "completed" }
      ]
    });

    assert.deepEqual(updated.steps.map((step) => step.elapsed), ["01:00", "01:00", "01:00"]);
    assert.equal(updated.totalElapsed, "01:00");
  } finally {
    Date.now = originalNow;
  }
});

test("cot work timing starts a newly in-progress step at zero when a previous step completes", () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const timing = createCotWorkTimingTracker();
    timing.update({
      kind: "cot_work",
      steps: [
        { task: "one", status: "in_progress" },
        { task: "two", status: "pending" }
      ]
    });

    now = 31_000;
    const updated = timing.update({
      kind: "cot_work",
      steps: [
        { task: "one", status: "completed" },
        { task: "two", status: "in_progress" }
      ]
    });

    assert.deepEqual(updated.steps.map((step) => step.elapsed), ["00:30", "00:00"]);
    assert.equal(updated.totalElapsed, "00:30");
  } finally {
    Date.now = originalNow;
  }
});

test("cot work timing preserves unfinished step status at turn completion", () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const timing = createCotWorkTimingTracker();
    timing.update({
      kind: "cot_work",
      steps: [
        { task: "one", status: "completed" },
        { task: "two", status: "in_progress" },
        { task: "three", status: "pending" }
      ]
    });

    now = 46_000;
    const completed = timing.complete();

    assert.deepEqual(completed?.steps.map((step) => step.status), ["completed", "in_progress", "pending"]);
    assert.deepEqual(completed?.steps.map((step) => step.elapsed), ["00:00", "00:45", "00:00"]);
    assert.equal(completed?.totalElapsed, "00:45");
  } finally {
    Date.now = originalNow;
  }
});
