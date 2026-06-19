import type { SessionUiState } from "ndx/webclient/front";

export type UpdateSessionUi = (key: string, update: (current: SessionUiState) => SessionUiState) => void;

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
