import type { NDXDatabase } from "../init/database.js";

export type NDXSessionTokenRow = {
  token: string;
  createdat: Date;
  sessionid: string;
};

export type NDXSessionTokenGrant = NDXSessionTokenRow & {
  userid: string;
  projectname: string;
};

export type { NDXDatabase };
