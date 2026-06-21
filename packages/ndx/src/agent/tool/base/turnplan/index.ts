import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { failedWithoutProcess } from "../../execute/process.js";
import type { NDXSessionRequestQueuePosition } from "../../../requestQue/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult } from "../../types.js";

export const NDX_TURNPLAN_TOOL_NAME = "turnplan";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export function turnplanToolSchema(): Record<string, unknown> {
  return {
    type: "function",
    name: NDX_TURNPLAN_TOOL_NAME,
    description: "Manage the current session request queue for multi-turn problem solving. Use action=plan to split a goal into queued work requests; turnplan automatically inserts reflection requests between work requests and a final summary request. Reflection is performed by the model in an ordinary queued turn; this tool only lists and edits queued items.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["plan", "list", "add", "update", "delete", "clear"],
          description: "Queue operation to perform."
        },
        goal: {
          type: "string",
          description: "Overall goal for action=plan. It is embedded in reflection and final summary queued requests."
        },
        requests: {
          type: "array",
          description: "Work requests for action=plan. turnplan queues each request, inserts reflection requests between them, then queues a final summary request.",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "Concrete request body for one future turn." }
            },
            required: ["text"],
            additionalProperties: false
          },
          minItems: 1
        },
        text: {
          type: "string",
          description: "Request text for action=add or replacement text for action=update."
        },
        itemid: {
          type: "string",
          description: "Queue item id for action=update/delete, or a position anchor when position.type is before/after."
        },
        position: {
          type: "object",
          description: "Insertion position for action=add. Defaults to end. before/after require itemid.",
          properties: {
            type: { type: "string", enum: ["end", "front", "before", "after"] },
            itemid: { type: "string" }
          },
          required: ["type"],
          additionalProperties: false
        }
      },
      required: ["action"],
      additionalProperties: false
    }
  };
}

