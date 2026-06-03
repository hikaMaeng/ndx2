import type { NDXDatabase } from "../init/database.js";
import { serverWorkspaceProjectPath } from "../../common/server-path/index.js";

export type NDXSessionMode = "none" | "light";

export type NDXModelConfig = {
  type: "openai";
  provider?: string;
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
  projectname: string;
  path: string;
  model: NDXModelConfig;
  isrunning: boolean;
  turnphase: string;
  interruptrequested: boolean;
  interruptrequestedat: Date | null;
  interruptcompletedat: Date | null;
  slidewindow?: number;
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
  userid: string;
  projectname: string;
  model: NDXModelConfig;
  sessionid?: string;
  title?: string;
  mode?: NDXSessionMode;
};

export function withSessionProjectPath<Row extends { projectname: string }>(row: Row): Row & { path: string } {
  return { ...row, path: serverWorkspaceProjectPath(row.projectname) };
}
