import { isNDXClientId } from "../../../common/protocol/identity/clientIdentity.js";
import {
  NDX_WEB_CLIENT_LOCALES,
  NDX_WEB_CLIENT_STATE_VERSION,
  type NDXWebClientLocale,
  type NDXWebClientProject,
  type NDXWebClientStateDocument
} from "./types.js";
import { normalizeWorkspaceProjectName, serverWorkspaceProjectPath } from "../../../common/server-path/index.js";

export const DEFAULT_NDX_WEB_CLIENT_LOCALE: NDXWebClientLocale = "ko";
export const DEFAULT_NDX_WEB_CLIENT_USERID = "ndev";

export function createInitialWebClientState(locale: unknown = DEFAULT_NDX_WEB_CLIENT_LOCALE): NDXWebClientStateDocument {
  return {
    version: NDX_WEB_CLIENT_STATE_VERSION,
    locale: isNDXWebClientLocale(locale) ? locale : DEFAULT_NDX_WEB_CLIENT_LOCALE,
    projects: []
  };
}

export function isNDXWebClientLocale(value: unknown): value is NDXWebClientLocale {
  return typeof value === "string" && NDX_WEB_CLIENT_LOCALES.includes(value as NDXWebClientLocale);
}

export function normalizeWebClientState(value: unknown): NDXWebClientStateDocument {
  if (!value || typeof value !== "object") {
    return createInitialWebClientState();
  }

  const input = value as {
    locale?: unknown;
    projects?: unknown;
    activeProjectName?: unknown;
    activeProjectId?: unknown;
    selectedUserid?: unknown;
    lastSession?: unknown;
  };
  const projects = normalizeProjects(input.projects);
  const activeProjectNameInput = typeof input.activeProjectName === "string" ? input.activeProjectName : input.activeProjectId;
  const activeProjectName =
    typeof activeProjectNameInput === "string" && projects.some((project) => project.projectName === activeProjectNameInput)
      ? activeProjectNameInput
      : projects[0]?.projectName;
  const state: NDXWebClientStateDocument = {
    version: NDX_WEB_CLIENT_STATE_VERSION,
    locale: isNDXWebClientLocale(input.locale) ? input.locale : DEFAULT_NDX_WEB_CLIENT_LOCALE,
    projects
  };

  if (activeProjectName) {
    state.activeProjectName = activeProjectName;
  }
  if (typeof input.selectedUserid === "string" && input.selectedUserid.trim().length > 0) {
    state.selectedUserid = input.selectedUserid.trim();
  }
  if (input.lastSession && typeof input.lastSession === "object") {
    const session = input.lastSession as {
      clientid?: unknown;
      userid?: unknown;
      projectName?: unknown;
      projectId?: unknown;
      connectedAt?: unknown;
    };
    const projectNameInput = typeof session.projectName === "string" ? session.projectName : session.projectId;
    if (
      isNDXClientId(session.clientid) &&
      typeof session.userid === "string" &&
      session.userid.trim().length > 0 &&
      typeof projectNameInput === "string" &&
      projectNameInput.trim().length > 0 &&
      typeof session.connectedAt === "string" &&
      !Number.isNaN(Date.parse(session.connectedAt))
    ) {
      state.lastSession = {
        clientid: session.clientid,
        userid: session.userid.trim(),
        projectName: projectNameInput.trim(),
        connectedAt: new Date(session.connectedAt).toISOString()
      };
    }
  }

  return state;
}

export function makeLocalProject(input: { projectName: string; name?: string; path?: string; screenorder?: number; userid?: string }): NDXWebClientProject {
  const projectName = normalizeWorkspaceProjectName(input.projectName);
  const name = input.name?.trim() || projectName;

  return {
    projectName,
    name,
    path: input.path?.trim() || serverWorkspaceProjectPath(projectName),
    screenorder: typeof input.screenorder === "number" && Number.isInteger(input.screenorder) && input.screenorder >= 0 ? input.screenorder : 0,
    userid: input.userid?.trim() || DEFAULT_NDX_WEB_CLIENT_USERID,
    source: "local"
  };
}

export function isAbsoluteProjectPath(path: string): boolean {
  return /^(?:[a-z]:[\\/]|\/)/iu.test(path) || path.startsWith("\\\\");
}

function normalizeProjects(value: unknown): NDXWebClientProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const projects: NDXWebClientProject[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const project = item as {
      id?: unknown;
      projectName?: unknown;
      name?: unknown;
      path?: unknown;
      screenorder?: unknown;
      userid?: unknown;
      source?: unknown;
    };
    const projectName = typeof project.projectName === "string" ? project.projectName : project.id;
    if (
      typeof projectName !== "string" ||
      project.source !== "local" ||
      !projectName.trim()
    ) {
      continue;
    }

    const normalized = makeLocalProject({
      projectName,
      name: typeof project.name === "string" ? project.name : undefined,
      path: typeof project.path === "string" ? project.path : undefined,
      screenorder: typeof project.screenorder === "number" ? project.screenorder : projects.length,
      userid: typeof project.userid === "string" ? project.userid : DEFAULT_NDX_WEB_CLIENT_USERID
    });
    if (!projects.some((existing) => existing.projectName === normalized.projectName)) {
      projects.push(normalized);
    }
  }

  return projects.sort((left, right) => right.screenorder - left.screenorder || left.name.localeCompare(right.name)).slice(0, 50);
}
