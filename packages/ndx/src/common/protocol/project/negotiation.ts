export const NDX_PROJECT_NEGOTIATION_REQUIRED = "project.negotiation.required";
export const NDX_PROJECT_CONFIGURE = "project.configure";
export const NDX_PROJECT_NEGOTIATED = "project.negotiated";

export type NDXProjectNegotiationRequiredMessage = {
  type: typeof NDX_PROJECT_NEGOTIATION_REQUIRED;
  error?: string;
};

export type NDXProjectConfigureMessage = {
  type: typeof NDX_PROJECT_CONFIGURE;
  projectName: string;
  language?: NDXAgentLanguage;
};

export type NDXProjectNegotiatedMessage = {
  type: typeof NDX_PROJECT_NEGOTIATED;
  projectName: string;
};

/** Returns true for the one-message project negotiation response. */
export function isNDXProjectConfigureMessage(value: unknown): value is NDXProjectConfigureMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; projectName?: unknown };
  return (
    message.type === NDX_PROJECT_CONFIGURE &&
    typeof message.projectName === "string" &&
    message.projectName.trim().length > 0
  );
}
import type { NDXAgentLanguage } from "../../resource/index.js";
