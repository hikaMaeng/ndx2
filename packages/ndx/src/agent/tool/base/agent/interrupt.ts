import { appendSessionData } from "../../../session/appendSessionData.js";
import { interruptContents } from "../../../session/content.js";
import { completeSessionInterrupt, requestSessionInterrupt } from "../../../session/interruptSession.js";
import { requestRuntimeTurnInterrupt } from "../../../turnloop/base/interrupt/index.js";
import type { NDXDatabase } from "../../../session/types.js";

const childrenByParent = new Map<string, Set<string>>();
const parentByChild = new Map<string, string>();

export function registerActiveSubsession(parentSessionid: string, childSessionid: string): () => void {
  let children = childrenByParent.get(parentSessionid);
  if (!children) {
    children = new Set<string>();
    childrenByParent.set(parentSessionid, children);
  }
  children.add(childSessionid);
  parentByChild.set(childSessionid, parentSessionid);
  return () => {
    children?.delete(childSessionid);
    if (children?.size === 0) childrenByParent.delete(parentSessionid);
    parentByChild.delete(childSessionid);
  };
}

export function activeDescendantSessionIds(sessionid: string): string[] {
  const output: string[] = [];
  const queue = [...(childrenByParent.get(sessionid) ?? [])];
  while (queue.length > 0) {
    const child = queue.shift();
    if (!child) continue;
    output.push(child);
    queue.push(...(childrenByParent.get(child) ?? []));
  }
  return output;
}

export async function interruptActiveDescendantSessions(database: NDXDatabase, sessionid: string): Promise<string[]> {
  const descendants = activeDescendantSessionIds(sessionid).reverse();
  for (const childSessionid of descendants) {
    await appendSessionData(database, childSessionid, "system", interruptContents(new Date().toISOString())).catch((error: unknown) => {
      database.logger?.warn("agent.subsession.interrupt.row_failed", { sessionid: childSessionid, error: String(error) });
    });
    await requestSessionInterrupt(database, childSessionid, "cascading_interrupt").catch((error: unknown) => {
      database.logger?.warn("agent.subsession.interrupt.request_failed", { sessionid: childSessionid, error: String(error) });
    });
    if (!requestRuntimeTurnInterrupt(childSessionid)) {
      await completeSessionInterrupt(database, childSessionid).catch((error: unknown) => {
        database.logger?.warn("agent.subsession.interrupt.complete_failed", { sessionid: childSessionid, error: String(error) });
      });
    }
  }
  return descendants;
}
