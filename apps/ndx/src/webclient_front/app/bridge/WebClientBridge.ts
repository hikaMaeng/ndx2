import React from "react";
import { WebClientBridge } from "ndx/webclient/front";
import { useModel } from "../../model/useModel";

export { WebClientBridge };
export type { WebClientBridgeSnapshot, WebClientModalCommand, WebClientModalRequest, WebClientProjectApi, WebClientSurface } from "ndx/webclient/front";

export function useWebClientBridge() {
  const bridgeRef = React.useRef<WebClientBridge | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new WebClientBridge();
  }
  return bridgeRef.current;
}

export function useBridgeSurface(bridge: WebClientBridge) {
  return useModel(bridge.surface).value;
}

export function useBridgeModals(bridge: WebClientBridge) {
  return useModel(bridge.modalRequests).value;
}

export function useBridgeProjectSessions(bridge: WebClientBridge) {
  return useModel(bridge.sessionsByProject).value;
}

export function useBridgeProjectSessionDeleteRequest(bridge: WebClientBridge) {
  return useModel(bridge.deleteSessionRequest).value;
}

export function useBridgePendingActions(bridge: WebClientBridge) {
  return useModel(bridge.pendingActions).value;
}
