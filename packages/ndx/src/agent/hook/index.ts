import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runToolProcess } from "../tool/execute/process.js";
import { recordSelfcheckHookRun } from "../selfcheck/hookRun.js";
import { systemNDXHookPlan } from "./system.js";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXCompactReport } from "../compact/index.js";
import type { NDXContextUsage } from "../contextusage/index.js";
import type { NDXSessionRequestQueueConsumerBridge, NDXSessionRequestQueueEditBridge } from "../requestQue/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionDataRow, NDXSessionRow } from "../session/types.js";
import type { NDXResolvedTool, NDXToolExecutionResult } from "../tool/types.js";
import type { NDXAgentLanguage, NDXAgentResourceResolver } from "../../common/resource/index.js";
import type { NDXCotWorkContents, NDXSessionAttachmentReference, NDXSidebarItem } from "../../common/protocol/index.js";
import type { NDXModelRequestPrefixDrift, NDXModelRequestPrefixSnapshot } from "./base/prefixDrift/index.js";
import type { ResponseInputItem, ResponsePreparedRequest } from "ndx/common/responseapi";

export const NDX_HOOK_EVENT_NAMES = [
  NDX_TURN_EVENT.RequestReceived,
  NDX_TURN_EVENT.ContextPrepared,
  NDX_TURN_EVENT.ModelRequest,
  NDX_TURN_EVENT.ModelResponding,
  NDX_TURN_EVENT.ToolCalled,
  NDX_TURN_EVENT.ToolResultsCollected,
  NDX_TURN_EVENT.TurnEnd
] as const;

export type NDXHookEventName = typeof NDX_HOOK_EVENT_NAMES[number];
export type NDXHookSource = "system" | "ndx";
export type NDXHookEffectType = "noeffect" | "stopturn";

export type NDXHookCompactEffect = {
  report: NDXCompactReport;
};

export type NDXHookTurnEndRequestEffect = {
  text: string;
  attachments?: NDXSessionAttachmentReference[];
  model?: NDXModelConfig;
  queueClaim?: {
    sessionid: string;
    itemid: string;
  };
};

export type NDXHookTurnEvent =
  | { type: typeof NDX_TURN_EVENT.SidebarItem; iteration: number; tool: string; callId?: string; item: NDXSidebarItem; contextUsage: NDXContextUsage }
  | { type: typeof NDX_TURN_EVENT.CotWork; iteration: number; tool: string; callId?: string; contents: NDXCotWorkContents; contextUsage: NDXContextUsage };

export type NDXHookContext = {
  event: NDXHookEventName;
  database: NDXDatabase;
  session: NDXSessionRow;
  input?: NDXSessionDataRow;
  assistant?: NDXSessionDataRow;
  requestText: string;
  userHome: string;
  projectHome: string;
  language?: NDXAgentLanguage;
  resource?: NDXAgentResourceResolver;
  iteration?: number;
  messages?: ResponseInputItem[];
  previousModelRequestStablePrefix?: NDXModelRequestPrefixSnapshot;
  modelRequest?: ResponsePreparedRequest;
  previousModelRequest?: ResponsePreparedRequest;
  sessionDataRows?: NDXSessionDataRow[];
  availableTools?: NDXResolvedTool[];
  modelTools?: Record<string, unknown>[];
  contextUsage?: NDXContextUsage;
  assistantText?: string;
  modelResponse?: NDXModelRespondingContext;
  toolCalls?: unknown[];
  toolResults?: NDXToolExecutionResult[];
  sessionRequestQueueBridge?: NDXSessionRequestQueueEditBridge;
  sessionRequestQueueConsumerBridge?: NDXSessionRequestQueueConsumerBridge;
  emitTurnEvent?: (event: NDXHookTurnEvent) => Promise<void>;
  error?: unknown;
};

