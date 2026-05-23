import { NDX_COT_WORK_CONTENT_KIND, isNDXCotWorkContents, type NDXCotWorkContents } from "../../../../../common/protocol/index.js";
import type { NDXCotWorkAgentCallInput, NDXToolAgentCallContext, NDXToolAgentCallHandler } from "../types.js";

export const NDX_COT_WORK_AGENTCALL_NAME = "session.cot_work";

export function createCotWorkAgentCallHandler(send: (contents: NDXCotWorkContents, context: NDXToolAgentCallContext) => void | Promise<void>): NDXToolAgentCallHandler {
  return async (input, context) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("cot_work agent call input must be an object");
    }
    const record = input as NDXCotWorkAgentCallInput;
    const contents = {
      kind: NDX_COT_WORK_CONTENT_KIND,
      steps: record.steps,
      ...(typeof record.reason === "string" ? { reason: record.reason } : {})
    };
    if (!isNDXCotWorkContents(contents)) {
      throw new Error("cot_work agent call input is invalid");
    }
    await send(contents, context);
  };
}
