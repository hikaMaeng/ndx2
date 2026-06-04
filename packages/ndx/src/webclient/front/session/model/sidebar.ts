import type { NDXSidebarItem } from "ndx/common/protocol";

export type SessionSidebarModel = {
  open: boolean;
  width: number;
  scrollTop: number;
  items: NDXSidebarItem[];
};

export function createSessionSidebarModel(): SessionSidebarModel {
  return {
    open: false,
    width: 288,
    scrollTop: 0,
    items: []
  };
}