export async function executeTurnplanTool(
  args: Record<string, unknown>,
  callId: string | undefined,
  options: NDXToolExecutionOptions
): Promise<NDXToolExecutionResult> {
  const startedAtDate = new Date();
  await options.observer?.onToolStarted?.({ tool: NDX_TURNPLAN_TOOL_NAME, callId, startedAt: startedAtDate.toISOString(), args });
  if (!options.sessionid || !options.sessionRequestQueueBridge) {
    return failedWithoutProcess(NDX_TURNPLAN_TOOL_NAME, callId, "turnplan requires an active session request queue.", "failed", startedAtDate);
  }

  const action = args.action;
  if (action === "list") {
    return turnplanResult(callId, startedAtDate, { action, items: await options.sessionRequestQueueBridge.list(options.sessionid) });
  }
  if (action === "clear") {
    await options.sessionRequestQueueBridge.clear(options.sessionid);
    return turnplanResult(callId, startedAtDate, { action, items: await options.sessionRequestQueueBridge.list(options.sessionid) });
  }
  if (action === "add") {
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!text) {
      return failedWithoutProcess(NDX_TURNPLAN_TOOL_NAME, callId, "turnplan add requires non-empty text.", "failed", startedAtDate);
    }
    const item = await options.sessionRequestQueueBridge.add({ sessionid: options.sessionid, text, position: normalizeTurnplanPosition(args.position) });
    return turnplanResult(callId, startedAtDate, { action, added: [item], items: await options.sessionRequestQueueBridge.list(options.sessionid) });
  }
  if (action === "update") {
    const itemid = typeof args.itemid === "string" ? args.itemid.trim() : "";
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!itemid || !text) {
      return failedWithoutProcess(NDX_TURNPLAN_TOOL_NAME, callId, "turnplan update requires itemid and non-empty text.", "failed", startedAtDate);
    }
    const item = await options.sessionRequestQueueBridge.updateText(options.sessionid, itemid, text);
    return turnplanResult(callId, startedAtDate, { action, updated: item, found: Boolean(item), items: await options.sessionRequestQueueBridge.list(options.sessionid) });
  }
  if (action === "delete") {
    const itemid = typeof args.itemid === "string" ? args.itemid.trim() : "";
    if (!itemid) {
      return failedWithoutProcess(NDX_TURNPLAN_TOOL_NAME, callId, "turnplan delete requires itemid.", "failed", startedAtDate);
    }
    const deleted = await options.sessionRequestQueueBridge.delete(options.sessionid, itemid);
    return turnplanResult(callId, startedAtDate, { action, deleted, items: await options.sessionRequestQueueBridge.list(options.sessionid) });
  }
  if (action === "plan") {
    const goal = typeof args.goal === "string" ? args.goal.trim() : "";
    const requests = Array.isArray(args.requests)
      ? args.requests.map((request) => request && typeof request === "object" && !Array.isArray(request) ? String((request as { text?: unknown }).text ?? "").trim() : "").filter(Boolean)
      : [];
    if (!goal || requests.length === 0) {
      return failedWithoutProcess(NDX_TURNPLAN_TOOL_NAME, callId, "turnplan plan requires goal and at least one non-empty request.", "failed", startedAtDate);
    }
    let reflectionRequest;
    let summaryRequest;
    try {
      reflectionRequest = await turnplanTemplateRequest("reflection.md", goal);
      summaryRequest = await turnplanTemplateRequest("summary.md", goal);
    } catch (error) {
      return failedWithoutProcess(NDX_TURNPLAN_TOOL_NAME, callId, `turnplan failed to load request templates: ${error instanceof Error ? error.message : String(error)}`, "failed", startedAtDate);
    }
    const added = [];
    for (let index = 0; index < requests.length; index += 1) {
      added.push(await options.sessionRequestQueueBridge.add({ sessionid: options.sessionid, text: requests[index]! }));
      if (index < requests.length - 1) {
        added.push(await options.sessionRequestQueueBridge.add({ sessionid: options.sessionid, text: reflectionRequest }));
      }
    }
    added.push(await options.sessionRequestQueueBridge.add({ sessionid: options.sessionid, text: summaryRequest }));
    return turnplanResult(callId, startedAtDate, { action, goal, added, items: await options.sessionRequestQueueBridge.list(options.sessionid) });
  }
  return failedWithoutProcess(NDX_TURNPLAN_TOOL_NAME, callId, "turnplan action must be plan, list, add, update, delete, or clear.", "failed", startedAtDate);
}

function normalizeTurnplanPosition(value: unknown): NDXSessionRequestQueuePosition | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const position = value as { type?: unknown; itemid?: unknown };
  if (position.type === "front" || position.type === "end") return { type: position.type };
  if ((position.type === "before" || position.type === "after") && typeof position.itemid === "string" && position.itemid.trim()) {
    return { type: position.type, itemid: position.itemid.trim() };
  }
  return undefined;
}

async function turnplanTemplateRequest(filename: "reflection.md" | "summary.md", goal: string): Promise<string> {
  const candidatePaths = [
    path.join(moduleDirectory, "templates", filename),
    path.join(moduleDirectory, "..", "..", "..", "..", "..", "src", "agent", "tool", "base", "turnplan", "templates", filename),
    path.join(process.cwd(), "packages", "ndx", "src", "agent", "tool", "base", "turnplan", "templates", filename),
    path.join(process.cwd(), "src", "agent", "tool", "base", "turnplan", "templates", filename)
  ];
  for (const candidatePath of candidatePaths) {
    try {
      return (await fs.readFile(candidatePath, "utf8")).replaceAll("{{GOAL}}", goal).trim();
    } catch (error) {
      if (!error || typeof error !== "object" || (error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error(`${filename} not found`);
}

function turnplanResult(callId: string | undefined, startedAtDate: Date, outputValue: Record<string, unknown>): NDXToolExecutionResult {
  const output = JSON.stringify(outputValue);
  return {
    tool: NDX_TURNPLAN_TOOL_NAME,
    callId,
    status: "success",
    success: true,
    output,
    outputValue,
    events: [],
    stdoutText: "",
    stderrText: "",
    startedAt: startedAtDate.toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtDate.getTime()
  };
}
