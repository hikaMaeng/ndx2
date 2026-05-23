import type { NDXToolRuntimeTurnContext } from "../../types.js";

export type NDXToolSystemArgHandlerInput = {
  sessionid?: string;
  turnContext: NDXToolRuntimeTurnContext;
};

export type NDXToolSystemArgHandler = (input: NDXToolSystemArgHandlerInput) => string | Promise<string>;
