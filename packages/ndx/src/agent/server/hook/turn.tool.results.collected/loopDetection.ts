import { requestModelResponse, type ResponseInputItem } from "ndx/common/responseapi";
import { createNDXAgentResourceResolver, NDX_AGENT_RESOURCE } from "../../../common/resource/index.js";
import { readAgentRuntimeSettings } from "../../runtime-settings/index.js";
import { sessionDataText } from "../../session/content.js";
import { listSessionData } from "../../session/listSessionData.js";
import type { NDXSessionDataRow } from "../../session/types.js";
import type { NDXHookCodeExecutor, NDXHookContext, NDXHookEffect } from "../index.js";

type LoopDetectionIterationWindow = {
  startIteration: number;
  endIteration: number;
  size: number;
};

type LoopDetectionSessionDataRow = {
  dataid: string;
  type: string;
  createdat: string;
  text?: string;
  contents?: unknown;
};

export const loopDetectionHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.tool.results.collected.loop_detection",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    const iteration = context.iteration ?? 0;
    const settings = await readAgentRuntimeSettings(context.userHome);
    if (!shouldRunLoopDetection(iteration, settings.loopDetectionInterval)) {
      return { type: "noeffect" };
    }

    const iterationWindow = loopDetectionIterationWindow(iteration, settings.loopDetectionInterval);
    const rows = await listSessionData(context.database, context.session.sessionid);
    const sessionDataByIteration = sessionDataRowsByIterationWindow(rows, iterationWindow);
    const response = await requestModelResponse(context.session.model, loopDetectionJudgeMessages(context, iterationWindow, sessionDataByIteration), [], {
      onDebug: async (event, detail) => {
        context.database.logger?.debug(event, {
          sessionid: context.session.sessionid,
          hook: "system.turn.tool.results.collected.loop_detection",
          iteration,
          ...detail
        });
      }
    });
    const decision = parseLoopDetectionDecision(response.content);
    if (!decision) {
      return {
        type: "noeffect",
        diagnostics: ["system.turn.tool.results.collected.loop_detection: model decision was not valid JSON."]
      };
    }
    if (!decision.shouldStop) {
      return {
        type: "noeffect",
        diagnostics: decision.reason ? [`system.turn.tool.results.collected.loop_detection: continue: ${decision.reason}`] : undefined
      };
    }

    const resource = context.resource ?? createNDXAgentResourceResolver();
    return {
      type: "stopturn",
      stopTurn: true,
      finalAssistantText: decision.finalAssistantText || resource(NDX_AGENT_RESOURCE.TURN_LOOP_DETECTION_STOPPED_MESSAGE, {
        language: context.language,
        values: { reason: decision.reason }
      }),
      diagnostics: decision.reason ? [`system.turn.tool.results.collected.loop_detection: stop: ${decision.reason}`] : ["system.turn.tool.results.collected.loop_detection: stop"]
    };
  }
};

function shouldRunLoopDetection(iteration: number, interval: number): boolean {
  return interval > 0 && iteration > 0 && iteration % interval === 0;
}

function loopDetectionIterationWindow(iteration: number, interval: number): LoopDetectionIterationWindow {
  return {
    startIteration: Math.max(1, iteration - interval + 1),
    endIteration: iteration,
    size: interval
  };
}

function sessionDataRowsByIterationWindow(rows: NDXSessionDataRow[], window: LoopDetectionIterationWindow): Map<number, LoopDetectionSessionDataRow[]> {
  const rowsByIteration = new Map<number, LoopDetectionSessionDataRow[]>();
  for (const row of rows) {
    const rowIteration = sessionDataIteration(row);
    if (!rowIteration || rowIteration < window.startIteration || rowIteration > window.endIteration) {
      continue;
    }
    const text = sessionDataText(row);
    rowsByIteration.set(rowIteration, [...(rowsByIteration.get(rowIteration) ?? []), {
      dataid: row.dataid,
      type: row.type,
      createdat: row.createdat instanceof Date ? row.createdat.toISOString() : String(row.createdat),
      text: typeof text === "string" ? truncateForLoopDetection(text, 8_000) : undefined,
      contents: text ? undefined : row.contents
    }]);
  }
  return rowsByIteration;
}

function loopDetectionJudgeMessages(context: Omit<NDXHookContext, "event">, window: LoopDetectionIterationWindow, rowsByIteration: Map<number, LoopDetectionSessionDataRow[]>): ResponseInputItem[] {
  const iterationGroups = [...rowsByIteration.entries()]
    .sort(([left], [right]) => left - right)
    .map(([groupIteration, groupRows]) => ({
      iteration: groupIteration,
      isCurrent: groupIteration === window.endIteration,
      rows: groupRows
    }));
  return [
    {
      role: "system",
      content: [
        "You are a loop-detection judge for one coding-agent turn.",
        "The user payload groups recent session data by model/tool iteration.",
        "Your job is to decide whether the current iteration is repeating the same work pattern as prior iterations in the provided window and should stop now.",
        "A repetitive loop means the current iteration repeats substantially the same tool calls, failed repair attempts, investigation path, or non-progressing action pattern without new evidence or a plausible next step.",
        "Compare the current iteration against the prior iterations. Do not stop merely because the task is long, the iteration number is high, or the current iteration has a tool failure.",
        "Prefer continuing when the current iteration introduces a meaningfully new hypothesis, file, command, edit, test, or recovery path.",
        "Return only compact JSON with this shape: {\"shouldStop\": boolean, \"reason\": string, \"finalAssistantText\": string}.",
        "When shouldStop is true, finalAssistantText must be a concise user-facing explanation of what was stopped and what progress or remaining issue is known.",
        "When shouldStop is false, finalAssistantText may be an empty string."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        sessionid: context.session.sessionid,
        currentIteration: {
          iteration: window.endIteration,
          toolCalls: context.toolCalls ?? [],
          toolResults: (context.toolResults ?? []).map((result) => ({
            tool: result.tool,
            callId: result.callId,
            success: result.success,
            status: result.status,
            output: truncateForLoopDetection(result.output, 8_000)
          }))
        },
        iterationWindow: {
          startIteration: window.startIteration,
          endIteration: window.endIteration,
          size: window.size,
          iterationCount: iterationGroups.length,
          iterations: iterationGroups
        },
        requestText: context.requestText
      })
    }
  ];
}

function sessionDataIteration(row: NDXSessionDataRow): number | undefined {
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }
  const iteration = (row.contents as { iteration?: unknown }).iteration;
  return typeof iteration === "number" && Number.isInteger(iteration) && iteration > 0 ? iteration : undefined;
}

function parseLoopDetectionDecision(content: string): { shouldStop: boolean; reason: string; finalAssistantText: string } | undefined {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("{") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(jsonText) as { shouldStop?: unknown; reason?: unknown; finalAssistantText?: unknown };
    if (typeof parsed.shouldStop !== "boolean") {
      return undefined;
    }
    return {
      shouldStop: parsed.shouldStop,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      finalAssistantText: typeof parsed.finalAssistantText === "string" ? parsed.finalAssistantText : ""
    };
  } catch {
    return undefined;
  }
}

function truncateForLoopDetection(value: unknown, maxLength: number): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n[truncated ${text.length - maxLength} chars]`;
}
