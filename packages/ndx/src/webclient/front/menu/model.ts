import type { NDXAgentWebChatFolder, NDXAgentWebChatSession, NDXAgentWebPinnedSession, NDXAgentWebSession } from "ndx/webclient/common";
import { SliceModel } from "../model/SliceModel.js";

export class ProjectMenuModel {
  readonly projectWarning = new SliceModel("");
  readonly projectWarningTitle = new SliceModel("");
  readonly pinnedSessions = new SliceModel<NDXAgentWebPinnedSession[]>([]);
  readonly sessionsByProject = new SliceModel<Record<string, NDXAgentWebSession[]>>({});
  readonly expandedProjectSessionIds = new SliceModel<Set<string>>(new Set());

  toggleProjectSessions(projectname: string): void {
    const next = new Set(this.expandedProjectSessionIds.value);
    if (next.has(projectname)) {
      next.delete(projectname);
    } else {
      next.add(projectname);
    }
    this.expandedProjectSessionIds.set(next);
  }

  closeProjectWarning(): void {
    this.projectWarning.set("");
    this.projectWarningTitle.set("");
  }
}

export class ChatMenuModel {
  readonly folders = new SliceModel<NDXAgentWebChatFolder[]>([]);
  readonly sessionsByFolder = new SliceModel<Record<string, NDXAgentWebChatSession[]>>({});
}

let projectMenuModel: ProjectMenuModel | undefined;
let chatMenuModel: ChatMenuModel | undefined;

export function getProjectMenuModel(): ProjectMenuModel {
  projectMenuModel ??= new ProjectMenuModel();
  return projectMenuModel;
}

export function getChatMenuModel(): ChatMenuModel {
  chatMenuModel ??= new ChatMenuModel();
  return chatMenuModel;
}
