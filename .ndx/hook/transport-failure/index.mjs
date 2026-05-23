import { emitEffect, readContext } from "./lib.mjs";

const context = await readContext();
const message = String(context.error?.message || context.error || "");

if (/Invalid type for 'input'|invalid_union|fetch failed|Responses input/i.test(message)) {
  emitEffect({
    type: "stopturn",
    finalAssistantText: [
      "모델 어댑터/전송 계층 오류로 턴을 중단했습니다.",
      "",
      `classification: model-transport-failed`,
      `error: ${message}`,
      "",
      "이 오류는 애플리케이션 구현 실패로 취급하면 안 됩니다. Responses 입력 직렬화와 provider fallback 경로를 먼저 점검해야 합니다."
    ].join("\n")
  });
} else {
  emitEffect({ type: "noeffect" });
}
