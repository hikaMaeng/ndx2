import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export const turnEndRequestQueueHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.end.request_queue",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    if (!context.sessionRequestQueueConsumerBridge) {
      return { type: "noeffect" };
    }
    const queued = await context.sessionRequestQueueConsumerBridge.claimNextRunnable(context.session.sessionid);
    if (!queued) {
      return { type: "noeffect" };
    }
    return {
      type: "noeffect",
      turnEndRequest: {
        text: queued.text,
        attachments: queued.attachments,
        model: queued.model,
        queueClaim: {
          sessionid: queued.sessionid,
          itemid: queued.itemid
        }
      }
    };
  }
};
