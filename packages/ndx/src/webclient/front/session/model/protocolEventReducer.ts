import type { NDXSessionEventMessage } from "ndx/common/protocol";
import { applyProtocolEventToSessionUiState, type ProtocolEventUiText } from "../protocolEventReducer.js";
import type { SessionInstanceModel } from "./types.js";
import { sessionModelToUiState, sessionModelWithUiState } from "./uiAdapter.js";

export function applySessionProtocolEvent(model: SessionInstanceModel, message: NDXSessionEventMessage, text: ProtocolEventUiText): SessionInstanceModel {
  return sessionModelWithUiState(
    model,
    applyProtocolEventToSessionUiState(sessionModelToUiState(model), message, text)
  );
}
