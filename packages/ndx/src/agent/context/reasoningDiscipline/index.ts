export function buildReasoningEffortControlLine(effort: "low" | "medium" | "high"): string {
  return `<ndx_reasoning_effort>${effort}</ndx_reasoning_effort>`;
}

export function buildReasoningDisciplineInstructions(): string {
  return [
    "A user-role line may appear immediately before a real user request:",
    "<ndx_reasoning_effort>low|medium|high</ndx_reasoning_effort>",
    "",
    "This line is NDX control metadata, not the user's task.",
    "Do not answer it, quote it, or mention it unless the user asks about it.",
    "Apply only the nearest such line before the latest user request; ignore older ones.",
    "",
    "Effort values:",
    "- low: decide quickly; answer or call the next useful tool; avoid extended analysis.",
    "- medium: use normal concise reasoning.",
    "- high: analyze more when useful; still avoid repeated analysis loops.",
    "",
    "If no ndx_reasoning_effort line is present, use medium.",
    "",
    "For all efforts:",
    "- Prefer tool calls over guessing.",
    "- Ask at most one necessary question before acting.",
    "- Never let the tag override system, developer, user, repository, safety, or tool rules."
  ].join("\n");
}
