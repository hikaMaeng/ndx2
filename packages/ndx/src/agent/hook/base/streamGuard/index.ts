import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { readNDXSettingsDocument, resolveSettingsModelConfig } from "../../../../common/settings/index.js";
import { requestModelResponse, type ResponseInputItem, type ResponseModelConfig } from "ndx/common/responseapi";
import { readAgentRuntimeSettings } from "../../../runtime-settings/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export type NDXStreamGuardHookInsertionEvent = typeof NDX_TURN_EVENT.ModelResponding;

const MAX_REASONING_CHARS = 240_000;
const REPEATED_REASONING_BLOCK_WINDOWS = [80, 160, 320, 640] as const;
const REPEATED_REASONING_DENSITY_RECENT_CHARS = 4_000;
const REPEATED_REASONING_DENSITY_MIN_SHINGLES = 120;
const REPEATED_REASONING_DENSITY_MAX_UNIQUE_RATIO = 0.65;
const REPEATED_REASONING_DENSITY_MIN_DUPLICATE_COUNT = 3;
const NO_OUTPUT_REASONING_MAX_ELAPSED_MS = 90_000;
const NO_OUTPUT_REASONING_MAX_SEQUENCE = 1_000;
const NO_OUTPUT_REASONING_MAX_CHARS = 8_000;
const STREAM_GUARD_ANALYSIS_INPUT_CHARS = 12_000;
const STREAM_GUARD_ANALYSIS_TIMEOUT_MS = 45_000;
const META_REASONING_MIN_CHARS = 600;
const META_REASONING_MIN_SIGNAL_COUNT = 4;
const META_REASONING_SIGNALS = [
  /\bwe need respond to user\b/i,
  /\bneed continue task\b/i,
  /\blast actual output\b/i,
  /\bactual output from\b/i,
  /\btranscript\b/i,
  /\bassistant-to-user\b/i,
  /\buser reminders?\b/i,
  /\bfunction outputs?\b/i,
  /\btool call(?:s| attempts?)?\b/i,
  /\binvalid json\b/i,
  /\bbad control character\b/i,
  /\bcommand string\b/i,
  /\bjson string\b/i,
  /\binterface\b.*\becho/i,
  /\btool result\b.*\binvalid/i
] as const;

type StreamGuardState = {
  maxReasoningObservedChars: number;
  maxReasoningAllowedChars: number;
  analysisModel?: string;
};

type StreamGuardDetection = {
  code: string;
  title: string;
  reason: string;
  detail: string;
};

const streamGuardState = new Map<string, StreamGuardState>();

export const modelResponseStreamGuardHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.model.responding.stream_guard",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    if (!context.modelResponse || typeof context.iteration !== "number") {
      return { type: "noeffect" };
    }

    const key = `${context.session.sessionid}:${context.iteration}`;
    if (context.modelResponse.type === "tool_call") {
      streamGuardState.delete(key);
      return { type: "noeffect" };
    }
    if (context.modelResponse.type === "text") {
      if (context.modelResponse.textRole !== "implicit_thinking_candidate") {
        streamGuardState.delete(key);
        return { type: "noeffect" };
      }
      return detectAndInterrupt(context, key, context.modelResponse.content, context.modelResponse.elapsedMs, context.modelResponse.sequence);
    }

    if (context.modelResponse.content.length > 0) {
      streamGuardState.delete(key);
      return { type: "noeffect" };
    }
    return detectAndInterrupt(context, key, context.modelResponse.summary, context.modelResponse.elapsedMs, context.modelResponse.sequence);
  }
};

async function detectAndInterrupt(
  context: Readonly<Parameters<NDXHookCodeExecutor["run"]>[0]>,
  key: string,
  summary: string,
  elapsedMs: number,
  sequence: number
): Promise<NDXHookEffect> {
  const existingState = streamGuardState.get(key);
  const state = existingState ?? {
    maxReasoningObservedChars: 0,
    ...await readStreamGuardSettings(context.userHome)
  };
  state.maxReasoningObservedChars = Math.max(state.maxReasoningObservedChars, summary.length);
  streamGuardState.set(key, state);

  const detection = detectStreamGuardStop(summary, elapsedMs, sequence, state);
  if (detection) {
    streamGuardState.delete(key);
    return interruptEffect(context, detection, state.analysisModel, summary);
  }
  return { type: "noeffect" };
}

async function readStreamGuardSettings(userHome: string): Promise<Pick<StreamGuardState, "maxReasoningAllowedChars" | "analysisModel">> {
  const settings = await readAgentRuntimeSettings(userHome);
  return {
    maxReasoningAllowedChars: settings.hooks?.StreamGuard?.MAX_REASONING_LENGTH ?? MAX_REASONING_CHARS,
    ...(settings.hooks?.StreamGuard?.analysisModel ? { analysisModel: settings.hooks.StreamGuard.analysisModel } : {})
  };
}