export type NDXHookEffect = {
  type?: NDXHookEffectType;
  replaceRequestText?: string;
  replaceMessages?: ResponseInputItem[];
  appendMessages?: ResponseInputItem[];
  replaceModelTools?: Record<string, unknown>[];
  replaceToolCalls?: unknown[];
  replaceToolResults?: NDXToolExecutionResult[];
  finalAssistantText?: string;
  interruptModelResponse?: boolean;
  interruptReason?: string;
  compact?: NDXHookCompactEffect;
  turnEndRequest?: NDXHookTurnEndRequestEffect;
  prefixDrifts?: NDXModelRequestPrefixDrift[];
  stopTurn?: boolean;
  diagnostics?: string[];
};

export type NDXHookCodeExecutor = {
  kind: "code";
  name: string;
  source: "system";
  run: (context: Readonly<NDXHookContext>) => void | NDXHookEffect | Promise<void | NDXHookEffect>;
};

export type NDXHookProcessDefinition = {
  name?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stdin?: string;
  cwd?: string;
  timeoutMs?: number;
};

export type NDXHookProcessExecutor = {
  kind: "process";
  name: string;
  source: "ndx";
  definitionPath: string;
  directory: string;
  process: NDXHookProcessDefinition;
};

export type NDXHookExecutor = NDXHookCodeExecutor | NDXHookProcessExecutor;
export type NDXHookPlan = Partial<Record<NDXHookEventName, NDXHookExecutor[]>>;
export type NDXHookRuntime = {
  plan: NDXHookPlan;
};

export type { NDXModelRequestPrefixDrift, NDXModelRequestPrefixSnapshot } from "./base/prefixDrift/index.js";

export type NDXModelRespondingContext =
  | {
      type: "text";
      delta: string;
      content: string;
      textRole?: "assistant_text" | "implicit_thinking_candidate";
      elapsedMs: number;
      sequence: number;
    }
  | {
      type: "reasoning";
      summary: string;
      content: string;
      elapsedMs: number;
      sequence: number;
    }
  | {
      type: "tool_call";
      toolCall: unknown;
      elapsedMs: number;
      sequence: number;
    };

export type NDXHookExecution = {
  event: NDXHookEventName;
  hook: string;
  source: NDXHookSource;
  effect: NDXHookEffect;
  error?: unknown;
  processResult?: NDXToolExecutionResult;
};

export type NDXHookRunResult = {
  event: NDXHookEventName;
  executions: NDXHookExecution[];
  effect: NDXHookEffect;
};

export type NDXHookRuntimeOptions = {
  userHome?: string;
  projectHome?: string;
  systemHooks?: NDXHookPlan;
  ndxHooks?: NDXHookPlan;
};

export async function loadNDXHookRuntime(options: NDXHookRuntimeOptions = {}): Promise<NDXHookRuntime> {
  const userHome = options.userHome ?? os.homedir();
  const projectHome = options.projectHome ?? process.cwd();
  const ndxHooks = options.ndxHooks ?? await loadNDXHookPlan({ userHome, projectHome });
  return createNDXHookRuntime(options.systemHooks ?? systemNDXHookPlan(), ndxHooks);
}

export function createNDXHookRuntime(systemHooks: NDXHookPlan = systemNDXHookPlan(), ndxHooks: NDXHookPlan = {}): NDXHookRuntime {
  return {
    plan: createNDXHookPlan([systemHooks, ndxHooks])
  };
}

export function createNDXHookPlan(plans: NDXHookPlan[] = []): NDXHookPlan {
  const output: NDXHookPlan = {};
  for (const plan of plans) {
    for (const event of NDX_HOOK_EVENT_NAMES) {
      const executors = plan[event];
      output[event] = [...(output[event] ?? []), ...(executors ?? [])];
    }
  }
  return output;
}

export function registerNDXHook(plan: NDXHookPlan, event: NDXHookEventName, executor: NDXHookExecutor): NDXHookPlan {
  plan[event] = [...(plan[event] ?? []), executor];
  return plan;
}

