import { spawn } from "node:child_process";
import os from "node:os";
import { toServerContainerPath } from "../../../../server/common/index.js";
import { routeToolAgentCallLine } from "./agentcall/index.js";
import { TOOL_RUNTIME_ARG_HANDLERS } from "./systemarg/handlers.js";
import { NDX_TOOL_RUNTIME_ARG_NAMES } from "../types.js";
import type { NDXResolvedTool, NDXToolExecutionOptions, NDXToolExecutionResult, NDXToolExecutionStatus, NDXToolProcessEvent } from "../types.js";
import type { NDXToolRuntimeArgName } from "../types.js";

export async function runToolProcess(
  tool: NDXResolvedTool,
  toolArgs: Record<string, unknown>,
  callId: string | undefined,
  options: NDXToolExecutionOptions
): Promise<NDXToolExecutionResult> {
  const normalizedToolArgs = normalizeToolPathArguments(toolArgs, options);
  const serializedArgs = JSON.stringify(normalizedToolArgs);
  const systemArgContext = {
    sessionid: options.sessionid,
    turnContext: options.turnContext ?? {
      developer: { role: "system" as const, content: "" },
      user: { role: "user" as const, content: "" },
      history: []
    }
  };
  const fillTemplate = async (template: string): Promise<string> => {
    if ((NDX_TOOL_RUNTIME_ARG_NAMES as readonly string[]).includes(template)) {
      return TOOL_RUNTIME_ARG_HANDLERS[template as NDXToolRuntimeArgName](systemArgContext);
    }
    return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) => {
      const value = normalizedToolArgs[key];
      if (typeof value === "string") return value;
      if (typeof value === "undefined") return "";
      return JSON.stringify(value);
    });
  };
  const stdin = typeof tool.stdin === "string" ? await fillTemplate(tool.stdin) : undefined;
  const processArgs = await Promise.all(tool.args.map(fillTemplate));
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  await options.observer?.onToolStarted?.({ tool: tool.name, callId, startedAt, args: normalizedToolArgs });

  let child;
  try {
    child = spawn(tool.command, processArgs, {
      cwd: options.cwd || process.cwd(),
      detached: true,
      env: {
        ...process.env,
        ...tool.env,
        ...options.extraEnv,
        NDX_TOOL_NAME: tool.name,
        NDX_TOOL_CALL_ID: callId ?? "",
        NDX_TOOL_ARGUMENTS: serializedArgs,
        NDX_TOOL_DIRECTORY: tool.directory,
        NDX_USER_HOME: options.userHome ?? os.homedir(),
        NDX_PROJECT_HOME: options.projectHome ?? process.cwd()
      },
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    });
  } catch (error) {
    return failedWithoutProcess(tool.name, callId, error instanceof Error ? error.message : String(error), "spawn_error", startedAtDate);
  }

  let stdoutText = "";
  let stderrText = "";
  let stdoutLineBuffer = "";
  let terminatingStatus: "cancelled" | "timeout" | undefined;
  let exited = false;
  const events: NDXToolProcessEvent[] = [];
  const legacyStdoutLines: string[] = [];
  const invalidProtocolLines: string[] = [];
  let finalEvent: Extract<NDXToolProcessEvent, { type: "result" | "error" }> | undefined;
  const observerTasks: Promise<void>[] = [];
  let stdoutLineTask = Promise.resolve();

  if (!child.stdout || !child.stderr) {
    return failedWithoutProcess(tool.name, callId, "tool process did not expose stdout/stderr pipes", "spawn_error", startedAtDate);
  }

  const requestTerminate = (status: "cancelled" | "timeout") => {
    if (terminatingStatus) return;
    terminatingStatus = status;
    emitToolInterrupt("requested", status);
    emitToolInterrupt("sigterm", status, "SIGTERM");
    terminateProcessGroup(child.pid, "SIGTERM");
    setTimeout(() => {
      if (!exited) {
        emitToolInterrupt("sigkill", status, "SIGKILL");
        terminateProcessGroup(child.pid, "SIGKILL");
      }
    }, options.killGraceMs ?? 2_000).unref();
  };
  const scheduleObserver = (callback: () => void | Promise<void>) => {
    observerTasks.push(Promise.resolve().then(callback).catch(() => requestTerminate("cancelled")));
  };
  const emitProtocolEvent = (event: NDXToolProcessEvent) => {
    events.push(event);
    if (event.type === "result" || event.type === "error") {
      if (finalEvent) {
        invalidProtocolLines.push("multiple final tool protocol events");
      }
      finalEvent = event;
    }
    scheduleObserver(() => options.observer?.onToolProgress?.({ tool: tool.name, callId, event, receivedAt: new Date().toISOString() }));
  };
  const emitToolInterrupt = (phase: "requested" | "sigterm" | "sigkill" | "exited", status: "cancelled" | "timeout", signal?: NodeJS.Signals | null) => {
    scheduleObserver(() => options.observer?.onToolInterrupt?.({ tool: tool.name, callId, phase, status, signal, receivedAt: new Date().toISOString() }));
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutText += chunk;
    stdoutLineBuffer += chunk;
    const lines = stdoutLineBuffer.split(/\r?\n/);
    stdoutLineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      stdoutLineTask = stdoutLineTask.then(() => collectStdoutLine(line, emitProtocolEvent, legacyStdoutLines, invalidProtocolLines, options, { tool: tool.name, callId, sessionid: options.sessionid }));
    }
  });
  child.stderr.on("data", (chunk: string) => {
    stderrText += chunk;
  });

  if (stdin !== undefined) {
    if (!child.stdin) {
      return failedWithoutProcess(tool.name, callId, "tool process did not expose stdin pipe", "spawn_error", startedAtDate);
    }
    child.stdin.end(stdin);
  }

  const timeout = setTimeout(() => {
    requestTerminate("timeout");
  }, options.timeoutMs ?? 60_000);
  timeout.unref();

  const abort = () => {
    requestTerminate("cancelled");
  };
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });

  const result = await new Promise<NDXToolExecutionResult>((resolve) => {
    child.on("error", (error) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      resolve(buildResult(tool.name, callId, startedAtDate, "spawn_error", false, error.message, undefined, undefined, events, stdoutText, stderrText, undefined, undefined, error.message));
    });
    child.on("close", async (code, signal) => {
      exited = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      if (terminatingStatus) {
        emitToolInterrupt("exited", terminatingStatus, signal);
      }
      if (stdoutLineBuffer.length > 0) {
        stdoutLineTask = stdoutLineTask.then(() => collectStdoutLine(stdoutLineBuffer, emitProtocolEvent, legacyStdoutLines, invalidProtocolLines, options, { tool: tool.name, callId, sessionid: options.sessionid }));
      }
      await stdoutLineTask.catch((error) => {
        invalidProtocolLines.push(error instanceof Error ? error.message : String(error));
      });
      resolve(finalizeToolResult({
        tool: tool.name,
        callId,
        startedAtDate,
        terminatingStatus,
        finalEvent,
        events,
        legacyStdoutLines,
        invalidProtocolLines,
        stdoutText,
        stderrText,
        exitCode: code,
        signal
      }));
    });
  });

  await Promise.allSettled(observerTasks);
  await options.observer?.onToolFinished?.(result);
  return result;
}

