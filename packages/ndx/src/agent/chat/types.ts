import type { NDXDatabase } from "../init/database.js";
import type { NDXModelConfig } from "../session/types.js";

export type NDXChatFolderKind = "root" | "normal";

export type NDXChatFolderRow = {
  folderid: string;
  title: string;
  kind: NDXChatFolderKind;
  screenorder: number;
  createdat: Date;
  updatedat: Date;
};

export type NDXChatSessionRow = {
  chatsessionid: string;
  folderid: string;
  title: string;
  model: NDXModelConfig;
  isrunning: boolean;
  turnphase: string;
  interruptrequested: boolean;
  interruptrequestedat: Date | null;
  interruptcompletedat: Date | null;
  runtimedata?: Record<string, unknown>;
  createdat: Date;
  lastupdated: Date;
};

export type NDXChatSessionDataRow = {
  dataid: string;
  chatsessionid: string;
  type: string;
  contents: unknown;
  createdat: Date;
};

export type NDXChatSessionCreateInput = {
  folderid: string;
  model: NDXModelConfig;
  chatsessionid?: string;
  title?: string;
};

export type { NDXDatabase, NDXModelConfig };
