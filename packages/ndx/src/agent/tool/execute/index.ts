import { listAvailableTools } from "../registry.js";
import { resolveToolCallId, summarizeToolName } from "../toolCall.js";
import { resolveBuiltinFunctionTool } from "../base/functionTools.js";
import { failedWithoutProcess, runToolProcess } from "./process.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult } from "../types.js";

export async function executeToolCalls(toolCalls: unknown[], options: NDXToolExecutionOptions = {}): Promise<NDXToolExecutionResult[]> {
  const tools = await listAvailableTools(options);
  const allowedToolNames = options.allowedToolNames ? new Set(options.allowedToolNames) : undefined;
  return Promise.all(toolCalls.map((toolCall, toolCallIndex) => {
    const name = summarizeToolName(toolCall);
    const callId = resolveToolCallId(toolCall);
    const args = toolArguments(toolCall);
    const requestedTimeoutMs = typeof args.timeout_ms === "number" && Number.isFinite(args.timeout_ms) && args.timeout_ms > 0
      ? Math.ceil(args.timeout_ms)
      : undefined;
    const callOptions = { ...options, timeoutMs: options.timeoutMs ?? requestedTimeoutMs, toolCallIndex };
    if (allowedToolNames && !allowedToolNames.has(name)) {
      return failedWithoutProcess(name, callId, `Tool is not allowed in this session: ${name}`);
    }
    const tool = tools.find((item) => item.name === name);
    if (!tool) {
      return failedWithoutProcess(name, callId, `Tool is not available: ${name}`);
    }
    if (tool.runtime === "function") {
      const functionTool = resolveBuiltinFunctionTool(tool.name);
      if (!functionTool) {
        return failedWithoutProcess(name, callId, `Function tool handler is not available: ${name}`);
      }
      return functionTool.execute(args, callId, callOptions).then(async (result) => {
        await callOptions.observer?.onToolFinished?.(result);
        return result;
      });
    }
    return runToolProcess(tool, args, callId, callOptions);
  }));
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
