import { createInitialWebClientState, makeLocalProject, normalizeWebClientState } from "ndx/webclient/common";

const CLIENT_ID_STORAGE_KEY = "ndx.agent.web.clientid";
const STATE_CACHE_STORAGE_KEY = "ndx.agent.web.state.cache";
const OLD_PROJECT_STORAGE_KEY = "ndx.agent.projects";

export function readOrCreateClientId() {
  const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const clientid = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientid);
  return clientid;
}

export function cacheClientState(state: unknown) {
  localStorage.setItem(STATE_CACHE_STORAGE_KEY, JSON.stringify(normalizeWebClientState(state)));
}

export function readCachedState() {
  const locale = navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
  const cached = localStorage.getItem(STATE_CACHE_STORAGE_KEY);
  if (cached) {
    try {
      return normalizeWebClientState(JSON.parse(cached));
    } catch {
      return createInitialWebClientState(locale);
    }
  }

  const initial = createInitialWebClientState(locale);
  const oldProjects = localStorage.getItem(OLD_PROJECT_STORAGE_KEY);
  if (!oldProjects) {
    return initial;
  }

  try {
    const projects = JSON.parse(oldProjects) as Array<{ id?: string; name?: string; path?: string; source?: string }>;
    return normalizeWebClientState({
      ...initial,
      projects: projects
        .filter((project) => project.source === "local" && project.id && project.name && project.path)
        .map((project) =>
          makeLocalProject({
            projectName: project.id as string,
            name: project.name as string,
            path: project.path as string
          })
        )
    });
  } catch {
    return initial;
  }
}