async function collectStdoutLine(
  line: string,
  emitProtocolEvent: (event: NDXToolProcessEvent) => void,
  legacyStdoutLines: string[],
  invalidProtocolLines: string[],
  options: NDXToolExecutionOptions,
  agentCallContext: { tool: string; callId?: string; sessionid?: string }
) {
  if (!line.trim()) return;
  try {
    if (await routeToolAgentCallLine(line, options.agentCallHandlers, agentCallContext)) {
      return;
    }
  } catch (error) {
    invalidProtocolLines.push(error instanceof Error ? error.message : String(error));
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    legacyStdoutLines.push(line);
    return;
  }
  const event = normalizeToolProcessEvent(parsed);
  if (event) {
    emitProtocolEvent(event);
  } else {
    legacyStdoutLines.push(line);
    invalidProtocolLines.push(line);
  }
}

function normalizeToolProcessEvent(value: unknown): NDXToolProcessEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { type?: unknown; message?: unknown; data?: unknown; percent?: unknown; success?: unknown; output?: unknown; effects?: unknown };
  if (record.type === "progress" && typeof record.message === "string") {
    return {
      type: "progress",
      message: record.message,
      ...(typeof record.percent === "number" && Number.isFinite(record.percent) ? { percent: record.percent } : {}),
      ...(Object.hasOwn(record, "data") ? { data: record.data } : {})
    };
  }
  if (record.type === "debug" && typeof record.message === "string") {
    return { type: "debug", message: record.message, ...(Object.hasOwn(record, "data") ? { data: record.data } : {}) };
  }
  if (record.type === "result" && record.success === true) {
    return { type: "result", success: true, output: record.output, ...(Array.isArray(record.effects) ? { effects: record.effects as never } : {}) };
  }
  if (record.type === "error" && record.success === false && typeof record.message === "string") {
    return { type: "error", success: false, message: record.message, ...(Object.hasOwn(record, "output") ? { output: record.output } : {}), ...(Array.isArray(record.effects) ? { effects: record.effects as never } : {}) };
  }
  return undefined;
}

