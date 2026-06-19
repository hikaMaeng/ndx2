export type NDXToolAgentCallName = string;

export type NDXToolAgentCallEnvelope = {
  type: "ndx.agentcall";
  name: NDXToolAgentCallName;
  input: unknown;
};

export type NDXToolAgentCallContext = {
  tool: string;
  callId?: string;
  sessionid?: string;
  toolCallIndex?: number;
};

export type NDXToolAgentCallHandler = (input: unknown, context: NDXToolAgentCallContext) => void | Promise<void>;

export type NDXToolAgentCallHandlers = Partial<Record<NDXToolAgentCallName, NDXToolAgentCallHandler>>;
