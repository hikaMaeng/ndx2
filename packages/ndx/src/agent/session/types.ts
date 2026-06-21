import type { NDXDatabase } from "../init/database.js";
import { serverWorkspaceProjectPath } from "../../common/server-path/index.js";

export type NDXSessionMode = "none" | "light";
export type NDXReasoningEffort = "low" | "medium" | "high";

export type NDXModelConfig = {
  type: "openai";
  provider?: string;
  model: string;
  url: string;
  token: string;
  contextsize: number;
  modalities?: Array<"text" | "image" | "file">;
  reasoningEffort?: NDXReasoningEffort;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXSessionRow = {
  sessionid: string;
  title: string;
  lastupdated: Date;
  mode: NDXSessionMode;
  projectname: string;
  parentsessionid: string;
  rootsessionid: string;
  createdbytoolcallid?: string | null;
  createdbytoolname?: string | null;
  subagenttype?: string | null;
  subagentconfig?: Record<string, unknown>;
  subagentstatus?: "none" | "created" | "running" | "completed" | "failed" | "interrupted";
  path: string;
  model: NDXModelConfig;
  isrunning: boolean;
  turnphase: string;
  interruptrequested: boolean;
  interruptrequestedat: Date | null;
  interruptcompletedat: Date | null;
  runtimedata?: Record<string, unknown>;
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
  projectname: string;
  model: NDXModelConfig;
  sessionid?: string;
  title?: string;
  mode?: NDXSessionMode;
  parentsessionid?: string;
  rootsessionid?: string;
  createdbytoolcallid?: string;
  createdbytoolname?: string;
  subagenttype?: string;
  subagentconfig?: Record<string, unknown>;
};

export function withSessionProjectPath<Row extends { projectname: string }>(row: Row): Row & { path: string } {
  return { ...row, path: serverWorkspaceProjectPath(row.projectname) };
}
