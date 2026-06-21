import { NDX_AGENT_TOOL_NAME, agentToolSchema, executeAgentTool } from "./agent/index.js";
import { NDX_ASK_USER_QUESTION_TOOL_NAME, askUserQuestionToolSchema, executeAskUserQuestionTool } from "./askUserQuestion/index.js";
import { NDX_SESSION_HISTORY_TOOL_NAME, executeSessionHistoryTool, sessionHistoryToolSchema } from "./session_history/index.js";
import { NDX_TURNPLAN_TOOL_NAME, executeTurnplanTool, turnplanToolSchema } from "./turnplan/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult, NDXToolRegistryOptions } from "../types.js";

export type NDXBuiltinFunctionTool = {
  name: string;
  directory: string;
  schema: (options?: NDXToolRegistryOptions) => Record<string, unknown> | Promise<Record<string, unknown>>;
  execute: (args: Record<string, unknown>, callId: string | undefined, options: NDXToolExecutionOptions) => Promise<NDXToolExecutionResult>;
};

export const NDX_BUILTIN_FUNCTION_TOOLS: NDXBuiltinFunctionTool[] = [
  {
    name: NDX_AGENT_TOOL_NAME,
    directory: "agent",
    schema: agentToolSchema,
    execute: executeAgentTool
  },
  {
    name: NDX_ASK_USER_QUESTION_TOOL_NAME,
    directory: "askUserQuestion",
    schema: askUserQuestionToolSchema,
    execute: executeAskUserQuestionTool
  },
  {
    name: NDX_SESSION_HISTORY_TOOL_NAME,
    directory: "session_history",
    schema: sessionHistoryToolSchema,
    execute: executeSessionHistoryTool
  },
  {
    name: NDX_TURNPLAN_TOOL_NAME,
    directory: "turnplan",
    schema: turnplanToolSchema,
    execute: executeTurnplanTool
  }
];

export function resolveBuiltinFunctionTool(name: string): NDXBuiltinFunctionTool | undefined {
  return NDX_BUILTIN_FUNCTION_TOOLS.find((tool) => tool.name === name);
}
