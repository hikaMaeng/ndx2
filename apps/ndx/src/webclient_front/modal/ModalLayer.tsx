import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WebClientBridge } from "../app/bridge/WebClientBridge";

const MODAL_LAYER_ID = "webclient-modal-layer";

export function ModalLayer({ children }: { bridge: WebClientBridge; children?: ReactNode }) {
  return <div id={MODAL_LAYER_ID}>{children}</div>;
}

export function ModalPortal({ children }: { children?: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById(MODAL_LAYER_ID));
  }, []);

  if (!host || !children) return null;
  return createPortal(children, host);
}
