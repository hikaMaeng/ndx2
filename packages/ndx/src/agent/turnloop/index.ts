import { handleUserRequest } from "./request/index.js";
import { getSession } from "../session/getSession.js";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionRow } from "../session/types.js";
import type { NDXTurnInput, NDXTurnLoopEvent, NDXTurnLoopEvents } from "./types.js";

export const NDX_COMPACT_CONTINUATION_REQUEST_TEXT = [
  "컨텍스트 compact로 직전 턴이 종료되었습니다.",
  "compact 뒤에 보존된 직전 턴의 직접 히스토리를 기준으로, 사용자 요청을 계속 수행하세요."
].join("\n");

export async function runAgentTurn(
  database: NDXDatabase,
  session: NDXSessionRow,
  request: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {}
): Promise<void> {
  await handleUserRequest(database, session, request, model, events);
}

export async function runAgentTurnWithCompactContinuation(
  database: NDXDatabase,
  session: NDXSessionRow,
  request: NDXTurnInput,
  model?: NDXModelConfig,
  events: NDXTurnLoopEvents = {},
  options: { maxContinuations?: number } = {}
): Promise<void> {
  let currentSession = session;
  let currentRequest = request;
  let currentModel = model;
  const maxContinuations = options.maxContinuations ?? 1;

  for (let turnIndex = 0; turnIndex <= maxContinuations; turnIndex += 1) {
    let compactEndedTurn = false;
    await runAgentTurn(database, currentSession, currentRequest, currentModel, {
      ...events,
      async onEvent(event: NDXTurnLoopEvent) {
        if (event.type === NDX_TURN_EVENT.CompactCompleted && event.report.phase === "iteration") {
          compactEndedTurn = true;
        }
        await events.onEvent?.(event);
      }
    });
    if (!compactEndedTurn || turnIndex >= maxContinuations) {
      return;
    }
    const nextSession = await getSession(database, currentSession.sessionid);
    if (!nextSession) {
      return;
    }
    currentSession = nextSession;
    currentRequest = { text: NDX_COMPACT_CONTINUATION_REQUEST_TEXT };
    currentModel = undefined;
  }
}

export { buildTurnMessages, buildTurnMessageParts, buildTurnMessagesFromParts } from "./base/context/index.js";
export { getRuntimeTurnPhase, requestRuntimeTurnInterrupt, turnInterruptPolicy } from "./base/interrupt/index.js";
export type { NDXTurnMessageParts } from "./base/context/index.js";
export type { NDXTurnInput, NDXTurnLoopEvents, NDXTurnLoopEvent } from "./types.js";
export type { NDXTurnInterruptAction, NDXTurnPhase } from "./base/interrupt/index.js";
