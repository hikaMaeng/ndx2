import type { NDXSessionEventMessage } from "ndx/common/protocol";
import { NDX_TURN_EVENT, parseNDXSidebarItem } from "ndx/common/protocol";
import { eventContentText, toolCallIdFromCall, toolNameFromCall, toolProgressText } from "./eventText.js";
import type { TurnBatchState, TurnFlowState, TurnToolState } from "./types.js";

export function applyTurnEvent(turns: TurnFlowState[], message: NDXSessionEventMessage): TurnFlowState[] {
  const now = message.createdat || new Date().toISOString();
  const current = turns.at(-1);
  const startsTurn = message.event === NDX_TURN_EVENT.InputRecorded || !current || current.status !== "running";
  const turn = startsTurn ? newTurn(message, now) : { ...current, updatedAt: now };
  const base = startsTurn ? turns : turns.slice(0, -1);
  const next = reduceTurn(turn, message, now);
  return [...base, next];
}

function newTurn(message: NDXSessionEventMessage, now: string): TurnFlowState {
  return {
    id: `turn:${message.sessionid}:${message.dataid}`,
    inputDataId: message.dataid,
    sessionid: message.sessionid,
    title: eventContentText(message.contents) || "Turn",
    status: "running",
    collapsed: false,
    createdAt: now,
    updatedAt: now,
    sidebarItems: [],
    batches: []
  };
}

