import assert from "node:assert/strict";
import test from "node:test";
import {
  NDX_ACCOUNT_SELECT,
  NDX_PROJECT_CONFIGURE,
  NDX_SESSION_ATTACH,
  NDX_SESSION_BRANCH_CREATE,
  NDX_SESSION_CREATE,
  NDX_SESSION_DELETE,
  NDX_SESSION_HISTORY_SUMMARY,
  NDX_SESSION_ITERATION_DETAIL,
  NDX_SESSION_CLIENT_REQUEST_CLOSED,
  NDX_SESSION_CLIENT_RESPONSE,
  NDX_SESSION_RENAME,
  NDX_SESSION_SIDEBAR_ITEM,
  NDX_SESSION_SKILL_LIST,
  NDX_SESSION_TURN_DETAIL,
  NDX_SESSION_TURN_DELETE,
  NDX_SIDEBAR_ITEM,
  NDX_TURNCARD_ARTIFACT,
  NDX_TURNCARD_SKILL,
  formatNDXCotWorkElapsed,
  isNDXAccountSelectMessage,
  isNDXCotWorkContents,
  isNDXClientId,
  isNDXProjectConfigureMessage,
  isNDXSessionAttachMessage,
  isNDXSessionBranchCreateMessage,
  isNDXSessionCreateMessage,
  isNDXSessionDeleteMessage,
  isNDXSessionTurnDeleteMessage,
  isNDXSessionHistorySummaryMessage,
  isNDXSessionIterationDetailMessage,
  isNDXSessionClientResponseMessage,
  isNDXSessionRenameMessage,
  isNDXSessionSkillListMessage,
  isNDXSessionTurnDetailMessage,
  parseNDXSidebarItem,
  parseNDXTurnCardItem,
  type NDXSessionSidebarItemMessage
} from "./index.js";

test("client id accepts uuid values only", () => {
  assert.equal(isNDXClientId("018f90d0-75cb-7d37-bfc9-6f9d0bb60cf5"), true);
  assert.equal(isNDXClientId("not-a-uuid"), false);
});

test("cot work accepts elapsed timing fields in mm:ss format", () => {
  assert.equal(formatNDXCotWorkElapsed(65_400), "01:05");
  assert.equal(
    isNDXCotWorkContents({
      kind: "cot_work",
      steps: [{ task: "Run check", status: "completed", elapsed: "01:05", elapsedMs: 65_400 }],
      totalElapsed: "01:05",
      totalElapsedMs: 65_400,
      timingUpdatedAt: "2026-05-22T00:00:00.000Z"
    }),
    true
  );
  assert.equal(
    isNDXCotWorkContents({
      kind: "cot_work",
      steps: [{ task: "Run check", status: "completed", elapsed: "1:05", elapsedMs: 65_400 }],
      totalElapsed: "01:05"
    }),
    false
  );
});

test("session sidebar item socket messages carry only the routed session id", () => {
  const message: NDXSessionSidebarItemMessage = {
    type: NDX_SESSION_SIDEBAR_ITEM,
    sessionid: "session-a",
    tool: "loadSkill",
    createdat: "2026-06-05T00:00:00.000Z",
    item: {
      group: { id: "skills", title: "스킬" },
      key: "skill:demo",
      title: "demo",
      kind: "skill"
    }
  };

  assert.equal(message.sessionid, "session-a");
});

test("session client response validates askUserQuestion answers", () => {
  assert.equal(NDX_SESSION_CLIENT_REQUEST_CLOSED, "session.client.request.closed");
  assert.equal(
    isNDXSessionClientResponseMessage({
      type: NDX_SESSION_CLIENT_RESPONSE,
      requestId: "request-1",
      sessionid: "session-1",
      response: {
        kind: "askUserQuestion",
        answers: {
          confirm_path: {
            answers: ["Proceed (Recommended)", "user_note: keep it small"],
            attachments: [{ name: "note.png", mimeType: "image/png", size: 3, data: "AQID" }]
          }
        }
      }
    }),
    true
  );
  assert.equal(
    isNDXSessionClientResponseMessage({
      type: NDX_SESSION_CLIENT_RESPONSE,
      requestId: "request-1",
      sessionid: "session-1",
      response: {
        kind: "askUserQuestion",
        answers: {
          confirm_path: { answers: ["Proceed"], leaked: true }
        }
      }
    }),
    false
  );
});

test("account selection validates the account-select message shape", () => {
  assert.equal(isNDXAccountSelectMessage({ type: NDX_ACCOUNT_SELECT, userid: "ndx" }), true);
  assert.equal(isNDXAccountSelectMessage({ type: NDX_ACCOUNT_SELECT, userid: "" }), false);
  assert.equal(isNDXAccountSelectMessage({ type: "project.configure", userid: "ndx" }), false);
});

