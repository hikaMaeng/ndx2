import type { NDXDatabase } from "../init/database.js";

export type NDXSessionTokenRow = {
  token: string;
  createdat: Date;
  sessionid: string;
};

export type NDXSessionTokenGrant = NDXSessionTokenRow & {
  userid: string;
  projectid: string;
  path: string;
};

export type { NDXDatabase };
