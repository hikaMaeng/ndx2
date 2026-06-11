import { readNDXSettingsDocument, resolveSettingsModelConfig } from "../../../../common/settings/index.js";
import { requestModelResponse, responseToolCallId, type ResponseInputItem } from "ndx/common/responseapi";
import { searchSessionHistory } from "../../../session/sessionSearch.js";
import { sessionDataText } from "../../../session/content.js";
import { failedWithoutProcess, runToolProcess } from "../../../tool/execute/process.js";
import { listAvailableTools, summarizeToolName, toolSchemas } from "../../../tool/index.js";
import type { NDXModelConfig, NDXSessionDataRow } from "../../../session/types.js";
import type { NDXResolvedTool } from "../../../tool/types.js";
import type { NDXHookCodeExecutor, NDXHookContext, NDXHookEffect } from "../../index.js";

export const REWRITER_MARKER_PATTERN = /\[\[rewriter\]\]/giu;

const REWRITER_MAX_ITERATIONS = 8;
const REWRITER_TOOL_ALLOWLIST = ["glob", "grep_search", "read_file", "web_fetch", "web_search", "bash"] as const;

type RewriterOutput = {
  rewritten_prompt?: unknown;
  report?: unknown;
  facts?: unknown;
  assumptions?: unknown;
  ambiguities?: unknown;
};

export const rewriterMarkerHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.request.received.rewriter_marker",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    if (!REWRITER_MARKER_PATTERN.test(context.requestText)) {
      REWRITER_MARKER_PATTERN.lastIndex = 0;
      return { type: "noeffect", replaceRequestText: context.requestText };
    }
    REWRITER_MARKER_PATTERN.lastIndex = 0;
    const originalPrompt = context.requestText.replace(REWRITER_MARKER_PATTERN, "").trim();
    if (!originalPrompt) {
      return { type: "noeffect", replaceRequestText: "" };
    }

    const diagnostics: string[] = [];
    try {
      const selectedModel = await selectRewriterModel(context.session.model, context.userHome);
      const sessionHistory = await collectSessionHistory(context, originalPrompt, diagnostics);
      const availableTools = await rewriterTools(context);
      const messages: ResponseInputItem[] = [
        { role: "system", content: rewriterSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            original_prompt: originalPrompt,
            current_session_history: compactCurrentSessionHistory(context.sessionDataRows ?? []),
            session_search_context: sessionHistory
          })
        }
      ];
      let finalText = "";
      const toolSummaries: Array<{ iteration: number; tool: string; success: boolean; output: string }> = [];

      for (let iteration = 1; iteration <= REWRITER_MAX_ITERATIONS; iteration += 1) {
        const response = await requestModelResponse(selectedModel.model, messages, toolSchemas(availableTools));
        if (response.toolCalls.length === 0) {
          finalText = response.content;
          break;
        }
        messages.push(...response.outputItems.filter((item): item is ResponseInputItem => Boolean(item && typeof item === "object" && !Array.isArray(item))));
        for (const toolCall of response.toolCalls) {
          const toolName = summarizeToolName(toolCall);
          const callId = responseToolCallId(toolCall);
          const tool = availableTools.find((item) => item.name === toolName);
          const result = tool
            ? await runToolProcess(tool, toolArguments(toolCall), callId, {
              cwd: context.projectHome,
              userHome: context.userHome,
              projectHome: context.projectHome,
              database: context.database,
              session: context.session,
              sessionid: context.session.sessionid,
              allowedToolNames: REWRITER_TOOL_ALLOWLIST,
              denyToolResultEffects: true,
              timeoutMs: 30_000
            })
            : failedWithoutProcess(toolName, callId, `Tool is not available to rewriter marker: ${toolName}`);
          toolSummaries.push({ iteration, tool: toolName, success: result.success, output: result.output.slice(0, 2000) });
          messages.push({
            type: "function_call_output",
            call_id: callId ?? "tool_call",
            output: result.output.slice(0, 12_000)
          });
        }
      }

      if (!finalText.trim()) {
        const response = await requestModelResponse(selectedModel.model, [
          ...messages,
          { role: "system", content: "Stop calling tools. Return the final rewrite JSON now." }
        ], []);
        finalText = response.content;
      }

      const parsed = parseJsonObject(finalText) as RewriterOutput;
      const rewrittenBase = typeof parsed.rewritten_prompt === "string" && parsed.rewritten_prompt.trim() ? parsed.rewritten_prompt.trim() : originalPrompt;
      const rewritten = appendSessionSearchContext(rewrittenBase, sessionHistory.project.results);
      return {
        type: "noeffect",
        replaceRequestText: rewritten,
        diagnostics: [
          `rewriter_marker.model=${selectedModel.source}:${selectedModel.model.model}`,
          `rewriter_marker.session_history.project=${sessionHistory.project.results.length}`,
          `rewriter_marker.session_history.recent=${sessionHistory.recent.results.length}`,
          `rewriter_marker.tool_calls=${toolSummaries.map((item) => `${item.tool}:${item.success ? "ok" : "fail"}`).join(",")}`,
          ...arrayOfStrings(parsed.facts).map((fact) => `rewriter_marker.fact=${fact}`),
          ...arrayOfStrings(parsed.assumptions).map((assumption) => `rewriter_marker.assumption=${assumption}`),
          ...arrayOfStrings(parsed.ambiguities).map((ambiguity) => `rewriter_marker.ambiguity=${ambiguity}`),
          ...diagnostics
        ].filter(Boolean)
      };
    } catch (error) {
      return {
        type: "noeffect",
        replaceRequestText: originalPrompt,
        diagnostics: [`rewriter_marker.failed=${error instanceof Error ? error.message : String(error)}`, ...diagnostics]
      };
    }
  }
};

