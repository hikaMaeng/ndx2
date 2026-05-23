export const NDX_TURN_EVENT = {
  InputRecorded: "turn.input.recorded",
  ContextReady: "turn.context.ready",
  RequestReceived: "turn.request.received",
  ContextPrepared: "turn.context.prepared",
  ModelRequest: "turn.model.request",
  ModelResponse: "turn.model.response",
  ModelResponding: "turn.model.responding",
  ModelResume: "turn.model.resume",
  AssistantDelta: "turn.assistant.delta",
  AssistantReasoning: "turn.assistant.reasoning",
  AssistantRecorded: "turn.assistant.recorded",
  ToolCalled: "turn.tool.called",
  ToolCallRecorded: "turn.tool.call",
  ToolBatchStarted: "turn.tool.batch",
  ToolProgress: "turn.tool.progress",
  CotWork: "turn.cot_work",
  ToolResultsCollected: "turn.tool.results.collected",
  ToolResultRecorded: "turn.tool.result",
  ResponsePrepared: "turn.response.prepared",
  Interrupted: "turn.interrupted",
  InterruptCompleted: "turn.interrupt.completed",
  Failed: "turn.failed",
  HookComplete: "turn.hook.complete",
  HookFailed: "turn.hook.failed"
} as const;

export type NDXTurnEventName = typeof NDX_TURN_EVENT[keyof typeof NDX_TURN_EVENT];
