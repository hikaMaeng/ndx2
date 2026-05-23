export const NDX_PROJECT_NEGOTIATION_REQUIRED = "project.negotiation.required";
export const NDX_PROJECT_CONFIGURE = "project.configure";
export const NDX_PROJECT_NEGOTIATED = "project.negotiated";

export type NDXProjectNegotiationRequiredMessage = {
  type: typeof NDX_PROJECT_NEGOTIATION_REQUIRED;
  error?: string;
};

export type NDXProjectConfigureMessage = {
  type: typeof NDX_PROJECT_CONFIGURE;
  projectId: string;
  projectPath: string;
  language?: NDXAgentLanguage;
};

export type NDXProjectNegotiatedMessage = {
  type: typeof NDX_PROJECT_NEGOTIATED;
  projectId: string;
  projectPath: string;
};

/** Returns true for the one-message project negotiation response. */
export function isNDXProjectConfigureMessage(value: unknown): value is NDXProjectConfigureMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; projectId?: unknown; projectPath?: unknown };
  return (
    message.type === NDX_PROJECT_CONFIGURE &&
    typeof message.projectId === "string" &&
    message.projectId.trim().length > 0 &&
    typeof message.projectPath === "string" &&
    (/^(?:[a-z]:[\\/]|\/)/iu.test(message.projectPath) || message.projectPath.startsWith("\\\\"))
  );
}
import type { NDXAgentLanguage } from "../../resource/index.js";
