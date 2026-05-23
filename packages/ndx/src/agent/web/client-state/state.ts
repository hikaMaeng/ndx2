import { isNDXClientId } from "../../common/protocol/identity/clientIdentity.js";
import {
  NDX_WEB_CLIENT_LOCALES,
  NDX_WEB_CLIENT_STATE_VERSION,
  type NDXWebClientLocale,
  type NDXWebClientProject,
  type NDXWebClientStateDocument
} from "./types.js";

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
    activeProjectId?: unknown;
    selectedUserid?: unknown;
    lastSession?: unknown;
  };
  const projects = normalizeProjects(input.projects);
  const activeProjectId =
    typeof input.activeProjectId === "string" && projects.some((project) => project.id === input.activeProjectId)
      ? input.activeProjectId
      : projects[0]?.id;
  const state: NDXWebClientStateDocument = {
    version: NDX_WEB_CLIENT_STATE_VERSION,
    locale: isNDXWebClientLocale(input.locale) ? input.locale : DEFAULT_NDX_WEB_CLIENT_LOCALE,
    projects
  };

  if (activeProjectId) {
    state.activeProjectId = activeProjectId;
  }
  if (typeof input.selectedUserid === "string" && input.selectedUserid.trim().length > 0) {
    state.selectedUserid = input.selectedUserid.trim();
  }
  if (input.lastSession && typeof input.lastSession === "object") {
    const session = input.lastSession as {
      clientid?: unknown;
      userid?: unknown;
      projectId?: unknown;
      projectPath?: unknown;
      connectedAt?: unknown;
    };
    if (
      isNDXClientId(session.clientid) &&
      typeof session.userid === "string" &&
      session.userid.trim().length > 0 &&
      typeof session.projectId === "string" &&
      session.projectId.trim().length > 0 &&
      typeof session.projectPath === "string" &&
      session.projectPath.trim().length > 0 &&
      typeof session.connectedAt === "string" &&
      !Number.isNaN(Date.parse(session.connectedAt))
    ) {
      state.lastSession = {
        clientid: session.clientid,
        userid: session.userid.trim(),
        projectId: session.projectId.trim(),
        projectPath: session.projectPath.trim(),
        connectedAt: new Date(session.connectedAt).toISOString()
      };
    }
  }

  return state;
}

export function makeLocalProject(input: { id: string; name: string; path: string; target?: string; screenorder?: number; userid?: string; isactive?: boolean }): NDXWebClientProject {
  const name = input.name.trim();
  const path = input.path.trim();
  if (!input.id.trim() || !name || !path) {
    throw new Error("project id, name, and path are required.");
  }

  return {
    id: input.id.trim(),
    name,
    path,
    target: input.target?.trim() || "local",
    screenorder: typeof input.screenorder === "number" && Number.isInteger(input.screenorder) && input.screenorder >= 0 ? input.screenorder : 0,
    userid: input.userid?.trim() || DEFAULT_NDX_WEB_CLIENT_USERID,
    isactive: input.isactive ?? true,
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
      name?: unknown;
      path?: unknown;
      target?: unknown;
      screenorder?: unknown;
      userid?: unknown;
      isactive?: unknown;
      source?: unknown;
    };
    if (
      typeof project.id !== "string" ||
      typeof project.name !== "string" ||
      typeof project.path !== "string" ||
      project.source !== "local" ||
      !project.id.trim() ||
      !project.name.trim() ||
      !project.path.trim()
    ) {
      continue;
    }
    if (project.isactive === false) {
      continue;
    }

    const normalized = makeLocalProject({
      id: project.id,
      name: project.name,
      path: project.path,
      target: typeof project.target === "string" ? project.target : "local",
      screenorder: typeof project.screenorder === "number" ? project.screenorder : projects.length,
      userid: typeof project.userid === "string" ? project.userid : DEFAULT_NDX_WEB_CLIENT_USERID,
      isactive: typeof project.isactive === "boolean" ? project.isactive : true
    });
    if (!projects.some((existing) => existing.id === normalized.id)) {
      projects.push(normalized);
    }
  }

  return projects.sort((left, right) => right.screenorder - left.screenorder || left.name.localeCompare(right.name)).slice(0, 50);
}
