export const NDX_CONTAINER_ROOT = "/ndx";
export const NDX_CONTAINER_ASSETS_ROOT = "/ndx/.ndx";
export const NDX_CONTAINER_DATA_ROOT = "/ndx/.ndx/data";
export const NDX_CONTAINER_LOG_ROOT = "/ndx/.ndx/log";
export const NDX_CONTAINER_WORKSPACE = "/ndx/workspace";
export const NDX_CONTAINER_USER_HOME = "/ndx";
export const NDX_CONTAINER_NDX_HOME = "/ndx/.ndx";

export type ServerVolumeMap = {
  hostRoot: string;
  containerRoot?: string;
  containerWorkspace?: string;
  containerUserHome?: string;
  containerNdxHome?: string;
};

export function defaultServerVolumeMap(): ServerVolumeMap {
  const containerRoot = runtimeEnv("NDX_CONTAINER_ROOT") || NDX_CONTAINER_ROOT;
  const configuredRoot = runtimeEnv("NDX_ROOT") || "F:/dev/ndx2/volume";
  return {
    hostRoot: runtimeEnv("NDX_HOST_ROOT") || (cleanPosixPath(configuredRoot) === cleanPosixPath(containerRoot) ? "F:/dev/ndx2/volume" : configuredRoot),
    containerRoot: runtimeEnv("NDX_CONTAINER_ROOT"),
    containerWorkspace: runtimeEnv("NDX_CONTAINER_WORKSPACE"),
    containerUserHome: runtimeEnv("NDX_CONTAINER_USER_HOME"),
    containerNdxHome: runtimeEnv("NDX_CONTAINER_NDX_HOME")
  };
}

export function serverContainerRoot(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  return cleanPosixPath(fullMap.containerRoot ?? NDX_CONTAINER_ROOT);
}

export function serverContainerWorkspace(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  const root = fullMap.containerRoot ?? NDX_CONTAINER_ROOT;
  return cleanPosixPath(fullMap.containerWorkspace ?? posixJoin(root, "workspace"));
}

export function serverHostWorkspace(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  return cleanPosixPath(posixJoin(cleanHostPath(fullMap.hostRoot), "workspace"));
}

export function serverContainerUserHome(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  const root = fullMap.containerRoot ?? NDX_CONTAINER_ROOT;
  return cleanPosixPath(fullMap.containerUserHome ?? root);
}

export function serverContainerNdxHome(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  const root = fullMap.containerRoot ?? NDX_CONTAINER_ROOT;
  return cleanPosixPath(fullMap.containerNdxHome ?? posixJoin(root, ".ndx"));
}

export function toServerUserHome(value?: string, map: Partial<ServerVolumeMap> = {}): string {
  return toServerContainerPath(value || serverContainerUserHome(map), map);
}

export function toServerProjectPath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const mapped = toServerContainerPath(value, map);
  if (!posixIsAbsolute(mapped)) {
    return posixJoin(serverContainerWorkspace(map), mapped);
  }
  return mapped;
}

export function toServerWorkspacePath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const workspace = serverContainerWorkspace(map);
  const mapped = toServerProjectPath(value || ".", map);
  const relative = posixRelative(workspace, mapped);
  if (relative.startsWith("..") || posixIsAbsolute(relative)) {
    throw new Error(`Path is outside configured workspace volume: ${value}`);
  }
  return mapped;
}

export function toServerWorkspaceDescendantPath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const workspacePath = toServerWorkspacePath(value, map);
  if (workspacePath === serverContainerWorkspace(map)) {
    throw new Error("Project path must be a directory under the workspace root.");
  }
  return workspacePath;
}

export function normalizeWorkspaceProjectName(value: string): string {
  const projectName = value.trim();
  if (
    !projectName ||
    projectName === "." ||
    projectName === ".." ||
    projectName.includes("/") ||
    projectName.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(projectName)
  ) {
    throw new Error(`Invalid workspace project name: ${value}`);
  }
  return projectName;
}

export function serverWorkspaceProjectPath(projectName: string, map: Partial<ServerVolumeMap> = {}): string {
  return posixJoin(serverContainerWorkspace(map), normalizeWorkspaceProjectName(projectName));
}

export function workspaceProjectNameFromPath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const workspacePath = toServerWorkspaceDescendantPath(value, map);
  const relative = posixRelative(serverContainerWorkspace(map), workspacePath);
  const projectName = relative.split("/").filter(Boolean)[0];
  if (!projectName) {
    throw new Error("Project path must be a directory under the workspace root.");
  }
  return normalizeWorkspaceProjectName(projectName);
}

