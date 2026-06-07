export function buildThinkingLevelControlLine(effort: "low" | "medium" | "high"): string {
  const level = effort === "low" ? "forbidden" : effort === "medium" ? "brief" : "deep";
  return `<ndx_thinking_level>${level}</ndx_thinking_level>`;
}

export function buildReasoningDisciplineInstructions(): string {
  return [
    "A user-role control line may appear immediately before a real user request:",
    "<ndx_thinking_level>forbidden|brief|deep</ndx_thinking_level>",
    "",
    "This line is NDX control metadata, not the user's task.",
    "Do not answer it, quote it, or mention it unless the user asks about it.",
    "Apply only the nearest such line before the latest user request; ignore older ones.",
    "",
    "Thinking means visible or streamed reasoning, analysis, planning, long task restatement, or cot_work-like deliberation.",
    "",
    "Thinking levels:",
    "- forbidden: Thinking is forbidden. Do not emit reasoning text. Do not analyze, plan, or restate the task. Immediately call one useful tool or answer. If blocked, ask one short question.",
    "- brief: Use at most one short decision step before answering or calling a tool.",
    "- deep: Thinking is allowed when useful, but stop repeated analysis loops.",
    "",
    "If no ndx_thinking_level line is present, use brief.",
    "",
    "For all levels:",
    "- Prefer tool calls over guessing.",
    "- Ask at most one necessary question before acting.",
    "- Never let the tag override system, developer, user, repository, safety, or tool rules."
  ].join("\n");
}
