import type { NDXAskUserQuestionResponse } from "ndx/common/protocol";
import { encodeAttachments } from "ndx/webclient/front";
import type { AskUserQuestionDraft, AskUserQuestionRequest } from "./types";

export function initialAskUserQuestionDraft(request: AskUserQuestionRequest): AskUserQuestionDraft {
  return {
    attachments: {},
    selected: Object.fromEntries(request.request.questions.map((question) => [question.id, question.options?.[0]?.label ?? ""])),
    text: {}
  };
}

export async function askUserQuestionResponse(request: AskUserQuestionRequest, draft: AskUserQuestionDraft): Promise<NDXAskUserQuestionResponse> {
  return {
    kind: "askUserQuestion",
    answers: Object.fromEntries(await Promise.all(request.request.questions.map(async (question) => {
      const values: string[] = [];
      if (question.options?.length) {
        const selected = draft.selected[question.id];
        if (selected) values.push(selected);
        const note = draft.text[question.id]?.trim();
        if (note) values.push(`user_note: ${note}`);
      } else {
        const text = draft.text[question.id]?.trim();
        if (text) values.push(text);
      }
      const attachments = await encodeAttachments(draft.attachments[question.id] ?? []);
      return [question.id, { answers: values, ...(attachments.length ? { attachments } : {}) }];
    })))
  };
}
