import type { NDXAgentWebMetadataResponse } from "ndx/webclient/common";

export function projectNameForVSCode(path: string, workspace?: NDXAgentWebMetadataResponse["workspace"]) {
  const normalizedPath = path.replace(/\\/g, "/");
  if (!workspace) return normalizedPath;
  const containerRoot = workspace.containerWorkspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalizedPath === containerRoot) {
    return workspace.hostWorkspaceRoot;
  }
  if (normalizedPath.startsWith(`${containerRoot}/`)) {
    return `${workspace.hostWorkspaceRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${normalizedPath.slice(containerRoot.length + 1)}`;
  }
  return normalizedPath;
}