async function collectSessionHistory(context: Readonly<NDXHookContext>, prompt: string, diagnostics: string[]) {
  const project = await searchSessionHistory(context.database, {
    scope: { type: "project", projectname: context.session.projectname },
    query: prompt,
    limit: 8,
    userHome: context.userHome
  }).catch((error: unknown) => {
    diagnostics.push(`rewriter_marker.session_history.project_failed=${error instanceof Error ? error.message : String(error)}`);
    return { mode: "fts" as const, scope: { type: "project" as const, projectname: context.session.projectname }, query: prompt, embedding: { configured: false, used: false }, results: [] };
  });
  const recent = await searchSessionHistory(context.database, {
    scope: { type: "project", projectname: context.session.projectname },
    limit: 6,
    userHome: context.userHome
  }).catch((error: unknown) => {
    diagnostics.push(`rewriter_marker.session_history.recent_failed=${error instanceof Error ? error.message : String(error)}`);
    return { mode: "list" as const, scope: { type: "project" as const, projectname: context.session.projectname }, embedding: { configured: false, used: false }, results: [] };
  });
  return { project, recent };
}

async function rewriterTools(context: Readonly<NDXHookContext>): Promise<NDXResolvedTool[]> {
  return (await listAvailableTools({
    userHome: context.userHome,
    projectHome: context.projectHome,
    allowedToolNames: REWRITER_TOOL_ALLOWLIST
  })).filter((tool) => tool.runtime !== "function");
}

async function selectRewriterModel(sessionModel: NDXModelConfig, userHome: string): Promise<{ model: NDXModelConfig; source: string }> {
  const settings = await readNDXSettingsDocument(userHome);
  const promptRewrite = settings.tools?.prompt_rewrite;
  const requested = promptRewrite && typeof promptRewrite === "object" && !Array.isArray(promptRewrite) && typeof (promptRewrite as { model?: unknown }).model === "string"
    ? (promptRewrite as { model: string }).model.trim()
    : "";
  if (!requested) {
    return { model: sessionModel, source: "session" };
  }

  const resolved = resolveSettingsModelConfig(settings, requested, sessionModel.contextsize);
  if (!resolved) {
    return { model: { ...sessionModel, model: requested }, source: "settings.tools.prompt_rewrite.model" };
  }

  return {
    source: `settings.models.${resolved.key}`,
    model: resolved.model
  };
}

function rewriterSystemPrompt(): string {
  return [
    "You are the internal [[rewriter]] request rewriter for NDX.",
    "Rewrite the user's raw request into the exact request the coding agent should persist and execute.",
    "The rewritten prompt replaces the user row in durable sessiondata, so preserve user intent and do not expand scope.",
    "Use current session history and the provided session search results aggressively to restore omitted project context.",
    "Session search was already queried directly from the raw user request. Do not call session history tools.",
    "If repository facts are still needed, call the provided read/search/web/bash tools. Do not modify files.",
    "If the original request is already clear, return it with only minor cleanup.",
    "Return only JSON with keys: rewritten_prompt, report, facts, assumptions, ambiguities.",
    "The rewritten_prompt should be directly executable by the next agent model. Use Korean if the original request is Korean.",
    "For tool calls on providers without native function calling, emit <tool_call>{\"name\":\"grep_search\",\"arguments\":{\"pattern\":\"...\"}}</tool_call>."
  ].join("\n");
}

function appendSessionSearchContext(
  prompt: string,
  results: Array<{ title?: string; type: string; createdat: string; text: string }>
): string {
  const selected = results
    .filter((result) => result.text.trim())
    .slice(0, 5)
    .map((result, index) => `${index + 1}. ${[result.title, result.type, result.createdat].filter(Boolean).join(" / ")}\n${result.text.trim().slice(0, 1200)}`);
  if (selected.length === 0) {
    return prompt;
  }
  return [
    prompt.trim(),
    "",
    "세션 검색 보강 컨텍스트:",
    ...selected,
    "",
    "위 세션 검색 결과는 사용자 원문으로 직접 조회한 참고 정보다. 사실로 확정하지 말고 현재 저장소 확인과 함께 사용하라."
  ].join("\n");
}

function compactCurrentSessionHistory(rows: NDXSessionDataRow[]): Array<{ role: "user" | "assistant"; text: string }> {
  const history: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const row of rows) {
    if (!row.contents || typeof row.contents !== "object") continue;
    const kind = (row.contents as { kind?: unknown }).kind;
    if (row.type === "user" && kind === "user_message") {
      const text = sessionDataText(row);
      if (text?.trim()) history.push({ role: "user", text: text.trim().slice(0, 2000) });
    }
    if (row.type === "assistant" && (kind === "assistant_message" || kind === "error")) {
      const text = sessionDataText(row);
      if (text?.trim()) history.push({ role: "assistant", text: text.trim().slice(0, 2000) });
    }
  }
  return history.slice(-16);
}

function toolArguments(toolCall: unknown): Record<string, unknown> {
  if (!toolCall || typeof toolCall !== "object") return {};
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
