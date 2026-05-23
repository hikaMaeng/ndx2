import { emitEffect, readContext, readState } from "./lib.mjs";

const context = await readContext();
const state = await readState(context);
const failure = state.toolFailure;

if (!failure?.lastSummary) {
  emitEffect({ type: "noeffect" });
  process.exit(0);
}

const summary = failure.lastSummary;
const diagnostic = [
  "PROJECT HOOK DIAGNOSTIC: Use this compact failure record instead of re-reading raw logs.",
  `failing command: ${summary.failingCommand}`,
  `root cause: ${summary.rootCause}`,
  `required next action: ${summary.requiredNextAction}`,
  `repeat count: ${failure.repeatCount}`,
  "evidence:",
  summary.evidence
].join("\n");

if ((failure.repeatCount || 0) >= 2) {
  emitEffect({
    type: "stopturn",
    finalAssistantText: [
      "동일한 도구 실패가 2회 반복되어 자동으로 진단 모드로 전환했습니다.",
      "",
      diagnostic,
      "",
      "추가 수정보다 먼저 실패 원인 재분류와 단일 수정 대상을 확정해야 합니다."
    ].join("\n")
  });
} else {
  emitEffect({
    type: "noeffect",
    appendMessages: [{ role: "system", content: diagnostic }]
  });
}
