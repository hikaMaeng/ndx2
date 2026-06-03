import type { NDXSidebarItem } from "../../../../common/protocol/index.js";
import type { NDXToolAgentCallContext, NDXToolAgentCallHandler } from "./types.js";

export const NDX_SIDEBAR_ITEM_AGENTCALL_NAME = "session.sidebar_item";

export function createSidebarItemAgentCallHandler(send: (item: NDXSidebarItem, context: NDXToolAgentCallContext) => void | Promise<void>): NDXToolAgentCallHandler {
  return async (input, context) => {
    const item = sidebarItemInput(input);
    if (!item) {
      throw new Error("sidebar item agent call input is invalid");
    }
    await send(item, context);
  };
}

export function sidebarItemInput(input: unknown): NDXSidebarItem | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as { group?: unknown; subgroup?: unknown; key?: unknown; title?: unknown; body?: unknown; kind?: unknown };
  const group = record.group && typeof record.group === "object" && !Array.isArray(record.group)
    ? record.group as { id?: unknown; title?: unknown }
    : undefined;
  const subgroup = record.subgroup && typeof record.subgroup === "object" && !Array.isArray(record.subgroup)
    ? record.subgroup as { id?: unknown; title?: unknown }
    : undefined;
  if (
    typeof group?.id !== "string" ||
    !group.id.trim() ||
    typeof group.title !== "string" ||
    !group.title.trim() ||
    typeof record.title !== "string" ||
    !record.title.trim()
  ) {
    return undefined;
  }
  return {
    group: { id: group.id.trim(), title: group.title.trim() },
    ...(typeof subgroup?.id === "string" && subgroup.id.trim() && typeof subgroup.title === "string" && subgroup.title.trim()
      ? { subgroup: { id: subgroup.id.trim(), title: subgroup.title.trim() } }
      : {}),
    ...(typeof record.key === "string" && record.key.trim() ? { key: record.key.trim() } : {}),
    title: record.title.trim(),
    ...(typeof record.body === "string" && record.body.trim() ? { body: record.body.trim() } : {}),
    ...(typeof record.kind === "string" && record.kind.trim() ? { kind: record.kind.trim() } : {})
  };
}
