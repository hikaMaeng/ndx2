type ToolCallRecord = {
  id?: unknown;
  call_id?: unknown;
  name?: unknown;
  tool?: unknown;
  function?: unknown;
};

export function resolveToolCallId(toolCall: unknown): string | undefined {
  if (!toolCall || typeof toolCall !== "object") {
    return undefined;
  }
  const record = toolCall as ToolCallRecord;
  if (typeof record.call_id === "string" && record.call_id.trim().length > 0) {
    return record.call_id;
  }
  if (typeof record.id === "string" && record.id.trim().length > 0) {
    return record.id;
  }
  return undefined;
}

export function summarizeToolName(toolCall: unknown): string {
  if (!toolCall || typeof toolCall !== "object") {
    return "unknown tool";
  }
  const record = toolCall as ToolCallRecord & { function?: { name?: unknown } };
  if (typeof record.name === "string" && record.name.length > 0) {
    return record.name;
  }
  const functionName = record.function && typeof record.function === "object" ? (record.function as { name?: unknown }).name : undefined;
  if (typeof functionName === "string" && functionName.length > 0) {
    return functionName;
  }
  if (typeof record.tool === "string" && record.tool.length > 0) {
    return record.tool;
  }
  return "unknown tool";
}
