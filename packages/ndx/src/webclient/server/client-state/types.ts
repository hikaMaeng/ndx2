export const NDX_WEB_CLIENT_STATE_VERSION = 1;

export const NDX_WEB_CLIENT_LOCALES = ["ko", "en"] as const;

export type NDXWebClientLocale = (typeof NDX_WEB_CLIENT_LOCALES)[number];

export type NDXWebClientProject = {
  projectName: string;
  name: string;
  path: string;
  screenorder: number;
  source: "local";
};

export type NDXWebClientSession = {
  clientid: string;
  projectName: string;
  connectedAt: string;
};

export type NDXWebClientStateDocument = {
  version: typeof NDX_WEB_CLIENT_STATE_VERSION;
  locale: NDXWebClientLocale;
  projects: NDXWebClientProject[];
  activeProjectName?: string;
  lastSession?: NDXWebClientSession;
};

export type NDXWebClientStateRow = {
  clientid: string;
  state: NDXWebClientStateDocument;
  updatedat: Date;
};

export type NDXWebClientStateInput = {
  clientid: string;
  state: unknown;
};

export type NDXWebProjectRow = {
  projectname: string;
  screenorder: number;
  updatedat: Date;
};

export type NDXWebProjectInput = {
  projectname: string;
  screenorder?: number;
};
