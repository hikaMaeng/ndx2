import { ImagePlus, Send, X } from "lucide-react";
import { RSC } from "./resource";
import type { AskUserQuestionDraft, AskUserQuestionRequest } from "./types";

export function AskUserQuestionDialog({
  draft,
  request,
  t,
  onAddAttachments,
  onCancel,
  onRemoveAttachment,
  onSelectedChange,
  onSubmit,
  onTextChange
}: {
  draft: AskUserQuestionDraft;
  request: AskUserQuestionRequest;
  t: Record<string, string>;
  onAddAttachments: (questionId: string, files: File[]) => void;
  onCancel: () => void;
  onRemoveAttachment: (questionId: string, attachmentId: string) => void;
  onSelectedChange: (questionId: string, value: string) => void;
  onSubmit: () => void;
  onTextChange: (questionId: string, value: string) => void;
}) {
  const title = request.request.questions.length === 1
    ? text(t, RSC.SESSION_ASK_USER_QUESTION_DIALOG_TITLE_TEXT)
    : text(t, RSC.SESSION_ASK_USER_QUESTION_DIALOG_COUNT_TITLE_TEXT).replace("{count}", String(request.request.questions.length));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-3 py-4">
      <section role="dialog" aria-modal="true" className="grid max-h-[88dvh] w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl" aria-labelledby="ask-user-question-dialog-title">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2 id="ask-user-question-dialog-title" className="min-w-0 truncate text-sm font-semibold text-zinc-100">{title}</h2>
          <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label={text(t, RSC.SESSION_ASK_USER_QUESTION_CLOSE_BUTTON)} onClick={onCancel}>
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <form className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); onSubmit(); }} onPaste={(event) => {
          const activeQuestionId = (event.target as HTMLElement | null)?.closest("[data-question-id]")?.getAttribute("data-question-id");
          const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
          if (!activeQuestionId || files.length === 0) return;
          event.preventDefault();
          onAddAttachments(activeQuestionId, files);
        }}>
          <div className="min-h-0 overflow-y-auto px-4 py-3">
            {request.request.questions.map((question, index) => {
              const showQuestion = question.question.trim() !== question.header.trim();
              return (
                <section key={question.id} data-question-id={question.id} className={index === 0 ? "grid gap-3 pb-4" : "grid gap-3 border-t border-zinc-800 py-4"}>
                  <header className="grid gap-2">
                    <h3 className="ndx-wrap-anywhere whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-100">{question.header}</h3>
                    {showQuestion ? <p className="ndx-wrap-anywhere whitespace-pre-wrap text-sm leading-6 text-zinc-300">{question.question}</p> : null}
                  </header>
                  {question.options?.length ? (
                    <div className="grid gap-2" role="radiogroup" aria-label={question.header}>
                      {question.options.map((option) => (
                        <label key={option.label} className="grid min-w-0 cursor-pointer gap-1 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-600">
                          <span className="flex min-w-0 items-start gap-2">
                            <input type="radio" className="mt-1 shrink-0" name={question.id} checked={draft.selected[question.id] === option.label} onChange={() => onSelectedChange(question.id, option.label)} />
                            <span className="grid min-w-0 gap-1">
                              <span className="ndx-wrap-anywhere whitespace-pre-wrap font-medium leading-5">{option.label}</span>
                              <span className="ndx-wrap-anywhere whitespace-pre-wrap text-xs leading-5 text-zinc-500">{option.description}</span>
                            </span>
                          </span>
                        </label>
                      ))}
                      {question.isOther !== false ? (
                        <QuestionTextAndAttachments draft={draft} label={text(t, RSC.SESSION_ASK_USER_QUESTION_ADDITIONAL_ANSWER_INPUT_LABEL)} questionId={question.id} t={t} onAddAttachments={onAddAttachments} onRemoveAttachment={onRemoveAttachment} onTextChange={onTextChange} />
                      ) : null}
                    </div>
                  ) : (
                    question.isSecret ? (
                      <label className="grid gap-1 text-sm text-zinc-300">
                        {text(t, RSC.SESSION_ASK_USER_QUESTION_ANSWER_INPUT_LABEL)}
                        <input type="password" className="h-10 min-w-0 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-zinc-500" value={draft.text[question.id] ?? ""} onChange={(event) => onTextChange(question.id, event.currentTarget.value)} />
                      </label>
                    ) : (
                      <QuestionTextAndAttachments draft={draft} label={text(t, RSC.SESSION_ASK_USER_QUESTION_ANSWER_INPUT_LABEL)} questionId={question.id} t={t} onAddAttachments={onAddAttachments} onRemoveAttachment={onRemoveAttachment} onTextChange={onTextChange} />
                    )
                  )}
                </section>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm font-medium text-zinc-300 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" onClick={onCancel}>{text(t, RSC.SESSION_ASK_USER_QUESTION_CANCEL_BUTTON)}</button>
            <button type="submit" className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950">
              <Send aria-hidden="true" className="h-4 w-4" />
              {text(t, RSC.SESSION_ASK_USER_QUESTION_SUBMIT_BUTTON)}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function QuestionTextAndAttachments({
  draft,
  label,
  questionId,
  t,
  onAddAttachments,
  onRemoveAttachment,
  onTextChange
}: {
  draft: AskUserQuestionDraft;
  label: string;
  questionId: string;
  t: Record<string, string>;
  onAddAttachments: (questionId: string, files: File[]) => void;
  onRemoveAttachment: (questionId: string, attachmentId: string) => void;
  onTextChange: (questionId: string, value: string) => void;
}) {
  const inputId = `ask-user-question-attachment-${questionId}`;
  const attachments = draft.attachments[questionId] ?? [];
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm text-zinc-300">
        {label}
        <textarea className="min-h-24 resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500" value={draft.text[questionId] ?? ""} onChange={(event) => onTextChange(questionId, event.currentTarget.value)} />
      </label>
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={text(t, RSC.SESSION_ASK_USER_QUESTION_ATTACHMENT_LIST_LABEL)}>
          {attachments.map((attachment) => (
            <li key={attachment.id} className="relative h-20 w-20 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900">
              <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover" />
              <button type="button" className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-zinc-950/90 text-zinc-200 shadow hover:bg-zinc-800" aria-label={`${attachment.name} ${text(t, RSC.SESSION_ASK_USER_QUESTION_REMOVE_ATTACHMENT_BUTTON)}`} onClick={() => onRemoveAttachment(questionId, attachment.id)}>
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <input id={inputId} className="sr-only" type="file" accept="image/*" multiple onChange={(event) => {
          onAddAttachments(questionId, Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }} />
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-900" htmlFor={inputId}>
          <ImagePlus aria-hidden="true" className="h-4 w-4" />
          {text(t, RSC.SESSION_ASK_USER_QUESTION_ATTACH_IMAGE_BUTTON)}
        </label>
      </div>
    </div>
  );
}

function text(t: Record<string, string>, key: RSC): string {
  return t[key] ?? key;
}