test("project negotiation requires a workspace project name", () => {
  assert.equal(
    isNDXProjectConfigureMessage({
      type: NDX_PROJECT_CONFIGURE,
      projectName: "project-1"
    }),
    true
  );
  assert.equal(
    isNDXProjectConfigureMessage({
      type: NDX_PROJECT_CONFIGURE,
      projectName: ""
    }),
    false
  );
});

test("session create accepts an optional model config", () => {
  assert.equal(isNDXSessionCreateMessage({ type: NDX_SESSION_CREATE }), true);
  assert.equal(
    isNDXSessionCreateMessage({
      type: NDX_SESSION_CREATE,
      userid: "ndev",
      projectName: "project-1"
    }),
    true
  );
  assert.equal(
    isNDXSessionCreateMessage({
      type: NDX_SESSION_CREATE,
      userid: "ndev",
      projectName: ""
    }),
    false
  );
  assert.equal(
    isNDXSessionCreateMessage({
      type: NDX_SESSION_CREATE,
      model: {
        type: "openai",
        model: "qwen3.6-35b.mm",
        url: "",
        token: "",
        contextsize: 100_000
      }
    }),
    true
  );
  assert.equal(
    isNDXSessionCreateMessage({
      type: NDX_SESSION_CREATE,
      userid: "ndev",
      projectName: "project-1",
      model: {
        type: "openai",
        model: "qwen3.6-35b.mm",
        url: "",
        token: "",
        contextsize: 100_000
      },
      initialInput: {
        text: "첫 요청"
      }
    }),
    true
  );
  assert.equal(
    isNDXSessionCreateMessage({
      type: NDX_SESSION_CREATE,
      userid: "ndev",
      projectName: "project-1",
      initialInput: {
        text: "",
        attachments: [{ name: "a.txt", mimeType: "text/plain", size: 1, data: "YQ==" }]
      }
    }),
    true
  );
  assert.equal(
    isNDXSessionCreateMessage({
      type: NDX_SESSION_CREATE,
      userid: "ndev",
      projectName: "project-1",
      initialInput: { text: "" }
    }),
    false
  );
  assert.equal(
    isNDXSessionCreateMessage({
      type: NDX_SESSION_CREATE,
      model: { type: "openai", model: "", url: "", token: "", contextsize: 100_000 }
    }),
    false
  );
});

test("session attach requires a project name and session id", () => {
  assert.equal(
    isNDXSessionAttachMessage({
      type: NDX_SESSION_ATTACH,
      userid: "ndev",
      projectName: "project-1",
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8"
    }),
    true
  );
});

test("session delete requires the owner, project identity, and session id", () => {
  assert.equal(
    isNDXSessionDeleteMessage({
      type: NDX_SESSION_DELETE,
      userid: "ndev",
      projectName: "project-1",
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8"
    }),
    true
  );
  assert.equal(
    isNDXSessionDeleteMessage({
      type: NDX_SESSION_DELETE,
      userid: "ndev",
      projectName: "",
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8"
    }),
    false
  );
});

test("session turn delete and branch create require session id and input data id", () => {
  assert.equal(
    isNDXSessionTurnDeleteMessage({
      type: NDX_SESSION_TURN_DELETE,
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8",
      inputDataId: "12"
    }),
    true
  );
  assert.equal(
    isNDXSessionTurnDeleteMessage({
      type: NDX_SESSION_TURN_DELETE,
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8",
      inputDataId: ""
    }),
    false
  );
  assert.equal(
    isNDXSessionBranchCreateMessage({
      type: NDX_SESSION_BRANCH_CREATE,
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8",
      inputDataId: "12"
    }),
    true
  );
  assert.equal(
    isNDXSessionBranchCreateMessage({
      type: NDX_SESSION_BRANCH_CREATE,
      sessionid: "",
      inputDataId: "12"
    }),
    false
  );
});

test("session rename requires session ownership fields and accepts an empty title", () => {
  assert.equal(
    isNDXSessionRenameMessage({
      type: NDX_SESSION_RENAME,
      userid: "ndev",
      projectName: "project-1",
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8",
      title: "새 제목"
    }),
    true
  );
  assert.equal(
    isNDXSessionRenameMessage({
      type: NDX_SESSION_RENAME,
      userid: "ndev",
      projectName: "project-1",
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8",
      title: ""
    }),
    true
  );
  assert.equal(
    isNDXSessionRenameMessage({
      type: NDX_SESSION_RENAME,
      userid: "ndev",
      projectName: "",
      sessionid: "019e2783-4512-70d0-b75b-40200d1d4fe8",
      title: "새 제목"
    }),
    false
  );
});

