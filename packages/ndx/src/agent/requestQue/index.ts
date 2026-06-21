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
  claimedat?: string;
};

export type NDXSessionRequestQueueEnqueueInput = {
  sessionid: string;
  text: string;
  attachments?: NDXSessionAttachmentReference[];
  model?: NDXSessionModelConfig;
  now?: string;
};

export type NDXSessionRequestQueuePosition =
  | { type: "front" | "end" }
  | { type: "before" | "after"; itemid: string };

export type NDXSessionRequestQueueInsertInput = NDXSessionRequestQueueEnqueueInput & {
  position?: NDXSessionRequestQueuePosition;
};

export type NDXSessionRequestQueueEditBridge = {
  list: (sessionid: string) => NDXSessionRequestQueueItem[] | Promise<NDXSessionRequestQueueItem[]>;
  add: (input: NDXSessionRequestQueueInsertInput) => NDXSessionRequestQueueItem | Promise<NDXSessionRequestQueueItem>;
  updateText: (sessionid: string, itemid: string, text: string) => NDXSessionRequestQueueItem | undefined | Promise<NDXSessionRequestQueueItem | undefined>;
  delete: (sessionid: string, itemid: string) => boolean | Promise<boolean>;
  clear: (sessionid: string) => void | Promise<void>;
};

export type NDXSessionRequestQueueConsumerBridge = {
  claimNextRunnable: (sessionid: string) => NDXQueuedSessionRequest | undefined | Promise<NDXQueuedSessionRequest | undefined>;
  releaseClaim: (sessionid: string, itemid: string) => boolean | Promise<boolean>;
  completeClaim: (sessionid: string, itemid: string) => boolean | Promise<boolean>;
};

export class NDXSessionRequestQueueRegistry {
  readonly #queues = new Map<string, NDXQueuedSessionRequest[]>();

  enqueue(input: NDXSessionRequestQueueEnqueueInput): NDXQueuedSessionRequest {
    return this.insert(input);
  }

  insert(input: NDXSessionRequestQueueInsertInput): NDXQueuedSessionRequest {
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
    const position = input.position ?? { type: "end" as const };
    if (position.type === "front") {
      queue.unshift(item);
    } else if (position.type === "before" || position.type === "after") {
      const index = queue.findIndex((queued) => queued.itemid === position.itemid);
      if (index < 0) {
        queue.push(item);
      } else {
        queue.splice(position.type === "before" ? index : index + 1, 0, item);
      }
    } else {
      queue.push(item);
    }
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

  claimNextRunnable(sessionid: string, now: string = new Date().toISOString()): NDXQueuedSessionRequest | undefined {
    const queue = this.#queues.get(sessionid) ?? [];
    while (queue.length > 0) {
      const next = queue[0];
      if (!next) break;
      if (next.claimedat) {
        break;
      }
      if (!next.text.trim() && next.attachments.length === 0) {
        queue.shift();
        continue;
      }
      break;
    }
    const next = queue.find((item) => !item.claimedat && (item.text.trim() || item.attachments.length > 0));
    if (next) {
      next.claimedat = now;
      this.#setQueue(sessionid, queue);
      return next;
    }
    this.#setQueue(sessionid, queue);
    return undefined;
  }

  releaseClaim(sessionid: string, itemid: string): boolean {
    const item = this.#queues.get(sessionid)?.find((queued) => queued.itemid === itemid);
    if (!item?.claimedat) return false;
    delete item.claimedat;
    return true;
  }

  completeClaim(sessionid: string, itemid: string): boolean {
    return this.delete(sessionid, itemid);
  }

  #setQueue(sessionid: string, queue: NDXQueuedSessionRequest[]): void {
    if (queue.length === 0) {
      this.#queues.delete(sessionid);
    } else {
      this.#queues.set(sessionid, queue);
    }
  }

  clear(sessionid: string): void {
    this.#queues.delete(sessionid);
  }

  items(sessionid: string): NDXSessionRequestQueueItem[] {
    return (this.#queues.get(sessionid) ?? []).filter((item) => !item.claimedat).map(sessionRequestQueueItemForSocket);
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
