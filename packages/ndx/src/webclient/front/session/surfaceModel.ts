import type { NDXSessionSkillSummary } from "ndx/common/protocol";
import { SliceModel } from "../model/SliceModel.js";
import type { SocketState } from "../app/socketState.js";

export class WebClientSessionSurfaceModel {
  readonly socketState = new SliceModel<SocketState>("idle");
  readonly attachedSessionIds = new SliceModel<Set<string>>(new Set());
  readonly skillsByProject = new SliceModel<Record<string, NDXSessionSkillSummary[]>>({});
  readonly rewriteEnabledBySession = new SliceModel<Record<string, boolean>>({});

  toggleRewrite(sessionid: string): Record<string, boolean> {
    const next = { ...this.rewriteEnabledBySession.value, [sessionid]: !this.rewriteEnabledBySession.value[sessionid] };
    if (!next[sessionid]) {
      delete next[sessionid];
    }
    this.rewriteEnabledBySession.set(next);
    return next;
  }
}

let sessionSurfaceModel: WebClientSessionSurfaceModel | undefined;

export function getWebClientSessionSurfaceModel(initialRewriteEnabledBySession: Record<string, boolean> = {}): WebClientSessionSurfaceModel {
  if (!sessionSurfaceModel) {
    sessionSurfaceModel = new WebClientSessionSurfaceModel();
    sessionSurfaceModel.rewriteEnabledBySession.set(initialRewriteEnabledBySession);
  }
  return sessionSurfaceModel;
}