function reduceTurn(turn: TurnFlowState, message: NDXSessionEventMessage, now: string): TurnFlowState {
  if (message.event === NDX_TURN_EVENT.AssistantDelta) {
    const text = eventContentText(message.contents);
    if (!text.trim()) return turn;
    return updateIteration(turn, eventIteration(message), (batch) => ({ ...batch, assistantText: text }));
  }
  if (message.event === NDX_TURN_EVENT.AssistantReasoning) {
    const text = eventContentText(message.contents);
    if (!text.trim()) return turn;
    return updateIteration(turn, eventIteration(message), (batch) => ({ ...batch, reasoningText: text }));
  }
  if (message.event === NDX_TURN_EVENT.ModelRequest) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(modelEventText(message)) ? batch.modelEvents : [...batch.modelEvents, modelEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ModelProgress) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(modelProgressEventText(message)) ? batch.modelEvents : [...batch.modelEvents, modelProgressEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ModelResume) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(modelEventText(message)) ? batch.modelEvents : [...batch.modelEvents, modelEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.CompactStarted || message.event === NDX_TURN_EVENT.CompactCompleted) {
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      modelEvents: batch.modelEvents.includes(compactEventText(message)) ? batch.modelEvents : [...batch.modelEvents, compactEventText(message)]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolBatchStarted) {
    const nextBatch = batchFromMessage(message);
    return updateIteration(turn, eventIteration(message), (batch) => ({
      ...batch,
      key: batch.key.startsWith(`${turn.id}:iteration:`) ? `tool-batch:${turn.id}:${batch.iteration}` : batch.key,
      tools: mergeBatchTools(batch.tools, nextBatch.tools)
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_started") {
    return updateIteration(turn, eventIteration(message), (batch) => upsertTool(batch, startedTool(message)));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_progress") {
    const event = (message.contents as { event?: unknown }).event;
    const sidebarItem = event && typeof event === "object"
      ? parseNDXSidebarItem(
        typeof (event as { message?: unknown }).message === "string" ? (event as { message: string }).message : "",
        (event as { data?: unknown }).data
      )
      : undefined;
    const turnWithSidebar = sidebarItem ? upsertSidebarItem(turn, sidebarItem) : turn;
    if (sidebarItem) {
      return updateTool(turnWithSidebar, message, (tool) => ({ ...tool, progress: tool.progress }));
    }
    return updateTool(turn, message, (tool) => ({
      ...tool,
      progress: [...tool.progress, { id: message.dataid, text: toolProgressText(event), receivedAt: String((message.contents as { receivedAt?: unknown }).receivedAt ?? "") }]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_interrupt") {
    return updateTool(turn, message, (tool) => ({
      ...tool,
      status: interruptStatus(message.contents),
      progress: [...tool.progress, { id: message.dataid, text: `interrupt: ${String((message.contents as { phase?: unknown }).phase ?? "requested")}` }]
    }));
  }
  if (message.event === NDX_TURN_EVENT.ToolProgress && (message.contents as { kind?: unknown }).kind === "tool_finished") {
    const result = (message.contents as { result?: unknown }).result;
    const args = toolArgsForResult(turn, result);
    const nextTurn = updateTool(turn, message, (tool) => ({ ...tool, ...finishedTool(result), result }));
    return upsertSidebarItemsFromResult(upsertChangedFileFromResult(nextTurn, result), result, args);
  }
  if (message.event === NDX_TURN_EVENT.ToolResultRecorded) {
    const contents = message.contents as { results?: unknown };
    const results = Array.isArray(contents.results) ? contents.results : [];
    return results.reduce(
      (nextTurn, result) => updateToolFromResult(nextTurn, result, eventIteration(message)),
      { ...turn, updatedAt: now }
    );
  }
  if (message.event === NDX_TURN_EVENT.Interrupted || message.event === NDX_TURN_EVENT.InterruptCompleted) {
    return { ...turn, status: "interrupted", collapsed: true, updatedAt: now };
  }
  if (message.event === NDX_TURN_EVENT.AssistantRecorded) {
    return { ...completeOpenTools(turn), status: "completed", collapsed: true, updatedAt: now };
  }
  return turn;
}

function eventIteration(message: NDXSessionEventMessage): number {
  if (message.contents && typeof message.contents === "object" && typeof (message.contents as { iteration?: unknown }).iteration === "number") {
    return (message.contents as { iteration: number }).iteration;
  }
  const match = message.dataid.match(/:(\d+)(?::|$)/);
  return match ? Number(match[1]) : 1;
}

function modelEventText(message: NDXSessionEventMessage): string {
  const contents = message.contents as { iteration?: unknown; messageCount?: unknown };
  const iteration = typeof contents.iteration === "number" ? `iteration ${contents.iteration}` : "model";
  const count = typeof contents.messageCount === "number" ? `, ${contents.messageCount} messages` : "";
  return `${message.event === NDX_TURN_EVENT.ModelResume ? "Resuming model request" : "Model request"} (${iteration}${count})`;
}

function modelProgressEventText(message: NDXSessionEventMessage): string {
  const contents = message.contents as { elapsedMs?: unknown; message?: unknown };
  if (typeof contents.message === "string" && contents.message.trim()) {
    return contents.message.trim();
  }
  const seconds = typeof contents.elapsedMs === "number" ? Math.max(1, Math.round(contents.elapsedMs / 1000)) : undefined;
  return seconds ? `Model request still running (${seconds}s elapsed). Interrupt the session if you do not want to keep waiting.` : "Model request still running. Interrupt the session if you do not want to keep waiting.";
}

function compactEventText(message: NDXSessionEventMessage): string {
  const contents = message.contents as { kind?: unknown; percent?: unknown; remainingTokens?: unknown; requiredTokens?: unknown; sourceRowCount?: unknown; summaryTokens?: unknown };
  if (contents.kind === "compact_completed") {
    const rows = typeof contents.sourceRowCount === "number" ? `, ${contents.sourceRowCount} rows` : "";
    const summary = typeof contents.summaryTokens === "number" ? `, ${contents.summaryTokens} summary tokens` : "";
    return `Context compact completed${rows}${summary}`;
  }
  const percent = typeof contents.percent === "number" ? `, ${contents.percent}% used` : "";
  const remaining = typeof contents.remainingTokens === "number" && typeof contents.requiredTokens === "number" ? `, ${contents.remainingTokens}/${contents.requiredTokens} tokens remaining/required` : "";
  return `Context compact started${percent}${remaining}`;
}

function batchFromMessage(message: NDXSessionEventMessage): TurnBatchState {
  const contents = message.contents as { iteration?: unknown; toolCalls?: unknown };
  const calls = Array.isArray(contents.toolCalls) ? contents.toolCalls : [];
  return {
    key: message.dataid,
    iteration: typeof contents.iteration === "number" ? contents.iteration : 1,
    collapsed: false,
    manuallyExpanded: false,
    assistantText: "",
    reasoningText: "",
    modelEvents: [],
    tools: calls.map((toolCall, index) => ({
      key: toolCallIdFromCall(toolCall) ?? `${message.dataid}:${index}`,
      tool: toolNameFromCall(toolCall),
      callId: toolCallIdFromCall(toolCall),
      args: toolArgumentsFromCall(toolCall),
      status: "queued",
      progress: []
    }))
  };
}

function startedTool(message: NDXSessionEventMessage): TurnToolState {
  const contents = message.contents as { tool?: unknown; callId?: unknown; args?: unknown; startedAt?: unknown };
  return {
    key: typeof contents.callId === "string" ? contents.callId : `${message.dataid}:${String(contents.tool ?? "tool")}`,
    tool: typeof contents.tool === "string" ? contents.tool : "unknown tool",
    callId: typeof contents.callId === "string" ? contents.callId : undefined,
    args: contents.args && typeof contents.args === "object" && !Array.isArray(contents.args) ? contents.args as Record<string, unknown> : undefined,
    status: "running",
    startedAt: typeof contents.startedAt === "string" ? contents.startedAt : undefined,
    progress: []
  };
}

function finishedTool(result: unknown): Partial<TurnToolState> {
  if (!result || typeof result !== "object") return { status: "failed" };
  const record = result as { status?: unknown; success?: unknown; endedAt?: unknown };
  const status = record.status === "cancelled" || record.status === "timeout" ? record.status : record.success === false ? "failed" : "succeeded";
  return { status, endedAt: typeof record.endedAt === "string" ? record.endedAt : undefined };
}

function interruptStatus(contents: unknown): TurnToolState["status"] {
  const status = contents && typeof contents === "object" ? (contents as { status?: unknown }).status : undefined;
  return status === "timeout" ? "timeout" : "cancelled";
}

function updateIteration(turn: TurnFlowState, iteration: number, update: (batch: TurnBatchState) => TurnBatchState): TurnFlowState {
  const existingIndex = turn.batches.findIndex((batch) => batch.iteration === iteration);
  if (existingIndex >= 0) {
    const previousIteration = Math.max(0, ...turn.batches.filter((batch) => batch.iteration < iteration).map((batch) => batch.iteration));
    const batches = turn.batches.map((batch, index) => {
      if (index === existingIndex) return { ...update(batch), collapsed: false };
      if (batch.iteration === previousIteration && !batch.manuallyExpanded) return { ...batch, collapsed: true };
      return batch;
    });
    return { ...turn, batches };
  }
  const previousIteration = Math.max(0, ...turn.batches.map((batch) => batch.iteration));
  return {
    ...turn,
    batches: [
      ...turn.batches.map((batch) => batch.iteration === previousIteration && !batch.manuallyExpanded ? { ...batch, collapsed: true } : batch),
      update(emptyIteration(turn, iteration))
    ]
  };
}

function emptyIteration(turn: TurnFlowState, iteration: number): TurnBatchState {
  return {
    key: `${turn.id}:iteration:${iteration}`,
    iteration,
    collapsed: false,
    manuallyExpanded: false,
    assistantText: "",
    reasoningText: "",
    modelEvents: [],
    tools: []
  };
}

function updateTool(turn: TurnFlowState, message: NDXSessionEventMessage, update: (tool: TurnToolState) => TurnToolState): TurnFlowState {
  const contents = message.contents as { tool?: unknown; callId?: unknown; result?: unknown };
  const result = contents.result && typeof contents.result === "object" ? contents.result as { tool?: unknown; callId?: unknown; toolCallId?: unknown } : undefined;
  const callId = typeof contents.callId === "string" ? contents.callId : typeof result?.callId === "string" ? result.callId : typeof result?.toolCallId === "string" ? result.toolCallId : undefined;
  const toolName = typeof contents.tool === "string" ? contents.tool : typeof result?.tool === "string" ? result.tool : undefined;
  return updateIteration(turn, eventIteration(message), (batch) => ({
    ...batch,
    tools: batch.tools.map((tool) => (callId ? tool.callId === callId : tool.tool === toolName) ? update(tool) : tool)
  }));
}

function updateToolFromResult(turn: TurnFlowState, result: unknown, iteration: number): TurnFlowState {
  if (!result || typeof result !== "object") return turn;
  const record = result as { toolCallId?: unknown; tool?: unknown; success?: unknown };
  const callId = typeof record.toolCallId === "string" ? record.toolCallId : undefined;
  const toolName = typeof record.tool === "string" ? record.tool : undefined;
  const args = toolArgsForResult(turn, result);
  const nextTurn = updateIteration(turn, iteration, (batch) => ({
    ...batch,
    tools: batch.tools.map((tool) => (callId ? tool.callId === callId : tool.tool === toolName) ? { ...tool, status: record.success === false ? "failed" : "succeeded", result } : tool)
  }));
  return upsertSidebarItemsFromResult(upsertChangedFileFromResult(nextTurn, result), result, args);
}

function completeOpenTools(turn: TurnFlowState): TurnFlowState {
  return {
    ...turn,
    batches: turn.batches.map((batch) => ({
      ...batch,
      tools: batch.tools.map((tool) => tool.status === "queued" || tool.status === "running" ? { ...tool, status: "failed" } : tool)
    }))
  };
}

function upsertTool(batch: TurnBatchState, nextTool: TurnToolState): TurnBatchState {
  const found = batch.tools.some((tool) => tool.callId ? tool.callId === nextTool.callId : tool.tool === nextTool.tool);
  return {
    ...batch,
    tools: found ? batch.tools.map((tool) => (tool.callId ? tool.callId === nextTool.callId : tool.tool === nextTool.tool) ? { ...tool, ...nextTool, progress: tool.progress } : tool) : [...batch.tools, nextTool]
  };
}

function mergeBatchTools(currentTools: TurnToolState[], nextTools: TurnToolState[]): TurnToolState[] {
  return nextTools.reduce((tools, nextTool) => upsertTool({ key: "batch", iteration: 0, collapsed: false, assistantText: "", reasoningText: "", modelEvents: [], tools }, nextTool).tools, currentTools);
}

function upsertSidebarItem(turn: TurnFlowState, item: TurnFlowState["sidebarItems"][number]): TurnFlowState {
  const key = item.key ?? `${item.group.id}:${item.kind ?? "item"}:${item.title}:${item.body ?? ""}`;
  const items = turn.sidebarItems.filter((current) => {
    const currentKey = current.key ?? `${current.group.id}:${current.kind ?? "item"}:${current.title}:${current.body ?? ""}`;
    return currentKey !== key;
  });
  return { ...turn, sidebarItems: [...items, { ...item, key }] };
}

function upsertChangedFileFromResult(turn: TurnFlowState, result: unknown): TurnFlowState {
  const changedFile = changedFileSidebarItem(result);
  return changedFile ? upsertSidebarItem(turn, changedFile) : turn;
}

function upsertSidebarItemsFromResult(turn: TurnFlowState, result: unknown, args?: Record<string, unknown>): TurnFlowState {
  const sidebarItems = sidebarItemsFromToolResult(result, args);
  return sidebarItems.reduce(upsertSidebarItem, turn);
}

function sidebarItemsFromToolResult(result: unknown, args?: Record<string, unknown>): TurnFlowState["sidebarItems"] {
  if (!result || typeof result !== "object") return [];
  const record = result as { tool?: unknown; success?: unknown; output?: unknown; outputValue?: unknown; toolCallId?: unknown; callId?: unknown };
  if (record.success === false || typeof record.tool !== "string") return [];
  const outputText = typeof record.output === "string" ? record.output : stringifyToolOutput(record.output);
  const outputValue = record.outputValue && typeof record.outputValue === "object" ? record.outputValue : parseJsonObject(outputText);
  const callId = typeof record.callId === "string" ? record.callId : typeof record.toolCallId === "string" ? record.toolCallId : record.tool;

  if (record.tool === "read_file") {
    const path = outputValue && typeof outputValue === "object" && typeof (outputValue as { path?: unknown }).path === "string" ? (outputValue as { path: string }).path : undefined;
    if (!path || path.trim().length === 0) return [];
    return [
      {
        group: { id: "file-references", title: "파일참조" },
        key: `file-reference:${path}`,
        title: path.split(/[\\/]/).pop() || path,
        body: path,
        kind: "file_reference"
      }
    ];
  }

  if (record.tool === "loadSkill") {
    const name = outputText.match(/<skill>\s*<name>([^<]+)<\/name>/)?.[1]?.trim();
    const path = outputText.match(/<path>([^<]+)<\/path>/)?.[1]?.trim();
    if (!name) return [];
    return [
      {
        group: { id: "skills", title: "스킬" },
        key: `skill:${name}:${path ?? ""}`,
        title: name,
        ...(path ? { body: path } : {}),
        kind: "skill"
      }
    ];
  }

  if (record.tool === "web_fetch") {
    const item = webFetchSidebarItem(outputValue, callId);
    return item ? [item] : [];
  }

  if (record.tool === "web_search") {
    const item = webSearchSidebarItem(outputValue, callId);
    return item ? [item] : [];
  }

  if (record.tool === "askUserQuestion") {
    const item = askUserQuestionSidebarItem(outputValue, args, callId);
    return item ? [item] : [];
  }

  if (record.tool === "prompt_rewrite") {
    const item = promptRewriteSidebarItem(outputValue, callId);
    return item ? [item] : [];
  }

  if (record.tool === "session_history") {
    const item = sessionHistorySidebarItem(outputValue, callId);
    return item ? [item] : [];
  }

  return [];
}

function webFetchSidebarItem(outputValue: unknown, callId: string): TurnFlowState["sidebarItems"][number] | undefined {
  if (!outputValue || typeof outputValue !== "object") return undefined;
  const payload = outputValue as { url?: unknown; finalUrl?: unknown; redirectUrl?: unknown; status?: unknown; contentType?: unknown; bytes?: unknown; truncated?: unknown };
  const url = typeof payload.url === "string" && payload.url.trim() ? payload.url.trim() : undefined;
  const finalUrl = typeof payload.finalUrl === "string" && payload.finalUrl.trim() ? payload.finalUrl.trim() : undefined;
  const redirectUrl = typeof payload.redirectUrl === "string" && payload.redirectUrl.trim() ? payload.redirectUrl.trim() : undefined;
  const displayUrl = finalUrl ?? redirectUrl ?? url;
  if (!displayUrl) return undefined;
  const status = typeof payload.status === "number" ? String(payload.status) : "";
  const contentType = typeof payload.contentType === "string" && payload.contentType.trim() ? payload.contentType.split(";")[0]?.trim() ?? "" : "";
  const bytes = typeof payload.bytes === "number" && Number.isFinite(payload.bytes) ? formatBytes(payload.bytes) : "";
  const flags = [status, contentType, bytes, payload.truncated === true ? "일부만 표시" : ""].filter(Boolean);
  return {
    group: { id: "web-references", title: "웹 참조" },
    key: `web-fetch:${displayUrl}`,
    title: hostname(displayUrl) || displayUrl,
    body: compactText([flags.join(" · "), displayUrl].filter(Boolean).join(" · "), 180),
    kind: "web_fetch"
  };
}

function webSearchSidebarItem(outputValue: unknown, callId: string): TurnFlowState["sidebarItems"][number] | undefined {
  if (!outputValue || typeof outputValue !== "object") return undefined;
  const payload = outputValue as { query?: unknown; provider?: unknown; durationSeconds?: unknown; results?: unknown };
  const query = typeof payload.query === "string" && payload.query.trim() ? payload.query.trim() : undefined;
  if (!query) return undefined;
  const provider = typeof payload.provider === "string" && payload.provider.trim() ? payload.provider.trim() : "web";
  const results = Array.isArray(payload.results) ? payload.results : [];
  const hosts = uniqueStrings(results.map((result) => {
    if (!result || typeof result !== "object") return "";
    const source = (result as { source?: unknown }).source;
    if (typeof source === "string" && source.trim()) return source.trim();
    const url = (result as { url?: unknown }).url;
    return typeof url === "string" ? hostname(url) : "";
  })).slice(0, 3);
  const duration = typeof payload.durationSeconds === "number" && Number.isFinite(payload.durationSeconds) ? `${payload.durationSeconds}s` : "";
  return {
    group: { id: "web-searches", title: "웹 검색" },
    key: `web-search:${query}:${provider}:${callId}`,
    title: query,
    body: compactText([provider, `${results.length}개 결과`, duration, hosts.join(", ")].filter(Boolean).join(" · "), 180),
    kind: "web_search"
  };
}

function askUserQuestionSidebarItem(outputValue: unknown, args: Record<string, unknown> | undefined, callId: string): TurnFlowState["sidebarItems"][number] | undefined {
  if (!outputValue || typeof outputValue !== "object") return undefined;
  const answers = (outputValue as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return undefined;
  const questions = Array.isArray(args?.questions) ? args.questions : [];
  const summaries: string[] = [];
  for (const question of questions) {
    if (!question || typeof question !== "object" || Array.isArray(question)) continue;
    const next = question as { id?: unknown; header?: unknown; question?: unknown; inputType?: unknown; isSecret?: unknown };
    if (typeof next.id !== "string" || !next.id.trim()) continue;
    const answer = (answers as Record<string, unknown>)[next.id];
    const answerRecord = answer && typeof answer === "object" && !Array.isArray(answer) ? answer as { answers?: unknown; attachments?: unknown } : undefined;
    const answerTexts = Array.isArray(answerRecord?.answers) ? answerRecord.answers.map((item) => String(item).trim()).filter(Boolean) : [];
    const attachmentCount = Array.isArray(answerRecord?.attachments) ? answerRecord.attachments.length : 0;
    const label = typeof next.header === "string" && next.header.trim()
      ? next.header.trim()
      : typeof next.question === "string" && next.question.trim()
        ? next.question.trim()
        : next.id;
    const secret = next.isSecret === true || next.inputType === "secret";
    const answerText = secret ? "비밀 응답 완료" : answerTexts.length > 0 ? answerTexts.join(", ") : "응답 완료";
    summaries.push(`${label}: ${answerText}${attachmentCount > 0 ? `, 첨부 ${attachmentCount}개` : ""}`);
  }
  const fallbackCount = Object.keys(answers).length;
  return {
    group: { id: "questions", title: "사용자 문답" },
    key: `ask-user-question:${callId}`,
    title: "문답 완료",
    body: compactText(summaries.length > 0 ? summaries.join(" · ") : `${fallbackCount}개 답변`, 220),
    kind: "ask_user_question"
  };
}

function promptRewriteSidebarItem(outputValue: unknown, callId: string): TurnFlowState["sidebarItems"][number] | undefined {
  if (!outputValue || typeof outputValue !== "object") return undefined;
  const payload = outputValue as { rewritten_prompt?: unknown; report?: unknown; should_ask_user?: unknown; pass_through?: unknown };
  const rewrittenPrompt = typeof payload.rewritten_prompt === "string" && payload.rewritten_prompt.trim() ? payload.rewritten_prompt.trim() : undefined;
  const report = typeof payload.report === "string" && payload.report.trim() ? payload.report.trim() : undefined;
  if (!rewrittenPrompt && !report) return undefined;
  return {
    group: { id: "prompt-rewrites", title: "프롬프트 재작성" },
    key: `prompt-rewrite:${callId}`,
    title: payload.pass_through === true ? "프롬프트 유지" : "프롬프트 재작성 완료",
    body: compactText([payload.should_ask_user === true ? "사용자 확인 권장" : "", rewrittenPrompt ?? report].filter(Boolean).join(" · "), 220),
    kind: "prompt_rewrite"
  };
}

function sessionHistorySidebarItem(outputValue: unknown, callId: string): TurnFlowState["sidebarItems"][number] | undefined {
  if (!outputValue || typeof outputValue !== "object") return undefined;
  const payload = outputValue as { mode?: unknown; scope?: unknown; query?: unknown; results?: unknown };
  const results = Array.isArray(payload.results) ? payload.results : [];
  const query = typeof payload.query === "string" && payload.query.trim() ? payload.query.trim() : undefined;
  const mode = typeof payload.mode === "string" && payload.mode.trim() ? payload.mode.trim() : "history";
  const scope = sessionHistoryScopeText(payload.scope);
  const titles = uniqueStrings(results.map((result) => {
    if (!result || typeof result !== "object") return "";
    const title = (result as { title?: unknown }).title;
    if (typeof title === "string" && title.trim()) return title.trim();
    const path = (result as { path?: unknown }).path;
    if (typeof path === "string" && path.trim()) return path.trim().split(/[\\/]/).pop() || path.trim();
    const sessionid = (result as { sessionid?: unknown }).sessionid;
    return typeof sessionid === "string" ? sessionid : "";
  })).slice(0, 3);
  return {
    group: { id: "session-references", title: "세션 참조" },
    key: `session-history:${scope}:${query ?? "recent"}:${callId}`,
    title: query ? `세션 검색: ${query}` : "최근 세션 참조",
    body: compactText([scope, mode, `${results.length}개 결과`, titles.join(", ")].filter(Boolean).join(" · "), 220),
    kind: "session_history"
  };
}

function changedFileSidebarItem(result: unknown): TurnFlowState["sidebarItems"][number] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as { tool?: unknown; success?: unknown; output?: unknown; outputValue?: unknown };
  if (record.success === false || (record.tool !== "write_file" && record.tool !== "edit")) {
    return undefined;
  }
  const outputValue = record.outputValue && typeof record.outputValue === "object" ? record.outputValue as { path?: unknown } : undefined;
  let path = typeof outputValue?.path === "string" ? outputValue.path : undefined;
  if (!path && typeof record.output === "string") {
    try {
      const parsed = JSON.parse(record.output) as unknown;
      if (parsed && typeof parsed === "object" && typeof (parsed as { path?: unknown }).path === "string") {
        path = (parsed as { path: string }).path;
      }
    } catch {
      path = undefined;
    }
  }
  if (!path || path.trim().length === 0) return undefined;
  return {
    group: { id: "changed-files", title: "변경 파일" },
    key: `changed-file:${path}`,
    title: path.split(/[\\/]/).pop() || path,
    body: path,
    kind: typeof record.tool === "string" ? record.tool : "file"
  };
}

function toolArgsForResult(turn: TurnFlowState, result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as { callId?: unknown; toolCallId?: unknown; tool?: unknown };
  const callId = typeof record.callId === "string" ? record.callId : typeof record.toolCallId === "string" ? record.toolCallId : undefined;
  const toolName = typeof record.tool === "string" ? record.tool : undefined;
  for (const batch of turn.batches) {
    const tool = batch.tools.find((candidate) => callId ? candidate.callId === callId : candidate.tool === toolName);
    if (tool?.args) return tool.args;
  }
  return undefined;
}

function toolArgumentsFromCall(toolCall: unknown): Record<string, unknown> | undefined {
  if (!toolCall || typeof toolCall !== "object") return undefined;
  const record = toolCall as { arguments?: unknown; input?: unknown; function?: unknown };
  const raw = record.arguments ?? record.input ?? (record.function && typeof record.function === "object" ? (record.function as { arguments?: unknown }).arguments : undefined);
  if (typeof raw === "string") {
    const parsed = parseJsonObject(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { input: raw };
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
}

function parseJsonObject(text: string): unknown {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === null || typeof output === "undefined") return "";
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function compactText(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text;
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`;
  return `${Math.round(value / 1024 / 102.4) / 10}MB`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function sessionHistoryScopeText(scope: unknown): string {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return "scope";
  const record = scope as { type?: unknown; projectname?: unknown; sessionid?: unknown };
  if (record.type === "project") return typeof record.projectname === "string" ? `project:${record.projectname}` : "project";
  if (record.type === "session") return typeof record.sessionid === "string" ? `session:${record.sessionid}` : "session";
  if (record.type === "all") return "all";
  return "scope";
}
