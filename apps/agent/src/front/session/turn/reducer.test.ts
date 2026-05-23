import assert from "node:assert/strict";
import test from "node:test";
import { NDX_TURN_EVENT, type NDXSessionEventMessage } from "ndx/agent/common/protocol";
import { applyTurnEvent } from "./reducer";

test("turn reducer restores file references and skills from durable tool results", () => {
  const input = event("turn.input.recorded", NDX_TURN_EVENT.InputRecorded, { text: "inspect files" });
  const results = event("turn.tool.result", NDX_TURN_EVENT.ToolResultRecorded, {
    kind: "tool_result",
    iteration: 1,
    results: [
      {
        toolCallId: "read-1",
        tool: "read_file",
        success: true,
        output: JSON.stringify({ path: "/project/src/a.ts", content: "alpha" })
      },
      {
        toolCallId: "skill-1",
        tool: "loadSkill",
        success: true,
        output: "<skill>\n<name>demo</name>\n<path>/project/.ndx/skills/demo/SKILL.md</path>\nUse demo.\n</skill>"
      }
    ]
  });

  const turn = [input, results].reduce(applyTurnEvent, []).at(-1);

  assert.deepEqual(turn?.sidebarItems.map((item) => ({
    group: item.group,
    key: item.key,
    title: item.title,
    body: item.body,
    kind: item.kind
  })), [
    {
      group: { id: "file-references", title: "파일참조" },
      key: "file-reference:/project/src/a.ts",
      title: "a.ts",
      body: "/project/src/a.ts",
      kind: "file_reference"
    },
    {
      group: { id: "skills", title: "스킬" },
      key: "skill:demo:/project/.ndx/skills/demo/SKILL.md",
      title: "demo",
      body: "/project/.ndx/skills/demo/SKILL.md",
      kind: "skill"
    }
  ]);
});

function event(dataid: string, name: NDXSessionEventMessage["event"], contents: NDXSessionEventMessage["contents"]): NDXSessionEventMessage {
  return {
    type: "session.event",
    sessionid: "session-1",
    event: name,
    dataid,
    contents,
    createdat: "2026-05-22T00:00:00.000Z"
  };
}
