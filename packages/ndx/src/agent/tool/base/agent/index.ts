import { loadSubagents, runSubagent } from "./subagent.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult, NDXToolRegistryOptions } from "../../types.js";

export const NDX_AGENT_TOOL_NAME = "agent";

export async function agentToolSchema(options: NDXToolRegistryOptions = {}): Promise<Record<string, unknown>> {
  const subagents = await loadSubagents({ userHome: options.userHome, projectHome: options.projectHome });
  return {
    type: "function",
    name: NDX_AGENT_TOOL_NAME,
    description: "Run a discovered NDX subagent as a nested session. The AGENT.md owns the prompt, modeltype, parentcontext, and queued messages. Pass only subagent_type and structured input when the AGENT.md declares ## arguments.",
    parameters: {
      type: "object",
      properties: {
        subagent_type: {
          type: "string",
          enum: subagents.map((agent) => agent.name),
          description: "Name of the discovered subagent to run."
        },
        input: {
          type: "object",
          description: "Structured JSON input for subagents that declare a ## arguments JSON Schema in AGENT.md."
        }
      },
      required: ["subagent_type"],
      additionalProperties: false,
      allOf: subagents.filter((agent) => agent.inputSchema).map((agent) => ({
        if: { properties: { subagent_type: { const: agent.name } }, required: ["subagent_type"] },
        then: { properties: { input: agent.inputSchema }, required: ["input"] }
      }))
    }
  };
}

export async function executeAgentTool(args: Record<string, unknown>, callId: string | undefined, options: NDXToolExecutionOptions): Promise<NDXToolExecutionResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    if (!options.database || !options.session) throw new Error("agent tool requires database and session runtime context.");
    const subagentType = typeof args.subagent_type === "string" ? args.subagent_type.trim() : "";
    if (!subagentType) throw new Error("agent.subagent_type is required.");
    const outputValue = await runSubagent({
      subagentType,
      input: args.input,
      callId,
      parentSession: options.session,
      database: options.database,
      userHome: options.userHome,
      projectHome: options.projectHome,
      signal: options.signal,
      onSubsessionEvent: options.onSubsessionEvent
    });
    return {
      tool: NDX_AGENT_TOOL_NAME,
      callId,
      status: outputValue.status === "interrupted" ? "cancelled" : "success",
      success: outputValue.status === "completed",
      output: JSON.stringify(outputValue),
      outputValue,
      events: [],
      stdoutText: "",
      stderrText: "",
      exitCode: 0,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - started
    };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return {
      tool: NDX_AGENT_TOOL_NAME,
      callId,
      status: options.signal?.aborted ? "cancelled" : "failed",
      success: false,
      output: message,
      events: [],
      stdoutText: "",
      stderrText: message,
      exitCode: 1,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: message
    };
  }
}