export async function runNDXHooks(runtime: NDXHookRuntime | undefined, event: NDXHookEventName, context: Omit<NDXHookContext, "event">): Promise<NDXHookRunResult> {
  const executions: NDXHookExecution[] = [];
  const state: NDXHookContext = { ...context, event };
  let mergedEffect: NDXHookEffect = { type: "noeffect" };

  for (const executor of runtime?.plan[event] ?? []) {
    const execution = await runNDXHookExecutor(executor, state);
    executions.push(execution);
    mergedEffect = mergeNDXHookEffects([mergedEffect, execution.effect]);
    applyEffectToHookContext(state, execution.effect);
    if (isStopTurnEffect(execution.effect)) {
      break;
    }
  }

  const result = {
    event,
    executions,
    effect: normalizeNDXHookEffect(mergedEffect)
  };
  await recordSelfcheckHookRun(context.database, context, result).catch((error) => {
    context.database.logger?.warn("selfcheck.hookrun.record_failed", {
      sessionid: context.session.sessionid,
      event,
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return result;
}

export function logNDXHookRunResult(database: NDXDatabase, sessionid: string, result: NDXHookRunResult): void {
  if (result.executions.length === 0) {
    return;
  }
  const failures = result.executions.filter((execution) => execution.error);
  const diagnostics = result.effect.diagnostics ?? [];
  database.logger?.debug(NDX_TURN_EVENT.HookComplete, {
    sessionid,
    event: result.event,
    count: result.executions.length,
    failures: failures.length,
    diagnostics
  });
  for (const failure of failures) {
    database.logger?.warn(NDX_TURN_EVENT.HookFailed, {
      sessionid,
      event: result.event,
      hook: failure.hook,
      source: failure.source,
      error: failure.error instanceof Error ? failure.error.message : String(failure.error)
    });
  }
}

export function mergeNDXHookEffects(effects: NDXHookEffect[]): NDXHookEffect {
  const merged: NDXHookEffect = { type: "noeffect" };
  for (const rawEffect of effects) {
    const effect = normalizeNDXHookEffect(rawEffect);
    if (effect.replaceMessages) {
      merged.replaceMessages = effect.replaceMessages;
    }
    if (typeof effect.replaceRequestText === "string") {
      merged.replaceRequestText = effect.replaceRequestText;
    }
    if (effect.appendMessages) {
      merged.appendMessages = [...(merged.appendMessages ?? []), ...effect.appendMessages];
    }
    if (effect.replaceModelTools) {
      merged.replaceModelTools = effect.replaceModelTools;
    }
    if (effect.replaceToolCalls) {
      merged.replaceToolCalls = effect.replaceToolCalls;
    }
    if (effect.replaceToolResults) {
      merged.replaceToolResults = effect.replaceToolResults;
    }
    if (typeof effect.finalAssistantText === "string") {
      merged.finalAssistantText = effect.finalAssistantText;
    }
    if (effect.interruptModelResponse) {
      merged.interruptModelResponse = true;
    }
    if (typeof effect.interruptReason === "string") {
      merged.interruptReason = effect.interruptReason;
    }
    if (effect.compact) {
      merged.compact = effect.compact;
    }
    if (effect.turnEndRequest && !merged.turnEndRequest) {
      merged.turnEndRequest = effect.turnEndRequest;
    }
    if (effect.prefixDrifts) {
      merged.prefixDrifts = [...(merged.prefixDrifts ?? []), ...effect.prefixDrifts];
    }
    if (isStopTurnEffect(effect)) {
      merged.type = "stopturn";
      merged.stopTurn = true;
    }
    if (effect.diagnostics) {
      merged.diagnostics = [...(merged.diagnostics ?? []), ...effect.diagnostics];
    }
  }
  return normalizeNDXHookEffect(merged);
}

export async function loadNDXHookPlan(options: { userHome: string; projectHome: string }): Promise<NDXHookPlan> {
  const plans: NDXHookPlan[] = [];
  const userNdx = path.join(options.userHome, ".ndx");
  const projectNdx = path.join(options.projectHome, ".ndx");
  const directUser = await readHookJson(path.join(userNdx, "hook", "hook.json"), "ndx");
  if (directUser) {
    plans.push(directUser.plan);
  }
  plans.push(...(await pluginHookPlans(path.join(userNdx, "plugins"))));
  const directProject = await readHookJson(path.join(projectNdx, "hook", "hook.json"), "ndx");
  if (directProject) {
    plans.push(directProject.plan);
  }
  plans.push(...(await pluginHookPlans(path.join(projectNdx, "plugins"))));
  return createNDXHookPlan(plans);
}

async function runNDXHookExecutor(executor: NDXHookExecutor, context: NDXHookContext): Promise<NDXHookExecution> {
  try {
    if (executor.kind === "code") {
      return {
        event: context.event,
        hook: executor.name,
        source: executor.source,
        effect: normalizeNDXHookEffect(await executor.run(context) || { type: "noeffect" })
      };
    }
    const processResult = await runToolProcess(hookProcessAsTool(executor), hookProcessArguments(context), undefined, {
      cwd: executor.process.cwd ? resolveHookPath(executor.directory, executor.process.cwd) : context.projectHome,
      userHome: context.userHome,
      projectHome: context.projectHome,
      sessionid: context.session.sessionid,
      timeoutMs: executor.process.timeoutMs
    });
    return {
      event: context.event,
      hook: executor.name,
      source: executor.source,
      effect: hookEffectFromProcessResult(processResult),
      processResult
    };
  } catch (error) {
    return {
      event: context.event,
      hook: executor.name,
      source: executor.source,
      effect: {
        type: "noeffect",
        diagnostics: [error instanceof Error ? error.message : String(error)]
      },
      error
    };
  }
}

function applyEffectToHookContext(context: NDXHookContext, effect: NDXHookEffect): void {
  if (effect.replaceMessages) {
    context.messages = effect.replaceMessages;
  }
  if (typeof effect.replaceRequestText === "string") {
    context.requestText = effect.replaceRequestText;
  }
  if (effect.appendMessages) {
    context.messages = [...(context.messages ?? []), ...effect.appendMessages];
  }
  if (effect.replaceModelTools) {
    context.modelTools = effect.replaceModelTools;
  }
  if (effect.replaceToolCalls) {
    context.toolCalls = effect.replaceToolCalls;
  }
  if (effect.replaceToolResults) {
    context.toolResults = effect.replaceToolResults;
  }
  if (typeof effect.finalAssistantText === "string") {
    context.assistantText = effect.finalAssistantText;
  }
}

function hookProcessAsTool(executor: NDXHookProcessExecutor): NDXResolvedTool {
  return {
    name: executor.name,
    source: "project",
    directory: executor.directory,
    definitionPath: executor.definitionPath,
    command: resolveHookPath(executor.directory, executor.process.command),
    args: (executor.process.args ?? []).map((item) => resolveHookPath(executor.directory, item)),
    env: executor.process.env ?? {},
    stdin: executor.process.stdin ?? "{context}",
    schema: {
      type: "function",
      name: executor.name,
      parameters: {
        type: "object",
        properties: {
          context: { type: "string" }
        }
      }
    }
  };
}

function hookProcessArguments(context: NDXHookContext): Record<string, unknown> {
  return {
    context: JSON.stringify({
      event: context.event,
      session: context.session,
      input: context.input,
      assistant: context.assistant,
      requestText: context.requestText,
      userHome: context.userHome,
      projectHome: context.projectHome,
      iteration: context.iteration,
      messages: context.messages,
      previousModelRequestStablePrefix: context.previousModelRequestStablePrefix,
      modelRequest: context.modelRequest,
      previousModelRequest: context.previousModelRequest,
      availableTools: context.availableTools,
      modelTools: context.modelTools,
      contextUsage: context.contextUsage,
      assistantText: context.assistantText,
      modelResponse: context.modelResponse,
      toolCalls: context.toolCalls,
      toolResults: context.toolResults,
      error: context.error instanceof Error ? { message: context.error.message, name: context.error.name } : context.error
    })
  };
}

function hookEffectFromProcessResult(result: NDXToolExecutionResult): NDXHookEffect {
  if (!result.success) {
    return {
      type: "noeffect",
      diagnostics: [result.output || result.error || `${result.tool} failed`]
    };
  }
  if (result.outputValue && typeof result.outputValue === "object" && !Array.isArray(result.outputValue)) {
    return normalizeNDXHookEffect(result.outputValue as NDXHookEffect);
  }
  try {
    const parsed = JSON.parse(result.output) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? normalizeNDXHookEffect(parsed as NDXHookEffect)
      : { type: "noeffect" };
  } catch {
    return { type: "noeffect" };
  }
}

function normalizeNDXHookEffect(effect: NDXHookEffect): NDXHookEffect {
  const type = effect.type === "stopturn" || effect.stopTurn ? "stopturn" : "noeffect";
  return {
    ...effect,
    type,
    stopTurn: type === "stopturn"
  };
}

function isStopTurnEffect(effect: NDXHookEffect): boolean {
  return effect.type === "stopturn" || effect.stopTurn === true;
}

async function pluginHookPlans(pluginRoot: string): Promise<NDXHookPlan[]> {
  const hookFiles = await Promise.all((await childDirectories(pluginRoot)).map(async (pluginDirectory) => {
    const hook = await readHookJson(path.join(pluginDirectory, "hook", "hook.json"), "ndx");
    return hook ? { ...hook, pluginName: path.basename(pluginDirectory) } : undefined;
  }));
  return hookFiles
    .filter((hook): hook is { pluginName: string; priority: number; plan: NDXHookPlan } => Boolean(hook))
    .sort((left, right) => left.priority - right.priority || left.pluginName.localeCompare(right.pluginName))
    .map((hook) => hook.plan);
}

async function readHookJson(filePath: string, source: "ndx"): Promise<{ priority: number; plan: NDXHookPlan } | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`hook.json must be an object: ${filePath}`);
  }
  const record = parsed as Record<string, unknown>;
  const priority = typeof record.priority === "number" && Number.isFinite(record.priority) ? record.priority : 0;
  const plan: NDXHookPlan = {};
  for (const event of NDX_HOOK_EVENT_NAMES) {
    if (!Object.hasOwn(record, event)) {
      continue;
    }
    const executors = normalizeHookJsonExecutors(record[event], filePath, source);
    if (executors.length > 0) {
      plan[event] = executors;
    }
  }
  return { priority, plan };
}

function normalizeHookJsonExecutors(value: unknown, filePath: string, source: "ndx"): NDXHookProcessExecutor[] {
  if (!Array.isArray(value)) {
    throw new Error(`hook event value must be an array: ${filePath}`);
  }
  const directory = path.dirname(filePath);
  const entries = value.length === 1 && Array.isArray(value[0]) ? value[0] : value;
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`hook executor must be an object: ${filePath}`);
    }
    const record = entry as { name?: unknown; tool?: unknown; command?: unknown; args?: unknown; env?: unknown; stdin?: unknown; cwd?: unknown; timeoutMs?: unknown };
    const tool = record.tool && typeof record.tool === "object" && !Array.isArray(record.tool) ? record.tool as Record<string, unknown> : record;
    const command = typeof tool.command === "string" && tool.command.trim() ? tool.command.trim() : "";
    if (!command) {
      throw new Error(`hook executor command is required: ${filePath}`);
    }
    return {
      kind: "process",
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : `${path.basename(filePath)}#${index + 1}`,
      source,
      definitionPath: filePath,
      directory,
      process: {
        command,
        args: Array.isArray(tool.args) ? tool.args.map(String) : [],
        env: normalizeStringRecord(tool.env),
        stdin: typeof tool.stdin === "string" ? tool.stdin : undefined,
        cwd: typeof tool.cwd === "string" ? tool.cwd : undefined,
        timeoutMs: typeof tool.timeoutMs === "number" && Number.isFinite(tool.timeoutMs) ? tool.timeoutMs : undefined
      }
    };
  });
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item)]));
}

function resolveHookPath(directory: string, value: string): string {
  return value.startsWith("./") || value.startsWith("../") ? path.join(directory, value) : value;
}

async function childDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)).sort();
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT");
}
