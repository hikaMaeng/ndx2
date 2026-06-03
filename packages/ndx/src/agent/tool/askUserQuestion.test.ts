import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeToolCalls, listAvailableTools } from "./index.js";

test("askUserQuestion is exposed as a builtin function tool", async () => {
  const tools = await listAvailableTools();
  const tool = tools.find((item) => item.name === "askUserQuestion");
  assert.equal(tool?.runtime, "function");
  assert.equal(tool?.schema.name, "askUserQuestion");
});

test("askUserQuestion waits for the session client bridge and returns model tool output", async () => {
  const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-ask-user-question-"));
  const results = await executeToolCalls([
    {
      name: "askUserQuestion",
      call_id: "call-1",
      arguments: JSON.stringify({
        questions: [{
          id: "confirm_path",
          header: "Confirm",
          question: "Proceed with this path?",
          inputType: "single_choice",
          options: [
            { label: "Proceed (Recommended)", description: "Continue with the current approach." },
            { label: "Stop", description: "Do not continue with this approach." }
          ]
        }]
      })
    }
  ], {
    userHome,
    sessionid: "session-1",
    turnId: "turn-1",
    iteration: 2,
    sessionClientBridge: {
      async requestUserQuestion(request) {
        assert.equal(request.turnId, "turn-1");
        assert.equal(request.iteration, 2);
        assert.equal(request.toolCallId, "call-1");
        return {
          kind: "askUserQuestion",
          answers: {
            confirm_path: {
              answers: ["Proceed (Recommended)", "user_note: keep it small"],
              attachments: [{ name: "screen.png", mimeType: "image/png", size: 3, data: "AQID" }]
            }
          }
        };
      }
    }
  });

  assert.equal(results[0]?.success, true);
  assert.equal(results[0]?.output, JSON.stringify({
    answers: {
      confirm_path: {
        answers: ["Proceed (Recommended)", "user_note: keep it small"],
        attachments: [{ name: "screen.png", mimeType: "image/png", size: 3 }]
      }
    }
  }));
  const appendEffect = results[0]?.effects?.find((effect) => effect.type === "append_user_message");
  assert.equal(appendEffect?.type, "append_user_message");
  assert.equal(appendEffect.attachments?.[0]?.mimeType, "image/png");
  assert.deepEqual(await fs.readFile(appendEffect.attachments?.[0]?.path ?? ""), Buffer.from([1, 2, 3]));
  assert.ok(results[0]?.effects?.some((effect) => effect.type === "inline_appended_user_message"));
});

test("askUserQuestion cancels through the tool abort signal without blocking", async () => {
  const controller = new AbortController();
  const phases: string[] = [];
  const resultsPromise = executeToolCalls([
    {
      name: "askUserQuestion",
      call_id: "call-1",
      arguments: JSON.stringify({
        questions: [{
          id: "confirm_path",
          header: "Confirm",
          question: "Proceed?",
          inputType: "free_text"
        }]
      })
    }
  ], {
    sessionid: "session-1",
    signal: controller.signal,
    sessionClientBridge: {
      requestUserQuestion(_request, options) {
        return new Promise((resolve) => {
          if (options?.signal?.aborted) {
            resolve(undefined);
            return;
          }
          options?.signal?.addEventListener("abort", () => resolve(undefined), { once: true });
        });
      }
    },
    observer: {
      onToolInterrupt(event) {
        phases.push(event.phase);
      }
    }
  });

  controller.abort();
  const results = await resultsPromise;
  assert.equal(results[0]?.status, "cancelled");
  assert.deepEqual(phases, ["requested", "exited"]);
});
