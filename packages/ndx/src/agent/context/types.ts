import type { NDXModelConfig } from "../session/types.js";

export type SessionMetadata = {
  model: NDXModelConfig;
  cwd: string;
  userHome?: string;
  projectHome?: string;
  currentDate?: string;
  timezone?: string;
};

export type BuiltContext = {
  developer: string;
  user: string;
};

export type BuiltContextParts = {
  developer: string;
  userInstructions: string;
  environment: string;
};

export const NDX_HOME_DIRECTORY = ".ndx";
export const NDX_SYSTEM_PROMPT_FILE = "system-promt.md";
export const NDX_AGENTS_FILE = "AGENTS.md";
export const SESSION_SHELL = "bash";
