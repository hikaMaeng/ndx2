import type { NDXToolAgentCallEnvelope } from "./types.js";

export const NDX_AGENTCALL_LINE_PREFIX = "[[ndx-agentcall:";
export const NDX_AGENTCALL_LINE_SUFFIX = "]]";

export function parseToolAgentCallLine(line: string): NDXToolAgentCallEnvelope | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith(NDX_AGENTCALL_LINE_PREFIX) || !trimmed.endsWith(NDX_AGENTCALL_LINE_SUFFIX)) {
    return undefined;
  }
  const payload = trimmed.slice(NDX_AGENTCALL_LINE_PREFIX.length, -NDX_AGENTCALL_LINE_SUFFIX.length);
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("agent call payload must be an object");
  }
  const record = parsed as { type?: unknown; name?: unknown; input?: unknown };
  if (record.type !== "ndx.agentcall" || typeof record.name !== "string" || !record.name.trim()) {
    throw new Error("agent call type or name is invalid");
  }
  return { type: record.type, name: record.name, input: record.input };
}
