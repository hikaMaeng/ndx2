export const NDX_WEB_CLIENT_STATE_VERSION = 1;

export const NDX_WEB_CLIENT_LOCALES = ["ko", "en"] as const;

export type NDXWebClientLocale = (typeof NDX_WEB_CLIENT_LOCALES)[number];

export type NDXWebClientProject = {
  id: string;
  name: string;
  path: string;
  target: string;
  screenorder: number;
  userid: string;
  isactive: boolean;
  source: "local";
};

export type NDXWebClientSession = {
  clientid: string;
  userid: string;
  projectId: string;
  projectPath: string;
  connectedAt: string;
};

export type NDXWebClientStateDocument = {
  version: typeof NDX_WEB_CLIENT_STATE_VERSION;
  locale: NDXWebClientLocale;
  projects: NDXWebClientProject[];
  activeProjectId?: string;
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
  projectid: string;
  path: string;
  target: string;
  screenorder: number;
  userid: string;
  isactive: boolean;
  updatedat: Date;
};

export type NDXWebProjectInput = {
  projectid: string;
  screenorder?: number;
  userid?: string;
  isactive?: boolean;
};
