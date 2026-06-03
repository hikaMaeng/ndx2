import { parseToolAgentCallLine } from "./parser.js";
import type { NDXToolAgentCallContext, NDXToolAgentCallHandlers } from "./types.js";

export async function routeToolAgentCallLine(
  line: string,
  handlers: NDXToolAgentCallHandlers | undefined,
  context: NDXToolAgentCallContext
): Promise<boolean> {
  const call = parseToolAgentCallLine(line);
  if (!call) {
    return false;
  }
  const handler = handlers?.[call.name];
  if (!handler) {
    throw new Error(`agent call handler is not registered: ${call.name}`);
  }
  await handler(call.input, context);
  return true;
}
