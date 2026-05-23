import { useState, type FormEvent } from "react";
import { ChevronDown, Paperclip, Send, Square, X } from "lucide-react";
import { Mention, MentionsInput } from "react-mentions-ts";
import { Button } from "../../components/ui/button";
import { ContextUsageRing } from "./ContextUsageRing";
import type { NDXAgentWebContextUsage } from "../../app/types";
import type { NDXSessionSkillSummary } from "ndx/agent/common/protocol";
import { RSC } from "../resource";

export function ChatComposer({
  agentRunning,
  interruptPending,
  requestPending,
  contextUsage,
  input,
  skills,
  modelLabel,
  notice,
  attachments,
  t,
  onInputChange,
  onAddAttachments,
  onRemoveAttachment,
  onModelClick,
  onSubmit
}: {
  agentRunning: boolean;
  interruptPending: boolean;
  requestPending: boolean;
  contextUsage?: NDXAgentWebContextUsage;
  input: string;
  skills: NDXSessionSkillSummary[];
  modelLabel: string;
  notice: string;
  attachments: Array<{ id: string; name: string; size: number; mimeType: string; previewUrl?: string }>;
  t: Record<string, string>;
  onInputChange: (value: string) => void;
  onAddAttachments: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onModelClick: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>();
  const submitDisabled = interruptPending || (!agentRunning && requestPending);
  const previewAttachment = attachments.find((attachment) => attachment.id === previewAttachmentId && attachment.previewUrl);
  const skillSuggestions = skills.map((skill) => ({
    id: encodeURIComponent(skill.name),
    display: skill.name,
    description: skill.description,
    scope: skill.scope
  }));
  const statusText = interruptPending
    ? t[RSC.SESSION_COMPOSER_INTERRUPT_PENDING_STATUS]
    : notice || (requestPending ? t[RSC.SESSION_COMPOSER_REQUEST_PENDING_STATUS] : agentRunning ? t[RSC.SESSION_COMPOSER_RUNNING_STATUS] : t[RSC.SESSION_COMPOSER_IDLE_STATUS]);
  return (
    <>
      <form
        className="shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur"
        aria-label={t[RSC.SESSION_COMPOSER_INPUT_LABEL]}
        onSubmit={onSubmit}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (files.length > 0) {
            event.preventDefault();
            onAddAttachments(files);
          }
        }}
      >
        <div className="mx-auto grid w-full max-w-4xl gap-2">
          <label className="sr-only" htmlFor="session-chat-input">
            {t[RSC.SESSION_COMPOSER_INPUT_LABEL]}
          </label>
          <MentionsInput
            id="session-chat-input"
            value={input}
            rows={3}
            classNames={{
              control: "min-h-24 rounded-lg border border-zinc-800 bg-zinc-900 focus-within:border-zinc-500",
              highlighter: "max-h-44 min-h-24 whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm leading-6",
              highlighterSubstring: "text-zinc-100",
              input: "max-h-44 min-h-24 resize-none rounded-lg px-4 py-3 text-sm leading-6 text-transparent caret-zinc-100 outline-none placeholder:text-zinc-600",
              suggestions: "z-50 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-xl",
              suggestionsList: "max-h-64 overflow-y-auto py-1",
              suggestionItem: "cursor-pointer px-3 py-2 text-sm text-zinc-200",
              suggestionItemFocused: "bg-zinc-800 text-white",
              suggestionDisplay: "font-medium",
              suggestionHighlight: "text-cyan-300"
            }}
            autoResize
            placeholder={t[RSC.SESSION_COMPOSER_INPUT_LABEL]}
            suggestionsPlacement="above"
            a11ySuggestionsListLabel="Skills"
            onMentionsChange={({ value }) => onInputChange(value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing || event.ctrlKey) return;
              event.preventDefault();
              if (!submitDisabled) {
                event.currentTarget.form?.requestSubmit();
              }
            }}
          >
            <Mention
              trigger="$"
              data={skillSuggestions}
              markup="[[NDX_SKILL___id__]]"
              displayTransform={(_id, display) => `$${display ?? ""}`}
              className="inline rounded-sm bg-cyan-500/20 !text-cyan-100 ring-1 ring-inset ring-cyan-400/35"
              appendSpaceOnAdd
              renderSuggestion={(entry, _search, highlightedDisplay) => (
                <div className="grid min-w-64 gap-1">
                  <span className="truncate">{highlightedDisplay}</span>
                  {"description" in entry && typeof entry.description === "string" && entry.description ? <span className="truncate text-xs text-zinc-500">{entry.description}</span> : null}
                </div>
              )}
            />
          </MentionsInput>
          {attachments.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="첨부 파일">
              {attachments.map((attachment) => (
                <li key={attachment.id} className={attachment.previewUrl ? "relative h-20 w-20 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900" : "flex max-w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"}>
                  {attachment.previewUrl ? (
                    <>
                      <button type="button" className="block h-full w-full" aria-label={`${attachment.name} 미리보기`} onClick={() => setPreviewAttachmentId(attachment.id)}>
                        <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover" />
                      </button>
                      <button type="button" className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-zinc-950/90 text-zinc-200 shadow hover:bg-zinc-800" aria-label={`${attachment.name} 제거`} onClick={() => onRemoveAttachment(attachment.id)}>
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="max-w-56 truncate">{attachment.name}</span>
                      <span className="shrink-0 text-zinc-500">{formatBytes(attachment.size)}</span>
                      <button type="button" className="grid h-5 w-5 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100" aria-label={`${attachment.name} 제거`} onClick={() => onRemoveAttachment(attachment.id)}>
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {!attachment.previewUrl ? null : <span className="sr-only">{formatBytes(attachment.size)}</span>}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex min-h-8 items-center gap-2 text-xs text-zinc-500">
            <span role="status" className="min-w-0 flex-1 truncate">
              {statusText}
            </span>
            <input
              id="session-attachment-input"
              className="sr-only"
              type="file"
              multiple
              onChange={(event) => {
                onAddAttachments(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <label className="inline-grid h-8 w-8 cursor-pointer place-items-center rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" htmlFor="session-attachment-input" aria-label="파일 첨부" title="파일 첨부">
              <Paperclip aria-hidden="true" className="h-4 w-4" />
            </label>
            <button type="button" className="inline-flex h-7 min-w-24 items-center justify-center gap-1 rounded-md px-2 text-zinc-300 hover:bg-zinc-900 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.SESSION_COMPOSER_MODEL_CHOOSE_BUTTON]} aria-haspopup="dialog" disabled={requestPending} onClick={onModelClick}>
              <span className="min-w-0 truncate">{modelLabel}</span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <ContextUsageRing usage={contextUsage} label={t[RSC.SESSION_CONTEXT_USAGE_LABEL]} title={t[RSC.SESSION_CONTEXT_USAGE_POPOVER_TITLE_TEXT]} t={t} />
            <Button
              type="submit"
              className={agentRunning ? "h-8 w-8 rounded-full bg-red-500 p-0 text-white hover:bg-red-400" : "h-8 w-8 rounded-full bg-zinc-100 p-0 text-zinc-950 hover:bg-white"}
              aria-label={agentRunning ? t[RSC.SESSION_COMPOSER_INTERRUPT_BUTTON] : t[RSC.SESSION_COMPOSER_SEND_BUTTON]}
              aria-busy={submitDisabled}
              disabled={submitDisabled}
              title={agentRunning ? t[RSC.SESSION_COMPOSER_INTERRUPT_BUTTON] : t[RSC.SESSION_COMPOSER_SEND_BUTTON]}
            >
              {agentRunning ? <Square aria-hidden="true" className="h-3.5 w-3.5 fill-current" /> : <Send aria-hidden="true" className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </form>
      {previewAttachment ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="presentation" onClick={() => setPreviewAttachmentId(undefined)}>
          <section role="dialog" aria-modal="true" aria-labelledby="attachment-preview-title" className="grid max-h-full w-full max-w-5xl gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="attachment-preview-title" className="min-w-0 truncate text-sm font-medium text-zinc-100">{previewAttachment.name}</h2>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" aria-label="이미지 미리보기 닫기" onClick={() => setPreviewAttachmentId(undefined)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-auto rounded-md bg-zinc-900">
              <img src={previewAttachment.previewUrl} alt={previewAttachment.name} className="mx-auto max-h-[75vh] max-w-full object-contain" />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 102.4) / 10} MB`;
  if (value >= 1024) return `${Math.round(value / 102.4) / 10} KB`;
  return `${value} B`;
}
