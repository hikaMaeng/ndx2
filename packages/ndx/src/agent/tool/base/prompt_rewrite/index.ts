import { requestModelResponse, responseToolCallId, type ResponseInputItem } from "ndx/common/responseapi";
import { readAgentRuntimeSettings } from "../../../runtime-settings/index.js";
import { sessionDataText } from "../../../session/content.js";
import { listAvailableTools, toolSchemas } from "../../registry.js";
import { summarizeToolName } from "../../toolCall.js";
import { failedWithoutProcess, runToolProcess } from "../../execute/process.js";
import { NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "../../execute/agentcall/index.js";
import { NDX_SESSION_HISTORY_TOOL_NAME, executeSessionHistoryTool } from "../session_history/index.js";
import type { NDXModelConfig, NDXSessionDataRow } from "../../../session/types.js";
import type { NDXResolvedTool, NDXToolExecutionOptions, NDXToolExecutionResult } from "../../types.js";

export const NDX_PROMPT_REWRITE_TOOL_NAME = "prompt_rewrite";

const PROMPT_REWRITE_MAX_ITERATIONS = 8;
const PROMPT_REWRITE_TOOL_ALLOWLIST = ["glob", "grep_search", "read_file", "web_fetch", "web_search", "bash", NDX_SESSION_HISTORY_TOOL_NAME] as const;

type PromptRewriteOutput = {
  rewritten_prompt?: unknown;
  report?: unknown;
  facts?: unknown;
  assumptions?: unknown;
  ambiguities?: unknown;
  should_ask_user?: unknown;
  pass_through?: unknown;
};

type PromptRewriteToolSummary = {
  iteration: number;
  tool: string;
  success: boolean;
  output: string;
};

export function promptRewriteToolSchema(): Record<string, unknown> {
  return {
    type: "function",
    name: NDX_PROMPT_REWRITE_TOOL_NAME,
    description: [
      "Rewrite the user's prompt into a clearer execution prompt for weaker local models.",
      "This tool runs a compact rewrite loop that may call existing builtin file and web tools when more evidence is needed.",
      "The result separates evidence/report from the rewritten prompt so the model can reflect both without mixing facts and assumptions."
    ].join(" "),
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The raw user prompt to reinterpret. If omitted, the tool uses the latest user message from the current turn context."
        },
        reason: {
          type: "string",
          description: "Why prompt rewriting is useful for this turn."
        }
      },
      additionalProperties: false
    }
  };
}

