import { recallSessionHistory, searchSessionHistory } from "../../../session/sessionSearch.js";
import { failedWithoutProcess } from "../../execute/process.js";
import { NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "../../execute/agentcall/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult } from "../../types.js";
import type { NDXSessionHistoryScope } from "../../../session/index.js";

export const NDX_SESSION_HISTORY_TOOL_NAME = "session_history";

export function sessionHistoryToolSchema(): Record<string, unknown> {
  return {
    type: "function",
    name: NDX_SESSION_HISTORY_TOOL_NAME,
    description: "Read durable NDX session history. Use mode=recall when a compact summary or search result gives dataid anchors and you need the exact original rows from sessiondata. Use mode=search when you do not know the dataid and need candidates from sessionsearch. Prefer recall for compact-summary anchors, because search is only a lossy searchable projection. Never use for current workspace file/code exploration; use glob, grep_search, read_file, edit, or bash instead.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["search", "recall"],
          description: "search finds candidate prior rows by query; recall expands exact sessiondata rows by dataid or dataid range. Defaults to search unless dataid/startDataId/endDataId is present."
        },
        scope: {
          type: "string",
          enum: ["all", "project", "session"],
          description: "Search or recall all NDX sessions, all sessions in one project, or one specific session. Search defaults to project scope; recall defaults to current session scope."
        },
        query: {
          type: "string",
          description: "Specific prior-session query for mode=search. Do not use empty queries for exploration; empty query is only for explicit recent-history listing requests."
        },
        dataid: {
          type: "string",
          description: "Exact sessiondata dataid for mode=recall. Use when a compact summary or search result names a single dataid."
        },
        startDataId: {
          type: "string",
          description: "First sessiondata dataid for mode=recall range expansion."
        },
        endDataId: {
          type: "string",
          description: "Last sessiondata dataid for mode=recall range expansion."
        },
        projectname: {
          type: "string",
          description: "Project name for project scope. Defaults to the current session project."
        },
        sessionid: {
          type: "string",
          description: "Session id for session scope. Defaults to the current session."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Maximum rows to return. Search defaults to 20 and caps at 100; recall defaults to 50 and caps at 200."
        }
      },
      additionalProperties: false
    }
  };
}

export async function executeSessionHistoryTool(
  args: Record<string, unknown>,
  callId: string | undefined,
  options: NDXToolExecutionOptions
): Promise<NDXToolExecutionResult> {
  const startedAtDate = new Date();
  await options.observer?.onToolStarted?.({ tool: NDX_SESSION_HISTORY_TOOL_NAME, callId, startedAt: startedAtDate.toISOString(), args });
  if (!options.database || !options.session) {
    return failedWithoutProcess(NDX_SESSION_HISTORY_TOOL_NAME, callId, "session_history requires an active database and session.", "failed", startedAtDate);
  }
  const mode = sessionHistoryMode(args);
  if (mode !== "search" && mode !== "recall") {
    return failedWithoutProcess(NDX_SESSION_HISTORY_TOOL_NAME, callId, mode, "failed", startedAtDate);
  }
  const scope = normalizeSessionHistoryScope(args, options, mode === "recall" ? "session" : "project");
  if (typeof scope === "string") {
    return failedWithoutProcess(NDX_SESSION_HISTORY_TOOL_NAME, callId, scope, "failed", startedAtDate);
  }

  const recallInput = mode === "recall" ? normalizeRecallInput(args) : undefined;
  if (typeof recallInput === "string") {
    return failedWithoutProcess(NDX_SESSION_HISTORY_TOOL_NAME, callId, recallInput, "failed", startedAtDate);
  }
  const result = recallInput ? await recallSessionHistory(options.database, {
    scope,
    ...recallInput,
    limit: typeof args.limit === "number" && Number.isInteger(args.limit) ? args.limit : undefined
  }) : await searchSessionHistory(options.database, {
    scope,
    query: typeof args.query === "string" ? args.query : undefined,
    limit: typeof args.limit === "number" && Number.isInteger(args.limit) ? args.limit : undefined,
    userHome: options.userHome
  });
  const embeddingSuffix = result.mode !== "recall"
    ? result.embedding.configured ? result.embedding.used ? " · embedding" : " · embedding fallback" : ""
    : "";
  const resultCount = Array.isArray((result as { rows?: unknown }).rows)
    ? ((result as { rows: unknown[] }).rows.length)
    : Array.isArray((result as { results?: unknown }).results) ? ((result as { results: unknown[] }).results.length) : 0;
  await options.agentCallHandlers?.[NDX_SIDEBAR_ITEM_AGENTCALL_NAME]?.({
    group: { id: "session-references", title: "세션 참조" },
    key: `session-history:${mode}:${sessionHistorySidebarKey(args)}:${callId ?? NDX_SESSION_HISTORY_TOOL_NAME}`,
    title: mode === "recall" ? `세션 원문: ${sessionHistorySidebarKey(args)}` : typeof args.query === "string" && args.query.trim() ? `세션 검색: ${args.query.trim()}` : "최근 세션 참조",
    body: mode === "recall"
      ? `${resultCount}개 원문 행 · ${scope.type} · recall`
      : `${resultCount}개 결과 · ${scope.type} · ${result.mode}${embeddingSuffix}`,
    kind: "session_history"
  }, { tool: NDX_SESSION_HISTORY_TOOL_NAME, callId, sessionid: options.sessionid });
  const output = JSON.stringify(result);
  return {
    tool: NDX_SESSION_HISTORY_TOOL_NAME,
    callId,
    status: "success",
    success: true,
    output,
    outputValue: result,
    events: [],
    stdoutText: "",
    stderrText: "",
    startedAt: startedAtDate.toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtDate.getTime()
  };
}

