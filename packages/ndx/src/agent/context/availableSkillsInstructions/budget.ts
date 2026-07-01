import { estimateTextTokens } from "ndx/common/tokenizer";
import type { Budget } from "./types.js";

const DEFAULT_SKILL_METADATA_CHAR_BUDGET = 8_000;
const SKILL_METADATA_CONTEXT_WINDOW_PERCENT = 2;

export function defaultSkillMetadataBudget(contextsize?: number): Budget {
  return contextsize && contextsize > 0
    ? { kind: "tokens", limit: Math.max(1, Math.floor(contextsize * SKILL_METADATA_CONTEXT_WINDOW_PERCENT / 100)) }
    : { kind: "characters", limit: DEFAULT_SKILL_METADATA_CHAR_BUDGET };
}

export function lineCost(budget: Budget, line: string): number {
  return textCost(budget, `${line}\n`);
}

export function textCost(budget: Budget, text: string): number {
  return budget.kind === "tokens"
    ? estimateTextTokens(text)
    : [...text].length;
}
