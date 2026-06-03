import { SKILLLOADER_RUNTIME_ARG_HANDLERS } from "./skillloader/runtimeArgs.js";
import type { NDXToolSystemArgHandler, NDXToolSystemArgHandlerInput } from "./skillloader/runtimeArgTypes.js";

export const NDX_TOOL_RUNTIME_ARG_HANDLERS = {
  ...SKILLLOADER_RUNTIME_ARG_HANDLERS
} satisfies Record<string, NDXToolSystemArgHandler>;

export type NDXToolRuntimeArgName = keyof typeof NDX_TOOL_RUNTIME_ARG_HANDLERS;

export const NDX_TOOL_RUNTIME_ARG_NAMES = Object.keys(NDX_TOOL_RUNTIME_ARG_HANDLERS) as NDXToolRuntimeArgName[];

export function isToolRuntimeArgName(value: string): value is NDXToolRuntimeArgName {
  return Object.hasOwn(NDX_TOOL_RUNTIME_ARG_HANDLERS, value);
}

export function resolveToolRuntimeArg(name: NDXToolRuntimeArgName, input: NDXToolSystemArgHandlerInput): string | Promise<string> {
  return NDX_TOOL_RUNTIME_ARG_HANDLERS[name](input);
}
