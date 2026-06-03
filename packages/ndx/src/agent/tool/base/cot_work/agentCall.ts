import { NDX_COT_WORK_CONTENT_KIND, isNDXCotWorkContents, type NDXCotWorkContents } from "../../../../common/protocol/index.js";
import type { NDXToolAgentCallContext, NDXToolAgentCallHandler } from "../../execute/agentcall/types.js";

export const NDX_COT_WORK_AGENTCALL_NAME = "session.cot_work";

type NDXCotWorkAgentCallInput = Omit<NDXCotWorkContents, "kind">;

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
    if (!hasValidCotWorkState(contents)) {
      throw new Error("cot_work agent call input must have exactly one in_progress step unless every step is completed");
    }
    await send(contents, context);
  };
}

function hasValidCotWorkState(contents: NDXCotWorkContents): boolean {
  const inProgress = contents.steps.filter((step) => step.status === "in_progress").length;
  return inProgress === 1 || contents.steps.every((step) => step.status === "completed");
}
