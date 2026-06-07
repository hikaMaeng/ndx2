import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

const THINKING_MARKER_PATTERN = /\[\[NDX_THINKING_(low|medium|high)\]\]/g;

export const thinkingMarkerHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.request.received.thinking_markers",
  source: "system",
  run(context): NDXHookEffect {
    const levels = [...context.requestText.matchAll(THINKING_MARKER_PATTERN)]
      .map((match) => match[1])
      .filter((value): value is "low" | "medium" | "high" => value === "low" || value === "medium" || value === "high");
    const level = levels[levels.length - 1];
    if (!level) {
      return { type: "noeffect", replaceRequestText: context.requestText };
    }

    const cleaned = context.requestText.replace(THINKING_MARKER_PATTERN, "").trim();
    const guide = thinkingGuide(level, cleaned);
    return {
      type: "noeffect",
      replaceRequestText: guide
    };
  }
};

function thinkingGuide(level: "low" | "medium" | "high", requestText: string): string {
  if (level === "low") {
    return wrapRequestGuide("none", requestText, [
      "No-thinking mode applies to this user request.",
      "Do not think in the model response. Do not emit reasoning text, analysis, task restatement, plan text, or notes about what you are about to inspect.",
      "If a concrete action is available, immediately call exactly one useful tool. Examples: search files, read the target file, edit the file, run the requested command, or deploy.",
      "For multi-step work, uncertain work, or tool-heavy work, use cot_work as the thinking surface instead of reasoning. Keep cot_work steps terse and action-oriented.",
      "After a tool result, again choose the next concrete tool call or final answer; do not resume reasoning.",
      "If no tool action is possible, answer directly in the shortest useful form. If blocked, ask one short question."
    ]);
  }
  if (level === "high") {
    return wrapRequestGuide("allowed", requestText, [
      "Reasoning is allowed when it materially improves correctness.",
      "Use reasoning to resolve ambiguity, compare alternatives, or validate a risky change.",
      "Still prefer concrete tool calls and evidence over repeated task restatement.",
      "For long plans or multi-step execution tracking, prefer cot_work over extended reasoning text."
    ]);
  }
  return wrapRequestGuide("minimal", requestText, [
    "Almost no-thinking mode applies to this user request.",
    "Avoid reasoning text by default. Do not restate the task or write a plan in reasoning.",
    "Use at most one tiny decision step only when it prevents a likely wrong action.",
    "If you need more than that, call cot_work and put the plan or uncertainty there instead of reasoning.",
    "Prefer the next useful tool call or a direct answer."
  ]);
}

function wrapRequestGuide(reasoning: "none" | "minimal" | "allowed", requestText: string, instructions: string[]): string {
  return [
    `<ndx_request reasoning="${reasoning}">`,
    "<user_request>",
    requestText,
    "</user_request>",
    "<execution_policy>",
    ...instructions,
    "</execution_policy>",
    "</ndx_request>"
  ].join("\n");
}
