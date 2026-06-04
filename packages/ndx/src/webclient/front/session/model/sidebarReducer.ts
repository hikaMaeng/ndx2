import type { NDXSessionSidebarItemMessage } from "ndx/common/protocol";
import { upsertRightSidebarItem } from "../rightSidebar.js";
import type { SessionInstanceModel } from "./types.js";

export function applySessionSidebarItem(model: SessionInstanceModel, message: NDXSessionSidebarItemMessage): SessionInstanceModel {
  return {
    ...model,
    sidebar: {
      ...model.sidebar,
      items: upsertRightSidebarItem(model.sidebar.items, message.item)
    }
  };
}