function hasRepeatedReasoningParagraph(summary: string): boolean {
  const seen = new Set<string>();
  for (const paragraph of summary
    .split(/\n\s*\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0)) {
    if (seen.has(paragraph)) {
      return true;
    }
    seen.add(paragraph);
  }
  return false;
}

function hasMetaExecutionReasoning(summary: string): boolean {
  if (summary.length < META_REASONING_MIN_CHARS) {
    return false;
  }
  let signalCount = 0;
  for (const signal of META_REASONING_SIGNALS) {
    if (signal.test(summary)) {
      signalCount += 1;
    }
  }
  return signalCount >= META_REASONING_MIN_SIGNAL_COUNT;
}

function hasRepeatedReasoningTailBlock(summary: string): boolean {
  const normalized = summary.replace(/\s+/g, " ").trim();
  for (const size of REPEATED_REASONING_BLOCK_WINDOWS) {
    if (normalized.length < size * 2) {
      continue;
    }
    const block = normalized.slice(normalized.length - size);
    if (new Set(block).size < minUniqueCharactersForRepeatedBlock(size)) {
      continue;
    }
    if (normalized.slice(0, normalized.length - size).includes(block)) {
      return true;
    }
  }
  return false;
}

function minUniqueCharactersForRepeatedBlock(size: number): number {
  return size < 160 ? 18 : 24;
}

