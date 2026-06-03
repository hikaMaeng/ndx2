import fs from "node:fs/promises";
import path from "node:path";
import { failedWithoutProcess } from "../../execute/process.js";
import type { NDXAskUserQuestionQuestion, NDXAskUserQuestionResponse } from "../../../../common/protocol/index.js";
import { NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "../../execute/agentcall/index.js";
import type { NDXToolExecutionOptions, NDXToolExecutionResult, NDXToolResultEffect } from "../../types.js";

export const NDX_ASK_USER_QUESTION_TOOL_NAME = "askUserQuestion";

export function askUserQuestionToolSchema(): Record<string, unknown> {
  return {
    type: "function",
    name: NDX_ASK_USER_QUESTION_TOOL_NAME,
    description: "Ask the connected user one to three short questions and wait for the response. Use this only when missing user information materially changes what you should do next.",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "Questions to show the user. Prefer one question and never ask more than three.",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Stable snake_case identifier for mapping answers."
              },
              header: {
                type: "string",
                description: "Short label shown in the dialog header."
              },
              question: {
                type: "string",
                description: "One clear question for the user."
              },
              inputType: {
                type: "string",
                enum: ["single_choice", "free_text", "secret"],
                description: "Use single_choice when options are mutually exclusive, free_text for open answers, and secret for credentials or sensitive values."
              },
              options: {
                type: "array",
                description: "Two to four mutually exclusive options for single_choice questions. Put the recommended option first and suffix its label with '(Recommended)'. The client also lets the user add a free-form note.",
                items: {
                  type: "object",
                  properties: {
                    label: {
                      type: "string",
                      description: "Short user-facing option label."
                    },
                    description: {
                      type: "string",
                      description: "One short sentence describing the tradeoff or effect."
                    }
                  },
                  required: ["label", "description"],
                  additionalProperties: false
                }
              }
            },
            required: ["id", "header", "question", "inputType"],
            additionalProperties: false
          }
        }
      },
      required: ["questions"],
      additionalProperties: false
    }
  };
}

