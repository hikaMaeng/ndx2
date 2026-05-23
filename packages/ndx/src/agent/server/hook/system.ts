import { systemHooks as responsePrepared } from "./turn.response.prepared/index.js";
import { systemHooks as turnContextPrepared } from "./turn.context.prepared/index.js";
import { systemHooks as modelResponding } from "./turn.model.responding/index.js";
import { systemHooks as turnRequestReceived } from "./turn.request.received/index.js";
import { systemHooks as toolCalled } from "./turn.tool.called/index.js";
import { systemHooks as toolResultsCollected } from "./turn.tool.results.collected/index.js";
import { NDX_TURN_EVENT } from "../../common/protocol/index.js";
import type { NDXHookPlan } from "./index.js";

export function systemNDXHookPlan(): NDXHookPlan {
  return {
    [NDX_TURN_EVENT.RequestReceived]: turnRequestReceived,
    [NDX_TURN_EVENT.ContextPrepared]: turnContextPrepared,
    [NDX_TURN_EVENT.ModelResponding]: modelResponding,
    [NDX_TURN_EVENT.ToolCalled]: toolCalled,
    [NDX_TURN_EVENT.ToolResultsCollected]: toolResultsCollected,
    [NDX_TURN_EVENT.ResponsePrepared]: responsePrepared
  };
}
