export const NDX_ACCOUNT_SELECTION_REQUIRED = "account.selection.required";
export const NDX_ACCOUNT_SELECT = "account.select";
export const NDX_ACCOUNT_SELECTED = "account.selected";

export type NDXAccountSummary = {
  userid: string;
  created: string;
};

export type NDXAccountSelectionRequiredMessage = {
  type: typeof NDX_ACCOUNT_SELECTION_REQUIRED;
  users: NDXAccountSummary[];
  error?: string;
};

export type NDXAccountSelectMessage = {
  type: typeof NDX_ACCOUNT_SELECT;
  userid: string;
  language?: NDXAgentLanguage;
};

export type NDXAccountSelectedMessage = {
  type: typeof NDX_ACCOUNT_SELECTED;
  userid: string;
};

/** Returns true for the account-selection response accepted by the socket server. */
export function isNDXAccountSelectMessage(value: unknown): value is NDXAccountSelectMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; userid?: unknown };
  return message.type === NDX_ACCOUNT_SELECT && typeof message.userid === "string" && message.userid.length > 0;
}
import type { NDXAgentLanguage } from "../../resource/index.js";