function finalizeToolResult(input: {
  tool: string;
  callId?: string;
  startedAtDate: Date;
  terminatingStatus?: "cancelled" | "timeout";
  finalEvent?: Extract<NDXToolProcessEvent, { type: "result" | "error" }>;
  events: NDXToolProcessEvent[];
  legacyStdoutLines: string[];
  invalidProtocolLines: string[];
  stdoutText: string;
  stderrText: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}): NDXToolExecutionResult {
  if (input.terminatingStatus) {
    return buildResult(input.tool, input.callId, input.startedAtDate, input.terminatingStatus, false, input.stderrText.trimEnd(), undefined, undefined, input.events, input.stdoutText, input.stderrText, input.exitCode, input.signal);
  }
  if (input.invalidProtocolLines.length > 0 && (input.events.length > 0 || input.legacyStdoutLines.length === 0)) {
    return buildResult(input.tool, input.callId, input.startedAtDate, "protocol_error", false, input.invalidProtocolLines.join("\n"), undefined, undefined, input.events, input.stdoutText, input.stderrText, input.exitCode, input.signal);
  }
  if (input.finalEvent?.type === "result") {
    return buildResult(input.tool, input.callId, input.startedAtDate, "success", true, stringifyOutput(input.finalEvent.output), input.finalEvent.output, input.finalEvent.effects, input.events, input.stdoutText, input.stderrText, input.exitCode, input.signal);
  }
  if (input.finalEvent?.type === "error") {
    return buildResult(input.tool, input.callId, input.startedAtDate, "failed", false, stringifyOutput(input.finalEvent.output ?? input.finalEvent.message), input.finalEvent.output, input.finalEvent.effects, input.events, input.stdoutText, input.stderrText, input.exitCode, input.signal, input.finalEvent.message);
  }
  const legacyOutput = [input.legacyStdoutLines.join("\n").trimEnd(), input.stderrText.trimEnd()].filter(Boolean).join("\n");
  return buildResult(input.tool, input.callId, input.startedAtDate, input.exitCode === 0 ? "success" : "failed", input.exitCode === 0, legacyOutput, legacyOutput, undefined, input.events, input.stdoutText, input.stderrText, input.exitCode, input.signal);
}

function buildResult(
  tool: string,
  callId: string | undefined,
  startedAtDate: Date,
  status: NDXToolExecutionStatus,
  success: boolean,
  output: string,
  outputValue: unknown,
  effects: NDXToolExecutionResult["effects"],
  events: NDXToolProcessEvent[],
  stdoutText: string,
  stderrText: string,
  exitCode?: number | null,
  signal?: NodeJS.Signals | null,
  error?: string
): NDXToolExecutionResult {
  const endedAtDate = new Date();
  return {
    tool,
    callId,
    status,
    success,
    output,
    outputValue,
    ...(effects && effects.length > 0 ? { effects } : {}),
    events,
    stdoutText,
    stderrText,
    exitCode,
    signal,
    error,
    startedAt: startedAtDate.toISOString(),
    endedAt: endedAtDate.toISOString(),
    durationMs: endedAtDate.getTime() - startedAtDate.getTime()
  };
}

export function failedWithoutProcess(
  tool: string,
  callId: string | undefined,
  output: string,
  status: NDXToolExecutionStatus = "failed",
  startedAtDate = new Date()
): NDXToolExecutionResult {
  return buildResult(tool, callId, startedAtDate, status, false, output, undefined, undefined, [], "", "", undefined, undefined, output);
}

function stringifyOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "undefined") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function terminateProcessGroup(pid: number | undefined, signal: NodeJS.Signals) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The process may already have exited.
    }
  }
}

function normalizeToolPathArguments(args: Record<string, unknown>, options: NDXToolExecutionOptions): Record<string, unknown> {
  const output = { ...args };
  for (const key of ["path", "file_path", "workdir", "cwd"]) {
    const value = output[key];
    if (typeof value !== "string" || !value.trim()) {
      continue;
    }
    const mapped = toServerContainerPath(value, options);
    if (options.projectHome && pathInside(mapped, options.projectHome)) {
      const relative = mapped === options.projectHome ? "." : mapped.slice(options.projectHome.length + 1);
      output[key] = relative;
    } else {
      output[key] = mapped;
    }
  }
  return output;
}

function pathInside(value: string, root: string): boolean {
  return value === root || value.startsWith(`${root.replace(/\/$/, "")}/`);
}
