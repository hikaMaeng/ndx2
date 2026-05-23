import type { NDXCotWorkContents } from "../../../../common/protocol/index.js";

export type NDXToolAgentCallName = "session.cot_work";

export type NDXToolAgentCallEnvelope = {
  type: "ndx.agentcall";
  name: NDXToolAgentCallName;
  input: unknown;
};

export type NDXToolAgentCallContext = {
  tool: string;
  callId?: string;
  sessionid?: string;
};

export type NDXToolAgentCallHandler = (input: unknown, context: NDXToolAgentCallContext) => void | Promise<void>;

export type NDXToolAgentCallHandlers = Partial<Record<NDXToolAgentCallName, NDXToolAgentCallHandler>>;

export type NDXCotWorkAgentCallInput = Omit<NDXCotWorkContents, "kind">;
