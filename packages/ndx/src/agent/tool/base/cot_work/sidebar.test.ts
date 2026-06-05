import assert from "node:assert/strict";
import test from "node:test";
import { cotWorkCompletedSidebarItems } from "./sidebar.js";

test("cot work sidebar items report completed steps only", () => {
  const items = cotWorkCompletedSidebarItems({
    kind: "cot_work",
    steps: [
      { task: "Read context", status: "completed", elapsed: "00:03" },
      { task: "Apply patch", status: "in_progress" },
      { task: "Run checks", status: "pending" }
    ]
  });

  assert.deepEqual(items, [{
    group: { id: "plans", title: "작업 계획" },
    key: "cot-work-step:0:Read context",
    title: "Read context",
    body: "완료 · 00:03",
    kind: "cot_work"
  }]);
});