function sessionHistoryMode(args: Record<string, unknown>): "search" | "recall" | string {
  if (args.mode === "search" || args.mode === "recall") {
    return args.mode;
  }
  if (typeof args.mode !== "undefined") {
    return "session_history mode must be search or recall.";
  }
  return typeof args.dataid !== "undefined" || typeof args.startDataId !== "undefined" || typeof args.endDataId !== "undefined" ? "recall" : "search";
}

function normalizeRecallInput(args: Record<string, unknown>): { dataid?: string; startDataId?: string; endDataId?: string } | string {
  const dataid = normalizeDataId(args.dataid);
  const startDataId = normalizeDataId(args.startDataId);
  const endDataId = normalizeDataId(args.endDataId);
  if (dataid && (startDataId || endDataId)) {
    return "session_history recall accepts either dataid or startDataId/endDataId, not both.";
  }
  if (!dataid && !startDataId) {
    return "session_history recall requires dataid or startDataId.";
  }
  if (startDataId && endDataId && BigInt(startDataId) > BigInt(endDataId)) {
    return "session_history recall requires startDataId to be less than or equal to endDataId.";
  }
  return {
    ...(dataid ? { dataid } : {}),
    ...(startDataId ? { startDataId } : {}),
    ...(endDataId ? { endDataId } : {})
  };
}

function normalizeDataId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed : undefined;
}

function sessionHistorySidebarKey(args: Record<string, unknown>): string {
  if (typeof args.dataid === "string" && args.dataid.trim()) return `dataid:${args.dataid.trim()}`;
  if (typeof args.startDataId === "string" && args.startDataId.trim()) {
    return `dataid:${args.startDataId.trim()}-${typeof args.endDataId === "string" && args.endDataId.trim() ? args.endDataId.trim() : "latest"}`;
  }
  return typeof args.query === "string" && args.query.trim() ? args.query.trim() : "recent";
}

function normalizeSessionHistoryScope(args: Record<string, unknown>, options: NDXToolExecutionOptions, defaultScope: "project" | "session"): NDXSessionHistoryScope | string {
  if (args.scope === "all") {
    return { type: "all" };
  }
  if (args.scope === "project") {
    const projectname = typeof args.projectname === "string" && args.projectname.trim() ? args.projectname.trim() : options.session?.projectname;
    return projectname ? { type: "project", projectname } : "project scope requires projectname or a current session project.";
  }
  if (args.scope === "session") {
    const sessionid = typeof args.sessionid === "string" && args.sessionid.trim() ? args.sessionid.trim() : options.sessionid ?? options.session?.sessionid;
    return sessionid ? { type: "session", sessionid } : "session scope requires sessionid or a current session.";
  }
  if (typeof args.scope === "undefined") {
    if (defaultScope === "session") {
      const sessionid = options.sessionid ?? options.session?.sessionid;
      return sessionid ? { type: "session", sessionid } : "session scope requires sessionid or a current session.";
    }
    const projectname = options.session?.projectname;
    return projectname ? { type: "project", projectname } : "project scope requires projectname or a current session project.";
  }
  return "session_history scope must be all, project, or session.";
}
