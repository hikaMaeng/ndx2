import { NDX_ASK_USER_QUESTION_TOOL_NAME, askUserQuestionToolSchema, executeAskUserQuestionTool } from "./askUserQuestion/index.js";
import { NDX_SESSION_HISTORY_TOOL_NAME, executeSessionHistoryTool, sessionHistoryToolSchema } from "./session_history/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult } from "../types.js";

export type NDXBuiltinFunctionTool = {
  name: string;
  directory: string;
  schema: () => Record<string, unknown>;
  execute: (args: Record<string, unknown>, callId: string | undefined, options: NDXToolExecutionOptions) => Promise<NDXToolExecutionResult>;
};

export const NDX_BUILTIN_FUNCTION_TOOLS: NDXBuiltinFunctionTool[] = [
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
  }
];

export function resolveBuiltinFunctionTool(name: string): NDXBuiltinFunctionTool | undefined {
  return NDX_BUILTIN_FUNCTION_TOOLS.find((tool) => tool.name === name);
}
