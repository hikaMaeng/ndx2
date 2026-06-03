export function eventContentText(contents: unknown): string {
  if (typeof contents === "string") return contents;
  if (!contents || typeof contents !== "object") return "";
  const payload = contents as Record<string, unknown>;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.content === "string") return payload.content;
  if (typeof payload.summary === "string") return payload.summary;
  if (typeof payload.message === "string") return payload.message;
  return "";
}

export function toolNameFromCall(toolCall: unknown): string {
  if (!toolCall || typeof toolCall !== "object") return "unknown tool";
  const record = toolCall as { name?: unknown; tool?: unknown; function?: unknown };
  if (typeof record.name === "string" && record.name.length > 0) return record.name;
  if (record.function && typeof record.function === "object" && typeof (record.function as { name?: unknown }).name === "string") {
    return String((record.function as { name: string }).name);
  }
  if (typeof record.tool === "string" && record.tool.length > 0) return record.tool;
  return "unknown tool";
}

export function toolCallIdFromCall(toolCall: unknown): string | undefined {
  if (!toolCall || typeof toolCall !== "object") return undefined;
  const record = toolCall as { call_id?: unknown; id?: unknown };
  if (typeof record.call_id === "string" && record.call_id.length > 0) return record.call_id;
  if (typeof record.id === "string" && record.id.length > 0) return record.id;
  return undefined;
}

export function toolProgressText(event: unknown): string {
  if (!event || typeof event !== "object") return "progress";
  const record = event as { type?: unknown; message?: unknown; percent?: unknown };
  const label = typeof record.message === "string" ? record.message : typeof record.type === "string" ? record.type : "progress";
  return typeof record.percent === "number" ? `${label} (${record.percent}%)` : label;
}
