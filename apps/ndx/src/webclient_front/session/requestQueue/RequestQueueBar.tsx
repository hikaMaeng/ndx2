import React from "react";
import { ChevronDown, ChevronUp, Paperclip, Pencil, Trash2, X } from "lucide-react";
import type { NDXSessionInputAttachment, NDXSessionModelConfig, NDXSessionRequestQueueItem } from "ndx/common/protocol";
import { browserRandomId, encodeAttachments, listWebProviderModels, listWebProviders, modelAttachmentInputAccept, modelSupportsAttachmentMimeType, normalizeReasoningEffort, type ProviderBundle } from "ndx/webclient/front";
import { Button, Input, Select, Textarea } from "../../components/ui";

type RequestQueueBarProps = {
  collapsed: boolean;
  items: NDXSessionRequestQueueItem[];
  onCollapsedChange: (collapsed: boolean) => void;
  onDelete: (itemid: string) => void;
  onUpdate: (itemid: string, text: string, model: NDXSessionModelConfig, keepAttachmentIds: string[], attachments: NDXSessionInputAttachment[]) => void;
};

type NewAttachmentDraft = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
};

export function RequestQueueBar({ collapsed, items, onCollapsedChange, onDelete, onUpdate }: RequestQueueBarProps) {
  const [editing, setEditing] = React.useState<NDXSessionRequestQueueItem>();
  const [draft, setDraft] = React.useState("");
  const [draftModel, setDraftModel] = React.useState<NDXSessionModelConfig>();
  const [keepAttachmentIds, setKeepAttachmentIds] = React.useState<string[]>([]);
  const [newAttachments, setNewAttachments] = React.useState<NewAttachmentDraft[]>([]);
  const [providerBundles, setProviderBundles] = React.useState<ProviderBundle[]>([]);
  const [status, setStatus] = React.useState("");

  const openEditor = (item: NDXSessionRequestQueueItem) => {
    clearNewAttachmentPreviews(newAttachments);
    setEditing(item);
    setDraft(item.text);
    setDraftModel(item.model);
    setKeepAttachmentIds((item.attachments ?? []).map((attachment) => attachment.attachmentid));
    setNewAttachments([]);
    setStatus("");
    void loadProviderBundles().then(setProviderBundles).catch(() => setStatus("모델 목록을 불러오지 못했습니다."));
  };

  const closeEditor = () => {
    clearNewAttachmentPreviews(newAttachments);
    setEditing(undefined);
    setNewAttachments([]);
    setStatus("");
  };

  const applyModel = (model: NDXSessionModelConfig) => {
    const keptBefore = keepAttachmentIds.length;
    const nextKeepAttachmentIds = keepAttachmentIds.filter((attachmentid) => {
      const attachment = editing?.attachments?.find((item) => item.attachmentid === attachmentid);
      return attachment ? modelSupportsAttachmentMimeType(model.modalities, attachment.mimeType) : false;
    });
    const nextNewAttachments = newAttachments.filter((attachment) => modelSupportsAttachmentMimeType(model.modalities, attachment.mimeType));
    for (const removed of newAttachments.filter((attachment) => !nextNewAttachments.some((next) => next.id === attachment.id))) {
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    }
    setDraftModel(model);
    setKeepAttachmentIds(nextKeepAttachmentIds);
    setNewAttachments(nextNewAttachments);
    setStatus(nextKeepAttachmentIds.length !== keptBefore || nextNewAttachments.length !== newAttachments.length ? "선택한 모델이 지원하지 않는 첨부를 제거했습니다." : "");
  };

  if (items.length === 0) return null;
  const selectedModelKey = draftModel ? modelSelectKey(draftModel) : "";
  const keptAttachments = editing?.attachments?.filter((attachment) => keepAttachmentIds.includes(attachment.attachmentid)) ?? [];
  const saveDisabled = !editing || !draftModel || (!draft.trim() && keptAttachments.length === 0 && newAttachments.length === 0);

  return (
    <>
      <section className="shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-4 py-2" aria-label="요청 큐">
        <div className="mx-auto grid w-full max-w-4xl gap-2">
          <Button
            type="button"
            className="flex min-h-9 w-full items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-left text-sm text-zinc-100 hover:border-zinc-700"
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            <span className="min-w-0 truncate">요청 큐 {items.length}개</span>
            {collapsed ? <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />}
          </Button>
          {!collapsed ? (
            <ol className="grid gap-2">
              {items.map((item, index) => (
                <li key={item.itemid} className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 shrink-0 text-xs text-zinc-500">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="ndx-wrap-anywhere whitespace-pre-wrap leading-5">{item.text || "첨부 요청"}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">모델 {item.model.provider ? `${item.model.provider} / ` : ""}{item.model.model}</p>
                    </div>
                    <Button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="요청 큐 항목 수정" onClick={() => openEditor(item)}>
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <Button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-red-200" aria-label="요청 큐 항목 삭제" onClick={() => onDelete(item.itemid)}>
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                  {item.attachments?.length ? (
                    <p className="pl-6 text-xs text-zinc-500">첨부 {item.attachments.length}개</p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>
      {editing && draftModel ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="presentation" onClick={closeEditor}>
          <section role="dialog" aria-modal="true" aria-labelledby="request-queue-edit-title" className="grid max-h-[calc(100dvh-2rem)] w-full max-w-2xl gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="request-queue-edit-title" className="text-sm font-semibold text-zinc-100">요청 큐 항목 수정</h2>
              <Button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" aria-label="수정 닫기" onClick={closeEditor}>
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
            <label className="grid gap-1 text-xs font-medium text-zinc-400">
              <span>요청 본문</span>
              <Textarea className="min-h-40 resize-y rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus:border-zinc-600" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
            </label>
            <label className="grid gap-1 text-xs font-medium text-zinc-400">
              <span>실행 모델</span>
              <Select className="h-9 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-zinc-600" value={selectedModelKey} onChange={(event) => {
                const model = providerBundles.flatMap((bundle) => bundle.models.map((item) => modelConfigFromProviderModel(bundle, item.model))).find((item) => modelSelectKey(item) === event.currentTarget.value);
                if (model) applyModel(model);
              }}>
                <option value={selectedModelKey}>{draftModel.provider ? `${draftModel.provider} / ` : ""}{draftModel.model}</option>
                {providerBundles.flatMap((bundle) => bundle.models.map((model) => {
                  const config = modelConfigFromProviderModel(bundle, model.model);
                  return <option key={modelSelectKey(config)} value={modelSelectKey(config)}>{bundle.provider.title} / {model.model}</option>;
                }))}
              </Select>
            </label>
            <section className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium text-zinc-400">첨부</h3>
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-zinc-800 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-900">
                  <Paperclip aria-hidden="true" className="h-4 w-4" />
                  추가
                  <Input className="sr-only" type="file" multiple accept={modelAttachmentInputAccept(draftModel.modalities)} onChange={(event) => {
                    addNewAttachments(Array.from(event.currentTarget.files ?? []), draftModel, newAttachments, setNewAttachments, setStatus);
                    event.currentTarget.value = "";
                  }} />
                </label>
              </div>
              {[...keptAttachments.map((attachment) => ({ id: attachment.attachmentid, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, existing: true })), ...newAttachments.map((attachment) => ({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, existing: false }))].length ? (
                <ul className="grid gap-2">
                  {[...keptAttachments.map((attachment) => ({ id: attachment.attachmentid, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, existing: true })), ...newAttachments.map((attachment) => ({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, existing: false }))].map((attachment) => (
                    <li key={`${attachment.existing ? "existing" : "new"}:${attachment.id}`} className="flex min-h-9 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-300">
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                      <span className="shrink-0 text-zinc-500">{formatBytes(attachment.size)}</span>
                      <Button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-red-200" aria-label={`${attachment.name} 제거`} onClick={() => {
                        if (attachment.existing) {
                          setKeepAttachmentIds((current) => current.filter((id) => id !== attachment.id));
                        } else {
                          setNewAttachments((current) => {
                            const removed = current.find((item) => item.id === attachment.id);
                            if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
                            return current.filter((item) => item.id !== attachment.id);
                          });
                        }
                      }}>
                        <X aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-500">첨부 없음</p>
              )}
            </section>
            {status ? <p className="text-xs text-zinc-400">{status}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-900" onClick={closeEditor}>취소</Button>
              <Button type="button" className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-100 px-3 text-sm font-medium text-zinc-950 hover:bg-white disabled:pointer-events-none disabled:opacity-50" disabled={saveDisabled} onClick={() => {
                void encodeAttachments(newAttachments).then((encoded) => {
                  onUpdate(editing.itemid, draft.trim(), draftModel, keepAttachmentIds, encoded);
                  closeEditor();
                }).catch((error) => setStatus(error instanceof Error && error.message ? error.message : "첨부를 읽지 못했습니다."));
              }}>저장</Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

async function loadProviderBundles(): Promise<ProviderBundle[]> {
  const providers = await listWebProviders();
  const bundles: ProviderBundle[] = [];
  for (const provider of providers) {
    bundles.push({ provider, models: await listWebProviderModels(provider.title) });
  }
  return bundles;
}

function modelConfigFromProviderModel(bundle: ProviderBundle, modelName: string): NDXSessionModelConfig {
  const model = bundle.models.find((item) => item.model === modelName)!;
  return {
    type: "openai",
    provider: bundle.provider.title,
    model: model.model,
    url: bundle.provider.url,
    token: bundle.provider.token ?? "",
    contextsize: model.contextsize,
    modalities: model.modalities ?? ["text"],
    reasoningEffort: normalizeReasoningEffort(model.reasoningEffort),
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
    ...(typeof model.topP === "number" ? { topP: model.topP } : {}),
    ...(typeof model.topK === "number" ? { topK: model.topK } : {}),
    ...(typeof model.minP === "number" ? { minP: model.minP } : {})
  };
}

function addNewAttachments(
  files: File[],
  model: NDXSessionModelConfig,
  current: NewAttachmentDraft[],
  setNewAttachments: React.Dispatch<React.SetStateAction<NewAttachmentDraft[]>>,
  setStatus: React.Dispatch<React.SetStateAction<string>>
) {
  if (files.length === 0) return;
  const accepted = files.filter((file) => modelSupportsAttachmentMimeType(model.modalities, file.type || "application/octet-stream")).slice(0, Math.max(0, 8 - current.length));
  setNewAttachments((attachments) => [
    ...attachments,
    ...accepted.map((file) => ({
      id: browserRandomId(),
      file,
      name: file.name || "attachment",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      previewUrl: (file.type || "").toLowerCase().startsWith("image/") ? URL.createObjectURL(file) : undefined
    }))
  ]);
  setStatus(accepted.length !== files.length ? "선택한 모델이 지원하지 않는 첨부를 제외했습니다." : "");
}

function clearNewAttachmentPreviews(attachments: NewAttachmentDraft[]) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }
}

function modelSelectKey(model: NDXSessionModelConfig): string {
  return `${model.provider ?? ""}\u0000${model.url}\u0000${model.model}`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round(size / 1024 / 1024)} MB`;
}
