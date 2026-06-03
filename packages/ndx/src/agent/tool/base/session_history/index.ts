import { searchSessionHistory } from "../../../session/sessionSearch.js";
import { failedWithoutProcess } from "../../execute/process.js";
import { NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "../../execute/agentcall/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult } from "../../types.js";
import type { NDXSessionHistoryScope } from "../../../session/index.js";

export const NDX_SESSION_HISTORY_TOOL_NAME = "session_history";

export function sessionHistoryToolSchema(): Record<string, unknown> {
  return {
    type: "function",
    name: NDX_SESSION_HISTORY_TOOL_NAME,
    description: "Search prior NDX session history only for explicit history requests, references to earlier/other sessions, or a required prior-session decision. Never use for current workspace exploration, file/code search, implementation discovery, or choosing files to edit; use glob, grep_search, read_file, edit, or bash instead.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["all", "project", "session"],
          description: "Search all NDX sessions, all sessions in one project, or one specific session."
        },
        query: {
          type: "string",
          description: "Specific prior-session query. Do not use empty queries for exploration; empty query is only for explicit recent-history listing requests."
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
          maximum: 100,
          description: "Maximum rows to return. Defaults to 20."
        }
      },
      required: ["scope"],
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
  const scope = normalizeSessionHistoryScope(args, options);
  if (typeof scope === "string") {
    return failedWithoutProcess(NDX_SESSION_HISTORY_TOOL_NAME, callId, scope, "failed", startedAtDate);
  }

  const result = await searchSessionHistory(options.database, {
    scope,
    query: typeof args.query === "string" ? args.query : undefined,
    limit: typeof args.limit === "number" && Number.isInteger(args.limit) ? args.limit : undefined,
    userHome: options.userHome
  });
  await options.agentCallHandlers?.[NDX_SIDEBAR_ITEM_AGENTCALL_NAME]?.({
    group: { id: "session-references", title: "세션 참조" },
    key: `session-history:${typeof args.query === "string" && args.query.trim() ? args.query.trim() : "recent"}:${callId ?? NDX_SESSION_HISTORY_TOOL_NAME}`,
    title: typeof args.query === "string" && args.query.trim() ? `세션 검색: ${args.query.trim()}` : "최근 세션 참조",
    body: `${Array.isArray(result.results) ? result.results.length : 0}개 결과`,
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

function normalizeSessionHistoryScope(args: Record<string, unknown>, options: NDXToolExecutionOptions): NDXSessionHistoryScope | string {
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
  return "session_history scope must be all, project, or session.";
}
