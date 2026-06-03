import path from "node:path";

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
  const containerRoot = process.env.NDX_CONTAINER_ROOT || NDX_CONTAINER_ROOT;
  const configuredRoot = process.env.NDX_ROOT || "F:/dev/ndx2/volume";
  return {
    hostRoot: process.env.NDX_HOST_ROOT || (cleanPosixPath(configuredRoot) === cleanPosixPath(containerRoot) ? "F:/dev/ndx2/volume" : configuredRoot),
    containerRoot: process.env.NDX_CONTAINER_ROOT,
    containerWorkspace: process.env.NDX_CONTAINER_WORKSPACE,
    containerUserHome: process.env.NDX_CONTAINER_USER_HOME,
    containerNdxHome: process.env.NDX_CONTAINER_NDX_HOME
  };
}

export function serverContainerRoot(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  return cleanPosixPath(fullMap.containerRoot ?? NDX_CONTAINER_ROOT);
}

export function serverContainerWorkspace(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  const root = fullMap.containerRoot ?? NDX_CONTAINER_ROOT;
  return cleanPosixPath(fullMap.containerWorkspace ?? path.posix.join(root, "workspace"));
}

export function serverHostWorkspace(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  return cleanPosixPath(path.posix.join(cleanHostPath(fullMap.hostRoot), "workspace"));
}

export function serverContainerUserHome(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  const root = fullMap.containerRoot ?? NDX_CONTAINER_ROOT;
  return cleanPosixPath(fullMap.containerUserHome ?? root);
}

export function serverContainerNdxHome(map: Partial<ServerVolumeMap> = {}): string {
  const fullMap = { ...defaultServerVolumeMap(), ...map };
  const root = fullMap.containerRoot ?? NDX_CONTAINER_ROOT;
  return cleanPosixPath(fullMap.containerNdxHome ?? path.posix.join(root, ".ndx"));
}

export function toServerUserHome(value?: string, map: Partial<ServerVolumeMap> = {}): string {
  return toServerContainerPath(value || serverContainerUserHome(map), map);
}

export function toServerProjectPath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const mapped = toServerContainerPath(value, map);
  if (!path.posix.isAbsolute(mapped)) {
    return path.posix.join(serverContainerWorkspace(map), mapped);
  }
  return mapped;
}

export function toServerWorkspacePath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const workspace = serverContainerWorkspace(map);
  const mapped = toServerProjectPath(value || ".", map);
  const relative = path.posix.relative(workspace, mapped);
  if (relative.startsWith("..") || path.posix.isAbsolute(relative)) {
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
  return path.posix.join(serverContainerWorkspace(map), normalizeWorkspaceProjectName(projectName));
}

export function workspaceProjectNameFromPath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const workspacePath = toServerWorkspaceDescendantPath(value, map);
  const relative = path.posix.relative(serverContainerWorkspace(map), workspacePath);
  const projectName = relative.split("/").filter(Boolean)[0];
  if (!projectName) {
    throw new Error("Project path must be a directory under the workspace root.");
  }
  return normalizeWorkspaceProjectName(projectName);
}

export function serverPathRelativeToWorkspace(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const workspace = serverContainerWorkspace(map);
  const workspacePath = toServerWorkspacePath(value, map);
  return path.posix.relative(workspace, workspacePath);
}

export function toHostWorkspacePath(value: string, map: Partial<ServerVolumeMap> = {}): string {
  const relative = serverPathRelativeToWorkspace(value, map);
  return cleanPosixPath(path.posix.join(serverHostWorkspace(map), relative));
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
    return path.posix.join(containerRoot, containerRootMatch.relative);
  }

  const hostRootMatch = relativeIfInside(input, hostRoot, true) ?? relativeIfInside(input, hostRootWsl, false);
  if (hostRootMatch) {
    return path.posix.join(containerRoot, hostRootMatch.relative);
  }

  if (isWindowsDrivePath(input)) {
    throw new Error(`Windows path is outside configured server volumes: ${value}`);
  }

  return cleanPosixPath(input);
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
  return path.posix.normalize(normalizeSlashes(value)).replace(/\/$/, "") || "/";
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
  return path.posix.join("/mnt", match[1]!.toLowerCase(), match[2] ?? "");
}