export function serverPathRelativeToWorkspace(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const workspace = serverContainerWorkspace(map);
  const workspacePath = toServerWorkspacePath(value, map);
  return posixRelative(workspace, workspacePath);
}

export function toHostWorkspacePath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const relative = serverPathRelativeToWorkspace(value, map);
  return cleanPosixPath(posixJoin(serverHostWorkspace(map), relative));
}

export function toServerContainerPath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  if (!value.trim()) {
    return value;
  }

  const fullMap = { ...defaultServerVolumeMap(), ...map };
  const input = normalizeSlashes(value.trim());
  const containerRoot = cleanPosixPath(fullMap.containerRoot ?? NDX_CONTAINER_ROOT);
  const hostRoot = cleanHostPath(fullMap.hostRoot);
  const hostRootWsl = windowsDriveToWsl(hostRoot);

  const containerRootMatch = relativeIfInside(input, containerRoot, false);
  if (containerRootMatch) {
    return posixJoin(containerRoot, containerRootMatch.relative);
  }

  const hostRootMatch = relativeIfInside(input, hostRoot, true) ?? relativeIfInside(input, hostRootWsl, false);
  if (hostRootMatch) {
    return posixJoin(containerRoot, hostRootMatch.relative);
  }

  if (isWindowsDrivePath(input)) {
    throw new Error(`Windows path is outside configured server volumes: ${value}`);
  }

  return cleanPosixPath(input);
}

export function toServerReadableFilePath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  if (!value.trim()) {
    return value;
  }
  const input = normalizeSlashes(value.trim());
  if (!isWindowsDrivePath(input)) {
    return toServerContainerPath(input, map);
  }
  try {
    return toServerContainerPath(input, map);
  } catch (error) {
    if (error instanceof Error && error.message.includes("outside configured server volumes")) {
      return cleanPosixPath(windowsDriveToDockerDesktopHost(input));
    }
    throw error;
  }
}

function relativeIfInside(value: string, root: string, caseInsensitive: boolean): { relative: string } | undefined {
  if (!root) {
    return undefined;
  }
  const normalizedRoot = cleanPosixPath(root);
  const normalizedValue = cleanPosixPath(value);
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  const comparableValue = caseInsensitive ? normalizedValue.toLowerCase() : normalizedValue;
  if (comparableValue === comparableRoot) {
    return { relative: "" };
  }
  if (comparableValue.startsWith(`${comparableRoot}/`)) {
    return { relative: normalizedValue.slice(normalizedRoot.length + 1) };
  }
  return undefined;
}

function cleanHostPath(value: string): string {
  return cleanPosixPath(normalizeSlashes(value));
}

function cleanPosixPath(value: string): string {
  if (!value) {
    return value;
  }
  return posixNormalize(normalizeSlashes(value)).replace(/\/$/, "") || "/";
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value);
}

function windowsDriveToWsl(value: string): string {
  const normalized = normalizeSlashes(value);
  const match = normalized.match(/^([A-Za-z]):\/?(.*)$/);
  if (!match) {
    return normalized;
  }
  return posixJoin("/mnt", match[1]!.toLowerCase(), match[2] ?? "");
}

function windowsDriveToDockerDesktopHost(value: string): string {
  const normalized = normalizeSlashes(value);
  const match = normalized.match(/^([A-Za-z]):\/?(.*)$/);
  if (!match) {
    return normalized;
  }
  return posixJoin("/mnt/host", match[1]!.toLowerCase(), match[2] ?? "");
}

function runtimeEnv(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function posixJoin(...parts: string[]): string {
  return posixNormalize(parts.filter((part) => part !== "").join("/"));
}

function posixIsAbsolute(value: string): boolean {
  return normalizeSlashes(value).startsWith("/");
}

function posixRelative(from: string, to: string): string {
  const fromParts = cleanPosixPath(from).split("/").filter(Boolean);
  const toParts = cleanPosixPath(to).split("/").filter(Boolean);
  let index = 0;
  while (index < fromParts.length && index < toParts.length && fromParts[index] === toParts[index]) {
    index += 1;
  }
  return [...Array(fromParts.length - index).fill(".."), ...toParts.slice(index)].join("/");
}

function posixNormalize(value: string): string {
  const normalized = normalizeSlashes(value);
  const absolute = normalized.startsWith("/");
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!absolute) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }
  const result = `${absolute ? "/" : ""}${parts.join("/")}`;
  return result || (absolute ? "/" : ".");
}
