export const NDX_WEB_CLIENT_STATE_VERSION = 1;

export const NDX_WEB_CLIENT_LOCALES = ["ko", "en"] as const;

export type NDXWebClientLocale = (typeof NDX_WEB_CLIENT_LOCALES)[number];

export type NDXWebClientProject = {
  projectName: string;
  name: string;
  path: string;
  screenorder: number;
  userid: string;
  source: "local";
};

export type NDXWebClientSession = {
  clientid: string;
  userid: string;
  projectName: string;
  connectedAt: string;
};

export type NDXWebClientStateDocument = {
  version: typeof NDX_WEB_CLIENT_STATE_VERSION;
  locale: NDXWebClientLocale;
  projects: NDXWebClientProject[];
  activeProjectName?: string;
  selectedUserid?: string;
  lastSession?: NDXWebClientSession;
};

export type NDXWebClientStateRow = {
  clientid: string;
  userid: string | null;
  state: NDXWebClientStateDocument;
  updatedat: Date;
};

export type NDXWebClientStateInput = {
  clientid: string;
  userid?: string | null;
  state: unknown;
};

export type NDXWebProjectRow = {
  projectname: string;
  screenorder: number;
  userid: string;
  updatedat: Date;
};

export type NDXWebProjectInput = {
  projectname: string;
  screenorder?: number;
  userid?: string;
};