export async function executePromptRewriteTool(
  args: Record<string, unknown>,
  callId: string | undefined,
  options: NDXToolExecutionOptions
): Promise<NDXToolExecutionResult> {
  const startedAtDate = new Date();
  await options.observer?.onToolStarted?.({ tool: NDX_PROMPT_REWRITE_TOOL_NAME, callId, startedAt: startedAtDate.toISOString(), args });
  if (!options.model) {
    return failedWithoutProcess(NDX_PROMPT_REWRITE_TOOL_NAME, callId, "prompt_rewrite requires active model context.", "failed", startedAtDate);
  }

  const prompt = typeof args.prompt === "string" && args.prompt.trim() ? args.prompt.trim() : latestUserPrompt(options);
  if (!prompt) {
    return failedWithoutProcess(NDX_PROMPT_REWRITE_TOOL_NAME, callId, "prompt_rewrite requires a prompt or a current user message.", "failed", startedAtDate);
  }

  try {
    const rewriteModel = await selectPromptRewriteModel(options.model, options.userHome);
    const availableTools = await promptRewriteTools(options);
    const messages: ResponseInputItem[] = [
      { role: "system", content: promptRewriteSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify({
          original_prompt: prompt,
          reason: typeof args.reason === "string" ? args.reason : "",
          current_session_history: compactCurrentSessionHistory(options.turnContext?.historyRows ?? [])
        })
      }
    ];
    const toolSummaries: PromptRewriteToolSummary[] = [];
    let finalText = "";
    let finalIteration = 1;

    for (let iteration = 1; iteration <= PROMPT_REWRITE_MAX_ITERATIONS; iteration += 1) {
      finalIteration = iteration;
      const response = await requestModelResponse(rewriteModel, messages, toolSchemas(availableTools), { signal: options.signal });
      if (response.toolCalls.length === 0) {
        finalText = response.content;
        break;
      }

      messages.push(...response.outputItems.filter((item): item is ResponseInputItem => Boolean(item && typeof item === "object" && !Array.isArray(item))));
      for (const toolCall of response.toolCalls) {
        const toolName = summarizeToolName(toolCall);
        const tool = availableTools.find((item) => item.name === toolName);
        const nestedOptions = {
          ...options,
          agentCallHandlers: { [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: () => undefined }
        };
        const result = tool
          ? tool.name === NDX_SESSION_HISTORY_TOOL_NAME && tool.runtime === "function"
            ? await executeSessionHistoryTool(toolArguments(toolCall), responseToolCallId(toolCall), nestedOptions)
            : await runToolProcess(tool, toolArguments(toolCall), responseToolCallId(toolCall), {
              ...nestedOptions,
              allowedToolNames: PROMPT_REWRITE_TOOL_ALLOWLIST,
              denyToolResultEffects: true,
              timeoutMs: Math.min(options.timeoutMs ?? 60_000, 30_000)
            })
          : failedWithoutProcess(toolName, responseToolCallId(toolCall), `Tool is not available to prompt_rewrite: ${toolName}`);
        toolSummaries.push({
          iteration,
          tool: toolName,
          success: result.success,
          output: result.output.slice(0, 6000)
        });
        messages.push({
          type: "function_call_output",
          call_id: responseToolCallId(toolCall) ?? "tool_call",
          output: result.output.slice(0, 12_000)
        });
      }
    }

    if (!finalText.trim()) {
      const response = await requestModelResponse(rewriteModel, [
        ...messages,
        { role: "system", content: "Stop calling tools. Return the final prompt rewrite JSON now." }
      ], [], { signal: options.signal });
      finalText = response.content;
    }

    const parsed = parseJsonObject(finalText) as PromptRewriteOutput;
    const rewrittenPrompt = typeof parsed.rewritten_prompt === "string" && parsed.rewritten_prompt.trim() ? parsed.rewritten_prompt.trim() : prompt;
    const outputValue = {
      original_prompt: prompt,
      rewritten_prompt: rewrittenPrompt,
      report: typeof parsed.report === "string" && parsed.report.trim() ? parsed.report.trim() : "프롬프트 리라이터 루프가 원문과 수집한 근거를 바탕으로 결과를 생성했다.",
      model: {
        source: rewriteModel.model === options.model.model ? "session" : "settings.tools.prompt_rewrite.model",
        model: rewriteModel.model
      },
      iterations: finalIteration,
      tool_calls: toolSummaries,
      facts: arrayOfStrings(parsed.facts),
      assumptions: arrayOfStrings(parsed.assumptions),
      ambiguities: arrayOfStrings(parsed.ambiguities),
      should_ask_user: parsed.should_ask_user === true,
      pass_through: parsed.pass_through === true
    };
    await options.agentCallHandlers?.[NDX_SIDEBAR_ITEM_AGENTCALL_NAME]?.({
      group: { id: "prompt-rewrites", title: "프롬프트 재작성" },
      key: `prompt-rewrite:${callId ?? NDX_PROMPT_REWRITE_TOOL_NAME}`,
      title: outputValue.pass_through ? "프롬프트 유지" : "프롬프트 재작성 완료",
      body: [outputValue.should_ask_user ? "사용자 확인 권장" : "", outputValue.rewritten_prompt].filter(Boolean).join(" · ").slice(0, 220),
      kind: "prompt_rewrite"
    }, { tool: NDX_PROMPT_REWRITE_TOOL_NAME, callId, sessionid: options.sessionid });
    const endedAtDate = new Date();
    return {
      tool: NDX_PROMPT_REWRITE_TOOL_NAME,
      callId,
      status: "success",
      success: true,
      output: JSON.stringify(outputValue),
      outputValue,
      events: [],
      stdoutText: "",
      stderrText: "",
      startedAt: startedAtDate.toISOString(),
      endedAt: endedAtDate.toISOString(),
      durationMs: endedAtDate.getTime() - startedAtDate.getTime()
    };
  } catch (error) {
    return failedWithoutProcess(NDX_PROMPT_REWRITE_TOOL_NAME, callId, error instanceof Error ? error.message : String(error), "failed", startedAtDate);
  }
}

export async function selectPromptRewriteModel(sessionModel: NDXModelConfig, userHome?: string): Promise<NDXModelConfig> {
  if (!userHome) {
    return sessionModel;
  }
  const settings = await readAgentRuntimeSettings(userHome);
  const configuredModel = settings.tools.prompt_rewrite?.model;
  return configuredModel ? { ...sessionModel, model: configuredModel } : sessionModel;
}

async function promptRewriteTools(options: NDXToolExecutionOptions): Promise<NDXResolvedTool[]> {
  return (await listAvailableTools({
    ...options,
    allowedToolNames: PROMPT_REWRITE_TOOL_ALLOWLIST
  })).filter((tool) => tool.runtime !== "function" || tool.name === NDX_SESSION_HISTORY_TOOL_NAME);
}

function promptRewriteSystemPrompt(): string {
  return [
    "You are the prompt_rewrite tool's internal agent loop.",
    "Mission: decide whether the user's prompt can pass through unchanged or must be rewritten into a precise instruction for a weaker local coding model.",
    "You receive compact current-session history containing only user requests and final assistant/error responses.",
    "If that context is sufficient, do not call tools. Return final JSON immediately.",
    "If more evidence is required, call only the provided tools. For current workspace facts, use repository file/search tools. Do not modify files.",
    "Use session_history only for explicit prior-session references or required prior-session decisions. Never use session_history as repository exploration.",
    "Stop when the rewrite is good enough; do not chase exhaustive context.",
    "Return only JSON with keys: rewritten_prompt, report, facts, assumptions, ambiguities, should_ask_user, pass_through.",
    "The rewritten_prompt must preserve the user's intent and avoid scope expansion.",
    "Use clear sections in rewritten_prompt when useful: 목표, 근거/사실, 제약, 절차, 출력.",
    "Keep facts and assumptions separate. If ambiguity materially changes the next action, set should_ask_user true."
  ].join("\n");
}

function compactCurrentSessionHistory(rows: NDXSessionDataRow[]): Array<{ role: "user" | "assistant"; text: string }> {
  const history: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const row of rows) {
    if (!row.contents || typeof row.contents !== "object") {
      continue;
    }
    const kind = (row.contents as { kind?: unknown }).kind;
    if (row.type === "user" && kind === "user_message") {
      const text = sessionDataText(row);
      if (text?.trim()) {
        history.push({ role: "user", text: text.trim().slice(0, 2000) });
      }
    }
    if (row.type === "assistant" && (kind === "assistant_message" || kind === "error")) {
      const text = sessionDataText(row);
      if (text?.trim()) {
        history.push({ role: "assistant", text: text.trim().slice(0, 2000) });
      }
    }
  }
  return history.slice(-16);
}

function latestUserPrompt(options: NDXToolExecutionOptions): string {
  const history = options.turnContext?.history ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message || typeof message !== "object" || !("role" in message) || message.role !== "user" || !("content" in message)) {
      continue;
    }
    if (typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
}

function toolArguments(toolCall: unknown): Record<string, unknown> {
  if (!toolCall || typeof toolCall !== "object") {
    return {};
  }
  const record = toolCall as { arguments?: unknown; input?: unknown; function?: unknown };
  const raw = record.arguments ?? record.input ?? (record.function && typeof record.function === "object" ? (record.function as { arguments?: unknown }).arguments : undefined);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { input: parsed };
    } catch {
      return { input: raw };
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/u.exec(trimmed)?.[1];
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const object = /\{[\s\S]*\}/u.exec(candidate)?.[0];
    return object ? JSON.parse(object) as unknown : {};
  }
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}
