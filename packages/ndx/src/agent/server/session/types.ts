import type { NDXDatabase } from "../init/database.js";

export type NDXSessionMode = "none" | "light";

export type NDXModelConfig = {
  type: "openai";
  model: string;
  url: string;
  token: string;
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
};

export type NDXSessionRow = {
  sessionid: string;
  userid: string;
  title: string;
  lastupdated: Date;
  mode: NDXSessionMode;
  path: string;
  projectid: string;
  model: NDXModelConfig;
  isrunning: boolean;
  turnphase: string;
  interruptrequested: boolean;
  interruptrequestedat: Date | null;
  interruptcompletedat: Date | null;
};

export type NDXSessionDataRow = {
  dataid: string;
  sessionid: string;
  type: string;
  contents: unknown;
  createdat: Date;
};

export type NDXModelMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

export type { NDXDatabase };

export type NDXSessionCreateInput = {
  userid: string;
  path: string;
  projectid: string;
  model: NDXModelConfig;
  sessionid?: string;
  title?: string;
  mode?: NDXSessionMode;
};
