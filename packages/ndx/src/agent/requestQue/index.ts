import { randomUUID } from "node:crypto";
import type { NDXSessionAttachmentReference, NDXSessionModelConfig, NDXSessionRequestQueueItem } from "../../common/protocol/index.js";

export type NDXQueuedSessionRequestAttachment = NDXSessionAttachmentReference & {
  attachmentid: string;
};

export type NDXSessionRequestQueueModelSource = "session-default" | "client-selected" | "tool-default";

export type NDXQueuedSessionRequest = {
  itemid: string;
  sessionid: string;
  text: string;
  attachments: NDXQueuedSessionRequestAttachment[];
  model: NDXSessionModelConfig;
  modelSource?: NDXSessionRequestQueueModelSource;
  modelUpdatedAt?: string;
  createdat: string;
  updatedat: string;
  claimedat?: string;
};

export type NDXClaimedSessionRequest = Omit<NDXQueuedSessionRequest, "attachments"> & {
  attachments: NDXSessionAttachmentReference[];
};

export type NDXSessionRequestQueueEnqueueInput = {
  sessionid: string;
  text: string;
  attachments?: NDXSessionAttachmentReference[];
  model: NDXSessionModelConfig;
  modelSource?: NDXSessionRequestQueueModelSource;
  now?: string;
};

export type NDXSessionRequestQueuePosition =
  | { type: "front" | "end" }
  | { type: "before" | "after"; itemid: string };

export type NDXSessionRequestQueueInsertInput = NDXSessionRequestQueueEnqueueInput & {
  position?: NDXSessionRequestQueuePosition;
};

export type NDXSessionRequestQueueBridgeInsertInput = Omit<NDXSessionRequestQueueInsertInput, "model"> & {
  model?: NDXSessionModelConfig;
  modelSource?: NDXSessionRequestQueueModelSource;
};

export type NDXSessionRequestQueueUpdateInput = {
  sessionid: string;
  itemid: string;
  text: string;
  model: NDXSessionModelConfig;
  modelSource?: NDXSessionRequestQueueModelSource;
  keepAttachmentIds?: string[];
  attachments?: NDXSessionAttachmentReference[];
  now?: string;
};

export type NDXSessionRequestQueueEditBridge = {
  list: (sessionid: string) => NDXSessionRequestQueueItem[] | Promise<NDXSessionRequestQueueItem[]>;
  add: (input: NDXSessionRequestQueueBridgeInsertInput) => NDXSessionRequestQueueItem | Promise<NDXSessionRequestQueueItem>;
  updateText: (sessionid: string, itemid: string, text: string) => NDXSessionRequestQueueItem | undefined | Promise<NDXSessionRequestQueueItem | undefined>;
  update: (input: NDXSessionRequestQueueUpdateInput) => NDXSessionRequestQueueItem | undefined | Promise<NDXSessionRequestQueueItem | undefined>;
  delete: (sessionid: string, itemid: string) => boolean | Promise<boolean>;
  clear: (sessionid: string) => void | Promise<void>;
};

export type NDXSessionRequestQueueConsumerBridge = {
  claimNextRunnable: (sessionid: string) => NDXClaimedSessionRequest | undefined | Promise<NDXClaimedSessionRequest | undefined>;
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
      attachments: queueAttachments(input.attachments),
      model: input.model,
      modelSource: input.modelSource,
      modelUpdatedAt: input.modelSource ? now : undefined,
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
    if (!item || item.claimedat) return undefined;
    item.text = text.trim();
    item.updatedat = now;
    return item;
  }

  update(input: NDXSessionRequestQueueUpdateInput): NDXQueuedSessionRequest | undefined {
    const now = input.now ?? new Date().toISOString();
    const item = this.#queues.get(input.sessionid)?.find((queued) => queued.itemid === input.itemid);
    if (!item || item.claimedat) return undefined;
    const keepAttachmentIds = new Set(input.keepAttachmentIds ?? []);
    item.text = input.text.trim();
    item.model = input.model;
    item.modelSource = input.modelSource;
    item.modelUpdatedAt = now;
    item.attachments = [
      ...item.attachments.filter((attachment) => keepAttachmentIds.has(attachment.attachmentid) && modelSupportsAttachmentMimeType(input.model, attachment.mimeType)),
      ...queueAttachments(input.attachments).filter((attachment) => modelSupportsAttachmentMimeType(input.model, attachment.mimeType))
    ];
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

  claimNextRunnable(sessionid: string, now: string = new Date().toISOString()): NDXClaimedSessionRequest | undefined {
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
      return {
        ...next,
        attachments: next.attachments.map(sessionAttachmentReference)
      };
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
    ...(item.attachments.length ? { attachments: item.attachments.map(({ attachmentid, name, mimeType, size }) => ({ attachmentid, name, mimeType, size })) } : {}),
    model: item.model,
    createdat: item.createdat,
    updatedat: item.updatedat
  };
}

function queueAttachments(attachments: NDXSessionAttachmentReference[] = []): NDXQueuedSessionRequestAttachment[] {
  return attachments.map((attachment) => ({
    attachmentid: "attachmentid" in attachment && typeof attachment.attachmentid === "string" ? attachment.attachmentid : randomUUID(),
    kind: attachment.kind,
    path: attachment.path,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size
  }));
}

function sessionAttachmentReference(attachment: NDXQueuedSessionRequestAttachment): NDXSessionAttachmentReference {
  return {
    kind: attachment.kind,
    path: attachment.path,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size
  };
}

function modelSupportsAttachmentMimeType(model: NDXSessionModelConfig, mimeType: string): boolean {
  const modalities = new Set(model.modalities ?? ["text"]);
  return modalities.has(mimeType.toLowerCase().startsWith("image/") ? "image" : "file");
}
