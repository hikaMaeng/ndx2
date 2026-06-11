import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

type NDXThinkingMarkerLevel = "low" | "medium" | "high" | "none" | "nothink" | "normal";

const THINKING_MARKER_PATTERN = /\[\[NDX_THINKING_(none|nothink|normal|high|low|medium)\]\]/g;

export const thinkingMarkerHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.request.received.thinking_markers",
  source: "system",
  run(context): NDXHookEffect {
    const levels = [...context.requestText.matchAll(THINKING_MARKER_PATTERN)]
      .map((match) => match[1])
      .filter((value): value is NDXThinkingMarkerLevel => value === "none" || value === "nothink" || value === "normal" || value === "high" || value === "low" || value === "medium");
    const level = levels[levels.length - 1];
    if (!level) {
      return { type: "noeffect", replaceRequestText: context.requestText };
    }

    const cleaned = context.requestText.replace(THINKING_MARKER_PATTERN, "").trim();
    return {
      type: "noeffect",
      replaceRequestText: cleaned
    };
  }
};
