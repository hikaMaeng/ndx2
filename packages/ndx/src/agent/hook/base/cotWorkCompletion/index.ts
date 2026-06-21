import { isNDXCotWorkContents, NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { appendSessionData } from "../../../session/appendSessionData.js";
import { cotWorkCompletedSidebarItems } from "../../../tool/base/cot_work/sidebar.js";
import { completeCotWorkContents } from "../../../tool/base/cot_work/timing.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";

export const turnEndCotWorkCompletionHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.end.cot_work_completion",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    if (!context.input || !context.assistant) {
      return { type: "noeffect" };
    }

    const result = await context.database.query(
      `
SELECT contents
FROM sessiondata
WHERE sessionid = $1
  AND type = 'assistant'
  AND dataid > $2::bigint
  AND dataid < $3::bigint
  AND contents->>'kind' = 'cot_work'
ORDER BY dataid DESC
LIMIT 1;
`,
      [context.session.sessionid, String(context.input.dataid), String(context.assistant.dataid)]
    );
    const contents = result.rows[0]?.contents;
    if (!isNDXCotWorkContents(contents)) {
      return { type: "noeffect" };
    }
    const finalCotWork = completeCotWorkContents(contents);

    await appendSessionData(context.database, context.session.sessionid, "assistant", finalCotWork);
    if (context.emitTurnEvent && context.iteration !== undefined && context.contextUsage) {
      for (const item of cotWorkCompletedSidebarItems(finalCotWork)) {
        await context.emitTurnEvent({
          type: NDX_TURN_EVENT.SidebarItem,
          iteration: context.iteration,
          tool: "cot_work",
          item,
          contextUsage: context.contextUsage
        });
      }
      await context.emitTurnEvent({
        type: NDX_TURN_EVENT.CotWork,
        iteration: context.iteration,
        tool: "cot_work",
        contents: finalCotWork,
        contextUsage: context.contextUsage
      });
    }
    return { type: "noeffect" };
  }
};
