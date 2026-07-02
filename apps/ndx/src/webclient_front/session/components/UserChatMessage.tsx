import React from "react";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, GitBranch, LoaderCircle, Trash2, X } from "lucide-react";
import type { ChatMessageAttachment } from "ndx/webclient/front";
import { MarkdownMessage } from "./MarkdownMessage";
import { Button } from "../../components/ui";

export function UserChatMessage({
  text,
  attachments,
  pending = false,
  pendingLabel = "",
  actionsDisabled = false,
  onBranch,
  onDelete
}: {
  text: string;
  attachments: ChatMessageAttachment[];
  pending?: boolean;
  pendingLabel?: string;
  actionsDisabled?: boolean;
  onBranch?: () => void;
  onDelete?: () => void;
}) {
  const imageAttachments = attachments.filter((attachment) => attachment.kind === "image" && attachment.url);
  const [previewIndex, setPreviewIndex] = React.useState<number>();
  const [copyStatus, setCopyStatus] = React.useState("");
  const previewAttachment = typeof previewIndex === "number" ? imageAttachments[previewIndex] : undefined;
  const currentPreviewIndex = previewIndex ?? 0;

  React.useEffect(() => {
    if (!previewAttachment) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewIndex(undefined);
      }
      if (imageAttachments.length > 1 && event.key === "ArrowLeft") {
        setPreviewIndex((current) => typeof current === "number" ? (current + imageAttachments.length - 1) % imageAttachments.length : current);
      }
      if (imageAttachments.length > 1 && event.key === "ArrowRight") {
        setPreviewIndex((current) => typeof current === "number" ? (current + 1) % imageAttachments.length : current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageAttachments.length, previewAttachment]);

  return (
    <>
      <div className="grid gap-3" data-testid="user-chat-message">
        <div className="min-w-0">
          {pending && pendingLabel ? (
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-600">
              <LoaderCircle aria-label={pendingLabel} className="h-3.5 w-3.5 animate-spin" />
              <span>{pendingLabel}</span>
            </div>
          ) : null}
          {text ? pending ? <p className="ndx-wrap-anywhere whitespace-pre-wrap text-zinc-700">{text}</p> : <MarkdownMessage text={text} tone="user" /> : null}
        </div>
        {attachments.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="첨부 이미지와 파일">
            {attachments.map((attachment) => (
              <li key={`${attachment.path}:${attachment.index}`} className="min-w-0" data-testid="user-message-attachment">
                {attachment.kind === "image" && attachment.url ? (
                  <Button type="button" size={null} className="group block h-24 w-24 overflow-hidden rounded-md border border-zinc-300 bg-zinc-200 p-0" aria-label={`${attachment.name} 이미지 미리보기`} onClick={() => setPreviewIndex(imageAttachments.findIndex((image) => image.path === attachment.path && image.index === attachment.index))}>
                    <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  </Button>
                ) : (
                  <div className="max-w-64 rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                    <p className="truncate font-medium">{attachment.name}</p>
                    <p className="truncate text-zinc-500">{attachment.mimeType}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {text && !pending ? (
          <div className="flex justify-end gap-1.5 border-t border-zinc-300/70 pt-2">
            {onBranch ? (
              <Button
                type="button"
                size={null}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-md p-0 text-zinc-700 transition hover:bg-zinc-200 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="이 사용자 요청까지 세션 분기 생성"
                title="세션 분기"
                disabled={actionsDisabled}
                onClick={onBranch}
              >
                <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button
              type="button"
              size={null}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md p-0 text-zinc-700 transition hover:bg-zinc-200 hover:text-zinc-950"
              aria-label="사용자 메시지 텍스트 복사"
              title={copyStatus || "텍스트 복사"}
              onClick={() => {
                void navigator.clipboard.writeText(text).then(() => {
                  setCopyStatus("복사됨");
                  window.setTimeout(() => setCopyStatus(""), 1200);
                });
              }}
            >
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
            {onDelete ? (
              <Button
                type="button"
                size={null}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-md p-0 text-zinc-700 transition hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="이 사용자 요청의 턴 삭제"
                title="턴 삭제"
                disabled={actionsDisabled}
                onClick={onDelete}
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {previewAttachment?.url ? (
        <div className="fixed inset-0 z-50 bg-black/90 p-2 sm:p-3" role="presentation" onClick={() => setPreviewIndex(undefined)}>
          <section role="dialog" aria-modal="true" aria-label={previewAttachment.name} className="relative grid h-full w-full place-items-center">
            <img src={previewAttachment.url} alt={previewAttachment.name} className="max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[calc(100dvh-1.5rem)] sm:max-w-[calc(100vw-1.5rem)]" onClick={(event) => event.stopPropagation()} />
            <div className="absolute right-2 top-2 flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
              <Button type="button" className="grid h-9 w-9 place-items-center rounded-md bg-zinc-950/85 text-zinc-200 shadow-lg hover:bg-zinc-800" aria-label="이미지 미리보기 닫기" title="닫기" onClick={() => setPreviewIndex(undefined)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
              <Button type="button" className="grid h-9 w-9 place-items-center rounded-md bg-zinc-950/85 text-zinc-200 shadow-lg hover:bg-zinc-800" aria-label="이미지 주소 복사" title="이미지 주소 복사" onClick={() => void navigator.clipboard.writeText(previewAttachment.url ?? "")}>
                <Copy aria-hidden="true" className="h-4 w-4" />
              </Button>
              <a className="grid h-9 w-9 place-items-center rounded-md bg-zinc-950/85 text-zinc-200 shadow-lg hover:bg-zinc-800" aria-label="새 탭에서 이미지 열기" title="새 탭에서 열기" href={previewAttachment.url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
            {imageAttachments.length > 1 ? (
              <>
                <Button type="button" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-zinc-950/80 text-zinc-100 shadow-lg hover:bg-zinc-800" aria-label="이전 이미지" onClick={(event) => { event.stopPropagation(); setPreviewIndex((currentPreviewIndex + imageAttachments.length - 1) % imageAttachments.length); }}>
                  <ChevronLeft aria-hidden="true" className="h-6 w-6" />
                </Button>
                <Button type="button" className="absolute right-14 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-zinc-950/80 text-zinc-100 shadow-lg hover:bg-zinc-800 sm:right-16" aria-label="다음 이미지" onClick={(event) => { event.stopPropagation(); setPreviewIndex((currentPreviewIndex + 1) % imageAttachments.length); }}>
                  <ChevronRight aria-hidden="true" className="h-6 w-6" />
                </Button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