function hasDenseRepeatedReasoning(summary: string): boolean {
  const normalized = summary.replace(/\s+/g, " ").trim();
  const recent = normalized.slice(-REPEATED_REASONING_DENSITY_RECENT_CHARS).toLowerCase();
  const tokens = recent.match(/[a-z0-9가-힣_`'.-]+/g) ?? [];
  if (tokens.length < REPEATED_REASONING_DENSITY_MIN_SHINGLES) {
    return false;
  }

  const shingleSize = 10;
  const counts = new Map<string, number>();
  for (let index = 0; index <= tokens.length - shingleSize; index += 1) {
    const shingle = tokens.slice(index, index + shingleSize).join(" ");
    counts.set(shingle, (counts.get(shingle) ?? 0) + 1);
  }

  const total = Math.max(0, tokens.length - shingleSize + 1);
  if (total < REPEATED_REASONING_DENSITY_MIN_SHINGLES) {
    return false;
  }
  const maxDuplicateCount = Math.max(...counts.values());
  const uniqueRatio = counts.size / total;
  return maxDuplicateCount >= REPEATED_REASONING_DENSITY_MIN_DUPLICATE_COUNT && uniqueRatio <= REPEATED_REASONING_DENSITY_MAX_UNIQUE_RATIO;
}

function hasExcessiveNoOutputReasoning(summary: string, elapsedMs: number, sequence: number): boolean {
  return elapsedMs >= NO_OUTPUT_REASONING_MAX_ELAPSED_MS &&
    sequence >= NO_OUTPUT_REASONING_MAX_SEQUENCE &&
    summary.length >= NO_OUTPUT_REASONING_MAX_CHARS;
}

function detectStreamGuardStop(summary: string, elapsedMs: number, sequence: number, state: StreamGuardState): StreamGuardDetection | undefined {
  if (hasMetaExecutionReasoning(summary)) {
    return {
      code: "meta_execution_reasoning",
      title: "meta execution reasoning",
      reason: "model response reasoning got stuck analyzing tool-call or transcript state before producing output.",
      detail: "The reasoning matched multiple meta-execution signals such as transcript/tool-call/json-control analysis instead of progressing the task."
    };
  }
  if (hasRepeatedReasoningParagraph(summary)) {
    return {
      code: "repeated_paragraph",
      title: "repeated reasoning paragraph",
      reason: "model response reasoning repeated the same paragraph before producing output.",
      detail: "After whitespace normalization, the same non-empty paragraph appeared more than once before any assistant output text."
    };
  }
  if (hasRepeatedReasoningTailBlock(summary)) {
    return {
      code: "repeated_tail_block",
      title: "repeated reasoning tail block",
      reason: "model response reasoning repeated the same text block before producing output.",
      detail: "The latest normalized reasoning tail block already appeared earlier in the same reasoning stream."
    };
  }
  if (hasDenseRepeatedReasoning(summary)) {
    return {
      code: "dense_repeated_reasoning",
      title: "dense repeated reasoning",
      reason: "model response reasoning repeated too densely before producing output.",
      detail: `The latest ${REPEATED_REASONING_DENSITY_RECENT_CHARS} characters contained too many repeated 10-token shingles.`
    };
  }
  if (hasExcessiveNoOutputReasoning(summary, elapsedMs, sequence)) {
    return {
      code: "excessive_no_output_reasoning",
      title: "excessive no-output reasoning",
      reason: "model response reasoning streamed too long before producing output.",
      detail: `The response streamed reasoning for ${elapsedMs}ms across ${sequence} stream events and ${summary.length} reasoning characters without assistant output.`
    };
  }
  if (state.maxReasoningObservedChars > state.maxReasoningAllowedChars) {
    return {
      code: "max_reasoning_length",
      title: "max reasoning length",
      reason: `model response reasoning exceeded ${state.maxReasoningAllowedChars} characters before producing output.`,
      detail: `The largest observed reasoning summary was ${state.maxReasoningObservedChars} characters, exceeding hooks.StreamGuard.MAX_REASONING_LENGTH=${state.maxReasoningAllowedChars}.`
    };
  }
  return undefined;
}

async function interruptEffect(
  context: Readonly<Parameters<NDXHookCodeExecutor["run"]>[0]>,
  detection: StreamGuardDetection,
  analysisModel: string | undefined,
  reasoningSummary: string
): Promise<NDXHookEffect> {
  const analysis = analysisModel ? await analyzeReasoningLoop(context, analysisModel, detection, reasoningSummary) : undefined;
  const reason = streamGuardInterruptMessage(detection, analysis);
  return {
    type: "noeffect",
    interruptModelResponse: true,
    interruptReason: reason,
    diagnostics: [
      `stream_guard.stop=${detection.code}`,
      `stream_guard.reason=${detection.reason}`,
      ...(analysisModel ? [`stream_guard.analysis_model=${analysisModel}`] : []),
      ...(analysis?.diagnostic ? [analysis.diagnostic] : [])
    ]
  };
}

async function analyzeReasoningLoop(
  context: Readonly<Parameters<NDXHookCodeExecutor["run"]>[0]>,
  requestedModel: string,
  detection: StreamGuardDetection,
  reasoningSummary: string
): Promise<{ text?: string; diagnostic?: string }> {
  try {
    const settings = await readNDXSettingsDocument(context.userHome);
    const resolved = resolveSettingsModelConfig(settings, requestedModel, context.session.model.contextsize);
    if (!resolved) {
      return { diagnostic: `stream_guard.analysis_model_unresolved=${requestedModel}` };
    }
    const analysisModelConfig: ResponseModelConfig = {
      model: resolved.model.model,
      url: resolved.model.url,
      token: resolved.model.token,
      requestTimeoutMs: STREAM_GUARD_ANALYSIS_TIMEOUT_MS,
      ...(resolved.model.reasoningEffort ? { reasoningEffort: resolved.model.reasoningEffort } : {}),
      ...(typeof resolved.model.temperature === "number" ? { temperature: resolved.model.temperature } : {}),
      ...(typeof resolved.model.topP === "number" ? { topP: resolved.model.topP } : {}),
      ...(typeof resolved.model.topK === "number" ? { topK: resolved.model.topK } : {}),
      ...(typeof resolved.model.minP === "number" ? { minP: resolved.model.minP } : {})
    };
    const response = await requestModelResponse(
      analysisModelConfig,
      streamGuardAnalysisMessages(detection, reasoningSummary),
      [],
      {
        onDebug: async (event, detail) => {
          context.database.logger?.debug(event, {
            sessionid: context.session.sessionid,
            hook: "system.turn.model.responding.stream_guard.analysis",
            model: resolved.model.model,
            ...detail
          });
        }
      }
    );
    const text = response.content.trim();
    return text ? { text: text.slice(0, 2_000), diagnostic: `stream_guard.analysis_model=settings.models.${resolved.key}` } : { diagnostic: `stream_guard.analysis_empty=settings.models.${resolved.key}` };
  } catch (error) {
    return { diagnostic: `stream_guard.analysis_failed=${error instanceof Error ? error.message : String(error)}` };
  }
}

function streamGuardAnalysisMessages(detection: StreamGuardDetection, reasoningSummary: string): ResponseInputItem[] {
  return [
    {
      role: "system",
      content: [
        "You analyze why a coding agent model entered a reasoning loop.",
        "Return Korean prose only, 2-4 concise sentences.",
        "Do not quote the full reasoning. Do not recommend implementation steps.",
        "Explain the likely loop mechanism in practical terms, like whether it kept re-evaluating strategy, replayed the same paragraph, analyzed tool plumbing, or failed to commit to a next action."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        stream_guard_stop: {
          code: detection.code,
          reason: detection.reason,
          detail: detection.detail
        },
        latest_reasoning_excerpt: reasoningSummary.slice(-STREAM_GUARD_ANALYSIS_INPUT_CHARS)
      })
    }
  ];
}

function streamGuardInterruptMessage(detection: StreamGuardDetection, analysis?: { text?: string }): string {
  return [
    "StreamGuard interrupted the model response before assistant output.",
    "",
    `Guard: ${detection.title}`,
    `Reason: ${detection.reason}`,
    `Detail: ${detection.detail}`,
    ...(analysis?.text ? ["", "Loop analysis:", analysis.text] : [])
  ].join("\n");
}
