import type { NDXSessionSidebarItemMessage, NDXSidebarItem } from "ndx/common/protocol";
import { upsertRightSidebarItem, type SessionUiState } from "ndx/webclient/front";

export type UpdateSessionUi = (key: string, update: (current: SessionUiState) => SessionUiState) => void;

export function rightSidebarWithItem(current: SessionUiState, item: NDXSidebarItem): SessionUiState {
  return {
    ...current,
    rightSidebarItems: upsertRightSidebarItem(current.rightSidebarItems, item)
  };
}

export function rightSidebarCleared(current: SessionUiState): SessionUiState {
  return {
    ...current,
    rightSidebarItems: []
  };
}

export function rightSidebarToggled(current: SessionUiState): SessionUiState {
  return {
    ...current,
    rightSidebarOpen: !current.rightSidebarOpen
  };
}

export function rightSidebarWithWidth(current: SessionUiState, width: number): SessionUiState {
  return {
    ...current,
    rightSidebarWidth: width
  };
}

export function rightSidebarWithScrollTop(current: SessionUiState, scrollTop: number): SessionUiState {
  return {
    ...current,
    rightSidebarScrollTop: scrollTop
  };
}

export function applyRightSidebarItemMessage(updateSessionUi: UpdateSessionUi, message: NDXSessionSidebarItemMessage) {
  updateSessionUi(message.sessionid, (current) => rightSidebarWithItem(current, message.item));
}
