import { randomUUID } from "node:crypto";
import type { NDXSessionAttachmentReference, NDXSessionModelConfig, NDXSessionRequestQueueItem } from "../../common/protocol/index.js";

export type NDXQueuedSessionRequest = {
  itemid: string;
  sessionid: string;
  text: string;
  attachments: NDXSessionAttachmentReference[];
  model?: NDXSessionModelConfig;
  createdat: string;
  updatedat: string;
};

export type NDXSessionRequestQueueEnqueueInput = {
  sessionid: string;
  text: string;
  attachments?: NDXSessionAttachmentReference[];
  model?: NDXSessionModelConfig;
  now?: string;
};

export class NDXSessionRequestQueueRegistry {
  readonly #queues = new Map<string, NDXQueuedSessionRequest[]>();

  enqueue(input: NDXSessionRequestQueueEnqueueInput): NDXQueuedSessionRequest {
    const now = input.now ?? new Date().toISOString();
    const item: NDXQueuedSessionRequest = {
      itemid: randomUUID(),
      sessionid: input.sessionid,
      text: input.text.trim(),
      attachments: input.attachments ?? [],
      model: input.model,
      createdat: now,
      updatedat: now
    };
    const queue = this.#queues.get(input.sessionid) ?? [];
    queue.push(item);
    this.#queues.set(input.sessionid, queue);
    return item;
  }

  updateText(sessionid: string, itemid: string, text: string, now: string = new Date().toISOString()): NDXQueuedSessionRequest | undefined {
    const item = this.#queues.get(sessionid)?.find((queued) => queued.itemid === itemid);
    if (!item) return undefined;
    item.text = text.trim();
    item.updatedat = now;
    return item;
  }

  delete(sessionid: string, itemid: string): boolean {
    const queue = this.#queues.get(sessionid) ?? [];
    const next = queue.filter((queued) => queued.itemid !== itemid);
    if (next.length === queue.length) return false;
    if (next.length > 0) {
      this.#queues.set(sessionid, next);
    } else {
      this.#queues.delete(sessionid);
    }
    return true;
  }

  shift(sessionid: string): NDXQueuedSessionRequest | undefined {
    const queue = this.#queues.get(sessionid) ?? [];
    const next = queue.shift();
    if (queue.length > 0) {
      this.#queues.set(sessionid, queue);
    } else {
      this.#queues.delete(sessionid);
    }
    return next;
  }

  clear(sessionid: string): void {
    this.#queues.delete(sessionid);
  }

  items(sessionid: string): NDXSessionRequestQueueItem[] {
    return (this.#queues.get(sessionid) ?? []).map(sessionRequestQueueItemForSocket);
  }

  hasItems(sessionid: string): boolean {
    return (this.#queues.get(sessionid)?.length ?? 0) > 0;
  }
}

export function createNDXSessionRequestQueueRegistry(): NDXSessionRequestQueueRegistry {
  return new NDXSessionRequestQueueRegistry();
}

export function sessionRequestQueueItemForSocket(item: NDXQueuedSessionRequest): NDXSessionRequestQueueItem {
  return {
    itemid: item.itemid,
    sessionid: item.sessionid,
    text: item.text,
    ...(item.attachments.length ? { attachments: item.attachments.map(({ name, mimeType, size }) => ({ name, mimeType, size })) } : {}),
    ...(item.model ? { model: item.model } : {}),
    createdat: item.createdat,
    updatedat: item.updatedat
  };
}