test("session staged history requests require session id and target ids", () => {
  assert.equal(isNDXSessionHistorySummaryMessage({ type: NDX_SESSION_HISTORY_SUMMARY, sessionid: "session-1" }), true);
  assert.equal(isNDXSessionHistorySummaryMessage({ type: NDX_SESSION_HISTORY_SUMMARY, sessionid: "" }), false);
  assert.equal(isNDXSessionTurnDetailMessage({ type: NDX_SESSION_TURN_DETAIL, sessionid: "session-1", inputDataId: "10" }), true);
  assert.equal(isNDXSessionTurnDetailMessage({ type: NDX_SESSION_TURN_DETAIL, sessionid: "session-1", inputDataId: "" }), false);
  assert.equal(
    isNDXSessionIterationDetailMessage({ type: NDX_SESSION_ITERATION_DETAIL, sessionid: "session-1", inputDataId: "10", iteration: 2 }),
    true
  );
  assert.equal(
    isNDXSessionIterationDetailMessage({ type: NDX_SESSION_ITERATION_DETAIL, sessionid: "session-1", inputDataId: "10", iteration: 0 }),
    false
  );
});

test("session skill list request accepts draft project target", () => {
  assert.equal(isNDXSessionSkillListMessage({ type: NDX_SESSION_SKILL_LIST }), true);
  assert.equal(isNDXSessionSkillListMessage({ type: NDX_SESSION_SKILL_LIST, sessionid: "session-1" }), true);
  assert.equal(isNDXSessionSkillListMessage({ type: NDX_SESSION_SKILL_LIST, projectName: "project-1" }), true);
  assert.equal(isNDXSessionSkillListMessage({ type: NDX_SESSION_SKILL_LIST, projectName: "" }), false);
});

test("turn card parser accepts skill progress payloads by marker prefix", () => {
  assert.deepEqual(
    parseNDXTurnCardItem(`${NDX_TURNCARD_SKILL} demo`, {
      turnCard: { type: "skill", name: "demo", path: "/project/.ndx/skills/demo/SKILL.md", source: "repo" }
    }),
    { type: "skill", name: "demo", path: "/project/.ndx/skills/demo/SKILL.md", source: "repo" }
  );
  assert.equal(parseNDXTurnCardItem("selecting skill", { turnCard: { type: "skill", name: "demo" } }), undefined);
});

test("turn card parser accepts artifact progress payloads by marker prefix", () => {
  assert.deepEqual(
    parseNDXTurnCardItem(`${NDX_TURNCARD_ARTIFACT} a.ts`, {
      turnCard: { type: "artifact", title: "a.ts", path: "/project/src/a.ts", artifactType: "file" }
    }),
    { type: "artifact", title: "a.ts", path: "/project/src/a.ts", artifactType: "file" }
  );
  assert.equal(parseNDXTurnCardItem(`${NDX_TURNCARD_ARTIFACT} missing`, { turnCard: { type: "artifact", title: "missing" } }), undefined);
});

test("sidebar item parser accepts one-level grouped sidebar payloads", () => {
  assert.deepEqual(
    parseNDXSidebarItem(`${NDX_SIDEBAR_ITEM} changed file`, {
      sidebarItem: {
        group: { id: "changed-files", title: "변경 파일" },
        subgroup: { id: "folder:/project/src", title: "src" },
        key: "changed-file:/project/src/a.ts",
        title: "a.ts",
        body: "/project/src/a.ts",
        kind: "edit"
      }
    }),
    {
      group: { id: "changed-files", title: "변경 파일" },
      subgroup: { id: "folder:/project/src", title: "src" },
      key: "changed-file:/project/src/a.ts",
      title: "a.ts",
      body: "/project/src/a.ts",
      kind: "edit"
    }
  );
  assert.equal(parseNDXSidebarItem("changed file", { sidebarItem: { group: "changed-files", title: "a.ts" } }), undefined);
});

test("sidebar item parser maps legacy turn card payloads to sidebar groups", () => {
  assert.deepEqual(
    parseNDXSidebarItem(`${NDX_TURNCARD_SKILL} demo`, {
      turnCard: { type: "skill", name: "demo", path: "/project/.ndx/skills/demo/SKILL.md", source: "repo" }
    }),
    {
      group: { id: "skills", title: "스킬" },
      key: "skill:demo:/project/.ndx/skills/demo/SKILL.md",
      title: "demo",
      body: "/project/.ndx/skills/demo/SKILL.md",
      kind: "skill"
    }
  );
});
