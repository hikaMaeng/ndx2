import type { NDXCotWorkContents, NDXSidebarItem } from "../../../../common/protocol/index.js";

export function cotWorkCompletedSidebarItems(contents: NDXCotWorkContents): NDXSidebarItem[] {
  return contents.steps.flatMap((step, index) => {
    const task = step.task.trim();
    if (step.status !== "completed" || task.length === 0) return [];
    return [{
      group: { id: "plans", title: "작업 계획" },
      key: `cot-work-step:${index}:${task}`,
      title: task,
      body: step.elapsed ? `완료 · ${step.elapsed}` : "완료",
      kind: "cot_work"
    }];
  });
}
