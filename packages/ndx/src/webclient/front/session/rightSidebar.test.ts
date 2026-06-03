import assert from "node:assert/strict";
import test from "node:test";
import { groupRightSidebarItems, upsertRightSidebarItem } from "./rightSidebar.js";
import type { NDXSidebarItem } from "ndx/common/protocol";

test("right sidebar upsert keeps one item per explicit key inside a section", () => {
  const first: NDXSidebarItem = {
    group: { id: "changed-files", title: "변경 파일" },
    subgroup: { id: "folder:src", title: "src" },
    key: "changed-file:/project/src/a.ts",
    title: "a.ts",
    body: "/project/src/a.ts",
    kind: "edit"
  };
  const second = { ...first, kind: "write_file" };

  const items = upsertRightSidebarItem(upsertRightSidebarItem([], first), second);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, "write_file");
});

test("right sidebar groups top-level and subgroup items separately", () => {
  const items: NDXSidebarItem[] = [
    { group: { id: "changed-files", title: "변경 파일" }, key: "root", title: "README.md" },
    { group: { id: "changed-files", title: "변경 파일" }, subgroup: { id: "folder:src", title: "src" }, key: "a", title: "a.ts" },
    { group: { id: "changed-files", title: "변경 파일" }, subgroup: { id: "folder:src", title: "src" }, key: "b", title: "b.ts" }
  ];

  const groups = groupRightSidebarItems(items);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.items.map((item) => item.title), ["README.md"]);
  assert.deepEqual(groups[0]?.subgroups.map((group) => ({ title: group.title, items: group.items.map((item) => item.title) })), [
    { title: "src", items: ["a.ts", "b.ts"] }
  ]);
});
