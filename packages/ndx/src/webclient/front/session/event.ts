import type { NDXSessionEventMessage } from "ndx/common/protocol";

export function interruptWasAccepted(contents: NDXSessionEventMessage["contents"]) {
  if (!contents || typeof contents !== "object" || Array.isArray(contents)) return false;
  const interrupt = (contents as { interrupt?: unknown; runtime?: unknown }).interrupt ?? (contents as { runtime?: unknown }).runtime;
  return Boolean(interrupt && typeof interrupt === "object" && (interrupt as { accepted?: unknown }).accepted === true);
}