export async function executeAskUserQuestionTool(
  args: Record<string, unknown>,
  callId: string | undefined,
  options: NDXToolExecutionOptions
): Promise<NDXToolExecutionResult> {
  const startedAtDate = new Date();
  await options.observer?.onToolStarted?.({ tool: NDX_ASK_USER_QUESTION_TOOL_NAME, callId, startedAt: startedAtDate.toISOString(), args });
  const questions = normalizeAskUserQuestionArgs(args);
  if (typeof questions === "string") {
    return failedWithoutProcess(NDX_ASK_USER_QUESTION_TOOL_NAME, callId, questions, "failed", startedAtDate);
  }
  if (!options.sessionClientBridge || !callId) {
    return failedWithoutProcess(NDX_ASK_USER_QUESTION_TOOL_NAME, callId, "askUserQuestion requires an active session client bridge and tool call id.", "failed", startedAtDate);
  }

  let interrupted = false;
  const onAbort = () => {
    interrupted = true;
    void Promise.resolve(options.observer?.onToolInterrupt?.({
      tool: NDX_ASK_USER_QUESTION_TOOL_NAME,
      callId,
      phase: "requested",
      status: "cancelled",
      signal: null,
      receivedAt: new Date().toISOString()
    })).catch(() => undefined);
  };
  if (options.signal?.aborted) {
    onAbort();
  } else {
    options.signal?.addEventListener("abort", onAbort, { once: true });
  }
  const response = await options.sessionClientBridge.requestUserQuestion({
    kind: "askUserQuestion",
    turnId: options.turnId ?? "",
    iteration: options.iteration ?? 1,
    toolCallId: callId,
    questions
  }, {
    signal: options.signal
  });
  options.signal?.removeEventListener("abort", onAbort);
  if (!response) {
    if (interrupted || options.signal?.aborted) {
      await options.observer?.onToolInterrupt?.({
        tool: NDX_ASK_USER_QUESTION_TOOL_NAME,
        callId,
        phase: "exited",
        status: "cancelled",
        signal: null,
        receivedAt: new Date().toISOString()
      });
    }
    return failedWithoutProcess(NDX_ASK_USER_QUESTION_TOOL_NAME, callId, "askUserQuestion was cancelled before receiving a response.", "cancelled", startedAtDate);
  }

  const effects: NDXToolResultEffect[] = [];
  const outputAnswers: Record<string, { answers: string[]; attachments?: Array<{ name: string; mimeType: string; size: number }> }> = {};
  const appendedAttachments: NonNullable<Extract<NDXToolResultEffect, { type: "append_user_message" }>["attachments"]> = [];
  for (const [questionId, answer] of Object.entries(response.answers)) {
    outputAnswers[questionId] = {
      answers: answer.answers,
      ...(answer.attachments?.length ? { attachments: answer.attachments.map((attachment) => ({ name: attachment.name, mimeType: attachment.mimeType, size: attachment.size })) } : {})
    };
    for (const [index, attachment] of (answer.attachments ?? []).entries()) {
      const root = options.userHome ?? options.projectHome ?? process.cwd();
      const directory = path.join(root, ".ndx", "runtime", "askUserQuestion", options.sessionid ?? "session", callId, questionId);
      await fs.mkdir(directory, { recursive: true });
      const safeName = `${index + 1}-${attachment.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "image"}`;
      const filePath = path.join(directory, safeName);
      await fs.writeFile(filePath, Buffer.from(attachment.data, "base64"));
      appendedAttachments.push({ kind: "image", path: filePath, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size });
    }
  }
  if (appendedAttachments.length > 0) {
    effects.push({
      type: "append_user_message",
      text: "User attached image(s) while answering askUserQuestion.",
      attachments: appendedAttachments
    });
    effects.push({ type: "inline_appended_user_message" });
  }
  const outputValue = { answers: outputAnswers };
  await options.agentCallHandlers?.[NDX_SIDEBAR_ITEM_AGENTCALL_NAME]?.({
    group: { id: "questions", title: "사용자 문답" },
    key: `ask-user-question:${callId ?? NDX_ASK_USER_QUESTION_TOOL_NAME}`,
    title: "문답 완료",
    body: `${Object.keys(outputAnswers).length}개 답변`,
    kind: "ask_user_question"
  }, { tool: NDX_ASK_USER_QUESTION_TOOL_NAME, callId, sessionid: options.sessionid });
  const output = JSON.stringify(outputValue);
  return {
    tool: NDX_ASK_USER_QUESTION_TOOL_NAME,
    callId,
    status: "success",
    success: true,
    output,
    outputValue,
    effects,
    events: [],
    stdoutText: "",
    stderrText: "",
    startedAt: startedAtDate.toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtDate.getTime()
  };
}

function normalizeAskUserQuestionArgs(args: Record<string, unknown>): NDXAskUserQuestionQuestion[] | string {
  if (!Array.isArray(args.questions) || args.questions.length < 1 || args.questions.length > 3) {
    return "askUserQuestion requires one to three questions.";
  }
  const seen = new Set<string>();
  const questions: NDXAskUserQuestionQuestion[] = [];
  for (const question of args.questions) {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      return "each askUserQuestion question must be an object.";
    }
    const next = question as { id?: unknown; header?: unknown; question?: unknown; inputType?: unknown; options?: unknown };
    if (typeof next.id !== "string" || !/^[a-z][a-z0-9_]*$/u.test(next.id) || seen.has(next.id)) {
      return "each askUserQuestion question needs a unique snake_case id.";
    }
    if (typeof next.header !== "string" || !next.header.trim() || typeof next.question !== "string" || !next.question.trim()) {
      return "each askUserQuestion question needs non-empty header and question strings.";
    }
    if (next.inputType !== "single_choice" && next.inputType !== "free_text" && next.inputType !== "secret") {
      return "each askUserQuestion question inputType must be single_choice, free_text, or secret.";
    }
    const options = Array.isArray(next.options)
      ? next.options.map((option) => option && typeof option === "object" && !Array.isArray(option)
        ? { label: String((option as { label?: unknown }).label ?? ""), description: String((option as { description?: unknown }).description ?? "") }
        : { label: "", description: "" })
      : undefined;
    if (next.inputType === "single_choice" && (!options || options.length < 2 || options.length > 4 || options.some((option) => !option.label.trim() || !option.description.trim()))) {
      return "single_choice askUserQuestion questions require two to four non-empty options.";
    }
    seen.add(next.id);
    questions.push({
      id: next.id,
      header: next.header.trim(),
      question: next.question.trim(),
      isOther: next.inputType !== "secret",
      isSecret: next.inputType === "secret",
      ...(options ? { options } : {})
    });
  }
  return questions;
}
