import React from "react";
import { ChevronDown, CircleAlert, Pencil, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import type { NDXAgentWebModel } from "ndx/webclient/common";
import { createWebProvider, createWebProviderModel, deleteWebProvider, deleteWebProviderModel, listWebProviderModels, listWebProviders, normalizeModalities, normalizeReasoningEffort, optionalNullableNumber, optionalNumber, optionalNumberText, readProviderModelNames, syncWebProviderModels, toggleModality, updateWebProviderModel, type ProviderBundle, type SelectedModelConfig, type SessionUiState } from "ndx/webclient/front";
import { AssistantChatMessage } from "../../session/components/AssistantChatMessage";
import { Button, Input, Textarea } from "../../components/ui";

type ChatSurfaceProps = {
  title: string;
  draft: boolean;
  ui: SessionUiState;
  selectedModel: SelectedModelConfig;
  requestPending: boolean;
  menuLabel: string;
  onOpenMenu: () => void;
  onInputChange: (value: string) => void;
  onModelChange: (model: SelectedModelConfig) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function ChatSurface({
  title,
  draft,
  ui,
  selectedModel,
  requestPending,
  menuLabel,
  onOpenMenu,
  onInputChange,
  onModelChange,
  onSubmit
}: ChatSurfaceProps) {
  const [modelDialogOpen, setModelDialogOpen] = React.useState(false);
  const modelLabel = selectedModel.model.trim() || "모델 선택";

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Button type="button" className="fixed left-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/95 p-0 text-sm font-medium text-zinc-300 shadow-lg shadow-black/30 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 md:hidden" aria-label={menuLabel} onClick={onOpenMenu}>
          <span aria-hidden="true" className="h-4 w-4">☰</span>
        </Button>
        <main className="relative min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <section className="mx-auto flex min-h-full w-full max-w-4xl min-w-0 flex-col justify-end gap-5">
            <div className="grid gap-2 text-center">
              <h1 className="text-2xl font-semibold text-zinc-50">{title}</h1>
              {draft ? <p className="text-sm leading-6 text-zinc-500">첫 메시지를 보내기 전까지 채팅 세션은 생성되지 않습니다.</p> : null}
            </div>
            <ol className="grid min-w-0 gap-4" aria-label="채팅 메시지">
              {ui.chatMessages.map((message) => (
                <li key={message.id} className={message.role === "user" ? "ndx-wrap-anywhere max-w-[85%] min-w-0 overflow-hidden justify-self-end rounded-lg bg-zinc-100 px-4 py-3 text-sm leading-6 text-zinc-950" : "ndx-wrap-anywhere max-w-[92%] min-w-0 overflow-hidden justify-self-start rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-300"}>
                  {message.role === "assistant"
                    ? <AssistantChatMessage text={message.text} copyEnabled={!message.id.startsWith("pending-") && !message.id.startsWith("stream:") && message.text.trim().length > 0} />
                    : <div className="whitespace-pre-wrap break-words">{message.text}</div>}
                </li>
              ))}
            </ol>
          </section>
        </main>
        {ui.sessionError ? <section role="alert" className="shrink-0 border-t border-red-950/70 bg-red-950/35 px-4 py-3 text-sm text-red-100">{ui.sessionError}</section> : null}
        <form className="shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur" aria-label="채팅 입력" onSubmit={onSubmit}>
          <div className="mx-auto grid w-full max-w-4xl gap-2">
            <label className="sr-only" htmlFor="chat-only-input">채팅 입력</label>
            <Textarea id="chat-only-input" className="max-h-44 min-h-24 resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500" placeholder="메시지를 입력하세요" value={ui.chatInput} onChange={(event) => onInputChange(event.target.value)} onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }} />
            <div className="flex min-h-8 items-center gap-2 text-xs text-zinc-500">
              <span role="status" className="min-w-0 flex-1 truncate">{ui.notice || (requestPending ? "응답 수신 중..." : "대기 중")}</span>
              <Button type="button" className="inline-flex h-7 min-w-24 items-center justify-center gap-1 rounded-md px-2 text-zinc-300 hover:bg-zinc-900 disabled:pointer-events-none disabled:opacity-50" aria-label="모델 선택" aria-haspopup="dialog" disabled={requestPending} onClick={() => setModelDialogOpen(true)}>
                <span className="min-w-0 truncate">{modelLabel}</span>
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
              <Button type="submit" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 p-0 text-sm font-medium text-zinc-950 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="보내기" disabled={requestPending}>
                <Send aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </form>
      </div>
      {modelDialogOpen ? <ChatModelDialog selectedModel={selectedModel} onClose={() => setModelDialogOpen(false)} onSelect={(model) => { onModelChange(model); setModelDialogOpen(false); }} /> : null}
    </>
  );
}

function ChatModelDialog({ selectedModel, onClose, onSelect }: {
  selectedModel: SelectedModelConfig;
  onClose: () => void;
  onSelect: (model: SelectedModelConfig) => void;
}) {
  const dialogIdPrefix = React.useId();
  const [bundles, setBundles] = React.useState<ProviderBundle[]>([]);
  const [error, setError] = React.useState("");
  const [providerFormOpen, setProviderFormOpen] = React.useState(false);
  const [providerTitle, setProviderTitle] = React.useState("");
  const [providerUrl, setProviderUrl] = React.useState("");
  const [providerToken, setProviderToken] = React.useState("");
  const [modelProvider, setModelProvider] = React.useState<string>();
  const [modelName, setModelName] = React.useState("");
  const [contextsize, setContextsize] = React.useState("100000");
  const [modelModalities, setModelModalities] = React.useState<Array<"text" | "image" | "file">>(["text"]);
  const [modelTemperature, setModelTemperature] = React.useState("");
  const [modelTopP, setModelTopP] = React.useState("");
  const [modelTopK, setModelTopK] = React.useState("");
  const [modelMinP, setModelMinP] = React.useState("");
  const [editTarget, setEditTarget] = React.useState<{
    provider: string;
    model: string;
    contextsize: string;
    modalities: Array<"text" | "image" | "file">;
    temperature: string;
    topP: string;
    topK: string;
    minP: string;
  } | null>(null);
  const [pendingActions, setPendingActions] = React.useState<Set<string>>(() => new Set());
  const [syncingProviders, setSyncingProviders] = React.useState<Set<string>>(() => new Set());
  const [syncErrorProviders, setSyncErrorProviders] = React.useState<Set<string>>(() => new Set());
  const pendingActionsRef = React.useRef<Set<string>>(new Set());

  const startAction = (key: string) => {
    if (pendingActionsRef.current.has(key)) return false;
    const next = new Set(pendingActionsRef.current).add(key);
    pendingActionsRef.current = next;
    setPendingActions(next);
    return true;
  };

  const finishAction = (key: string) => {
    if (!pendingActionsRef.current.has(key)) return;
    const next = new Set(pendingActionsRef.current);
    next.delete(key);
    pendingActionsRef.current = next;
    setPendingActions(next);
  };

  const dialogLocked = pendingActions.size > 0;

  const refreshBundles = async () => {
    const providers = await listWebProviders();
    const nextBundles: ProviderBundle[] = [];
    for (const provider of providers) {
      nextBundles.push({ provider, models: await listWebProviderModels(provider.title) });
    }
    setBundles(nextBundles);
    return nextBundles;
  };

  React.useEffect(() => {
    let cancelled = false;
    void refreshBundles().catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "모델 목록을 불러오지 못했습니다.");
    });
    return () => { cancelled = true; };
  }, []);

  const syncProviderFromBrowser = async (provider: { title: string; url: string; token: string }) => {
    const names = await readProviderModelNames(provider);
    const existing = new Set((await listWebProviderModels(provider.title)).map((model) => model.model));
    for (const model of names) {
      if (!existing.has(model)) {
        await createWebProviderModel(provider.title, { model, contextsize: 100_000, modalities: ["text"] });
      }
    }
  };

  const selectModel = (provider: ProviderBundle["provider"], model: NDXAgentWebModel) => {
    onSelect({
      provider: provider.title,
      model: model.model,
      contextsize: model.contextsize,
      url: provider.url,
      token: provider.token,
      modalities: model.modalities ?? ["text"],
      reasoningEffort: normalizeReasoningEffort(selectedModel.reasoningEffort ?? model.reasoningEffort),
      ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
      ...(typeof model.topP === "number" ? { topP: model.topP } : {}),
      ...(typeof model.topK === "number" ? { topK: model.topK } : {}),
      ...(typeof model.minP === "number" ? { minP: model.minP } : {})
    });
  };

  const submitProvider = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = providerTitle.trim();
    if (!title || !providerUrl.trim()) {
      setError("프로바이더 이름과 URL이 필요합니다.");
      return;
    }
    const actionKey = `chat-provider-add:${title}`;
    if (!startAction(actionKey)) return;
    setSyncingProviders((current) => new Set(current).add(title));
    void createWebProvider({ title, type: "openai", url: providerUrl.trim(), token: providerToken.trim() }).then(async (provider) => {
      await refreshBundles();
      const synced = await syncWebProviderModels(provider.title).catch(() => ({ models: [], syncError: "sync failed" }));
      if (synced.syncError) {
        await syncProviderFromBrowser(provider);
      }
      await refreshBundles();
      setProviderTitle("");
      setProviderUrl("");
      setProviderToken("");
      setProviderFormOpen(false);
      setError("");
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "프로바이더를 추가하지 못했습니다.")).finally(() => {
      finishAction(actionKey);
      setSyncingProviders((current) => {
        const next = new Set(current);
        next.delete(title);
        return next;
      });
    });
  };

  const submitModel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modelProvider || !modelName.trim()) {
      setError("모델 이름이 필요합니다.");
      return;
    }
    const actionKey = `chat-model-add:${modelProvider}`;
    if (!startAction(actionKey)) return;
    void createWebProviderModel(modelProvider, {
      model: modelName.trim(),
      contextsize: Number(contextsize) || 100000,
      modalities: normalizeModalities(modelModalities),
      ...optionalNumber("temperature", modelTemperature),
      ...optionalNumber("topP", modelTopP),
      ...optionalNumber("topK", modelTopK),
      ...optionalNumber("minP", modelMinP)
    }).then(async () => {
      await refreshBundles();
      setModelName("");
      setContextsize("100000");
      setModelModalities(["text"]);
      setModelTemperature("");
      setModelTopP("");
      setModelTopK("");
      setModelMinP("");
      setModelProvider(undefined);
      setError("");
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "모델을 추가하지 못했습니다.")).finally(() => finishAction(actionKey));
  };

  const syncProvider = (provider: ProviderBundle["provider"]) => {
    const actionKey = `chat-provider-sync:${provider.title}`;
    if (!startAction(actionKey)) return;
    setSyncingProviders((current) => new Set(current).add(provider.title));
    setSyncErrorProviders((current) => {
      const next = new Set(current);
      next.delete(provider.title);
      return next;
    });
    void syncWebProviderModels(provider.title).then(async (synced) => {
      if (synced.syncError) {
        await syncProviderFromBrowser(provider);
      }
      await refreshBundles();
    }).catch((caught) => {
      setSyncErrorProviders((current) => new Set(current).add(provider.title));
      setError(caught instanceof Error ? caught.message : "모델 동기화에 실패했습니다.");
    }).finally(() => {
      finishAction(actionKey);
      setSyncingProviders((current) => {
        const next = new Set(current);
        next.delete(provider.title);
        return next;
      });
    });
  };

  const updateEditTarget = () => {
    if (!editTarget) return;
    const actionKey = `chat-model-edit:${editTarget.provider}:${editTarget.model}`;
    if (!startAction(actionKey)) return;
    void updateWebProviderModel(editTarget.provider, editTarget.model, {
      contextsize: Number(editTarget.contextsize) || 100000,
      modalities: normalizeModalities(editTarget.modalities),
      temperature: optionalNullableNumber(editTarget.temperature),
      topP: optionalNullableNumber(editTarget.topP),
      topK: optionalNullableNumber(editTarget.topK),
      minP: optionalNullableNumber(editTarget.minP)
    }).then(async () => {
      await refreshBundles();
      setEditTarget(null);
      setError("");
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "모델을 저장하지 못했습니다.")).finally(() => finishAction(actionKey));
  };

  const deleteEditTarget = () => {
    if (!editTarget) return;
    const actionKey = `chat-model-delete:${editTarget.provider}:${editTarget.model}`;
    if (!startAction(actionKey)) return;
    void deleteWebProviderModel(editTarget.provider, editTarget.model).then(async () => {
      await refreshBundles();
      setEditTarget(null);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "모델을 삭제하지 못했습니다.")).finally(() => finishAction(actionKey));
  };

  const removeProvider = (provider: string) => {
    const actionKey = `chat-provider-delete:${provider}`;
    if (!startAction(actionKey)) return;
    void deleteWebProvider(provider).then(refreshBundles).catch((caught) => setError(caught instanceof Error ? caught.message : "프로바이더를 삭제하지 못했습니다.")).finally(() => finishAction(actionKey));
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4">
      <section role="dialog" aria-modal="true" aria-busy={dialogLocked} aria-labelledby="chat-model-dialog-title" className="grid w-full max-w-3xl gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="chat-model-dialog-title" className="text-sm font-semibold text-zinc-100">채팅 모델 선택</h2>
            <Button type="button" className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-expanded={providerFormOpen} disabled={dialogLocked} onClick={() => setProviderFormOpen((open) => !open)}>
              <Plus className="h-4 w-4" />프로바이더 추가
            </Button>
          </div>
          <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="닫기" disabled={dialogLocked} onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
        {providerFormOpen ? (
          <form className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" onSubmit={submitProvider}>
            <div className="grid gap-2 md:grid-cols-3">
              <Input aria-label="프로바이더 이름" disabled={dialogLocked} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder="프로바이더 이름" value={providerTitle} onChange={(event) => setProviderTitle(event.target.value)} />
              <Input aria-label="Base URL" disabled={dialogLocked} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50 md:col-span-2" placeholder="Base URL" value={providerUrl} onChange={(event) => setProviderUrl(event.target.value)} />
              <Input aria-label="API token" disabled={dialogLocked} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50 md:col-span-3" placeholder="API token" value={providerToken} onChange={(event) => setProviderToken(event.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={dialogLocked} className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50"><Plus className="h-4 w-4" />추가</Button>
            </div>
          </form>
        ) : null}
        <div className="grid max-h-[70vh] gap-3 overflow-auto pr-1">
          {bundles.map((bundle, providerIndex) => (
            <section key={bundle.provider.title} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">{bundle.provider.title}</h3>
                <div className="flex items-center gap-1">
                  <Button type="button" className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="모델 동기화" aria-busy={syncingProviders.has(bundle.provider.title)} disabled={dialogLocked} onClick={() => syncProvider(bundle.provider)}>
                    <RefreshCw className={syncingProviders.has(bundle.provider.title) ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                    {syncErrorProviders.has(bundle.provider.title) ? <CircleAlert className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 text-white" /> : null}
                  </Button>
                  <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="모델 추가" disabled={dialogLocked} onClick={() => setModelProvider(modelProvider === bundle.provider.title ? undefined : bundle.provider.title)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label="프로바이더 삭제" disabled={dialogLocked} onClick={() => removeProvider(bundle.provider.title)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {modelProvider === bundle.provider.title ? (
                <form className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2" onSubmit={submitModel}>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto]">
                    <Input aria-label="모델 이름" disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder="모델 이름" value={modelName} onChange={(event) => setModelName(event.target.value)} />
                    <Input aria-label="context size" disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder="context" inputMode="numeric" value={contextsize} onChange={(event) => setContextsize(event.target.value)} />
                    <Button type="submit" disabled={dialogLocked} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-50"><Plus className="h-4 w-4" />추가</Button>
                    <Button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:pointer-events-none disabled:opacity-50" aria-label="닫기" disabled={dialogLocked} onClick={() => setModelProvider(undefined)}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                    <ChatInferenceInput label="temperature" value={modelTemperature} disabled={dialogLocked} onChange={setModelTemperature} />
                    <ChatInferenceInput label="topP" value={modelTopP} disabled={dialogLocked} onChange={setModelTopP} />
                    <ChatInferenceInput label="topK" value={modelTopK} disabled={dialogLocked} onChange={setModelTopK} />
                    <ChatInferenceInput label="minP" value={modelMinP} disabled={dialogLocked} onChange={setModelMinP} />
                  </div>
                  <ChatModalityPills value={modelModalities} disabled={dialogLocked} onChange={setModelModalities} />
                </form>
              ) : null}
              <div className="grid gap-1">
                {bundle.models.map((model, modelIndex) => {
                  const selected = selectedModel.provider === bundle.provider.title && selectedModel.model === model.model;
                  const isEditing = editTarget?.provider === bundle.provider.title && editTarget.model === model.model;
                  const editPanelId = `${dialogIdPrefix}-chat-model-edit-${providerIndex}-${modelIndex}`;
                  const modalities = normalizeModalities(model.modalities ?? ["text"]);
                  return (
                    <article key={model.model} className={selected ? "grid gap-3 rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-left text-sm text-emerald-100" : "grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"}>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <Button type="button" className="min-w-0 flex-1 truncate text-left disabled:pointer-events-none disabled:opacity-50" disabled={dialogLocked} onClick={() => selectModel(bundle.provider, model)}>
                          {model.model}
                        </Button>
                        <span className="shrink-0 text-xs text-zinc-500">{model.contextsize.toLocaleString()}</span>
                        <Button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50" aria-label="모델 편집" aria-expanded={isEditing} aria-controls={editPanelId} disabled={dialogLocked} onClick={() => setEditTarget(isEditing ? null : {
                          provider: bundle.provider.title,
                          model: model.model,
                          contextsize: String(model.contextsize),
                          modalities,
                          temperature: optionalNumberText(model.temperature),
                          topP: optionalNumberText(model.topP),
                          topK: optionalNumberText(model.topK),
                          minP: optionalNumberText(model.minP)
                        })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {isEditing && editTarget ? (
                        <form id={editPanelId} className="grid min-w-0 gap-3 border-t border-zinc-800 pt-3" onSubmit={(event) => { event.preventDefault(); updateEditTarget(); }}>
                          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                            <Input aria-label="모델 이름" className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={editTarget.model} readOnly />
                            <Input aria-label="context size" disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" inputMode="numeric" value={editTarget.contextsize} onChange={(event) => setEditTarget({ ...editTarget, contextsize: event.target.value })} />
                            <Button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:pointer-events-none disabled:opacity-50" aria-label="닫기" disabled={dialogLocked} onClick={() => setEditTarget(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                            <ChatInferenceInput label="temperature" value={editTarget.temperature} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, temperature: value })} />
                            <ChatInferenceInput label="topP" value={editTarget.topP} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, topP: value })} />
                            <ChatInferenceInput label="topK" value={editTarget.topK} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, topK: value })} />
                            <ChatInferenceInput label="minP" value={editTarget.minP} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, minP: value })} />
                          </div>
                          <ChatModalityPills value={editTarget.modalities} disabled={dialogLocked} onChange={(modalities) => setEditTarget({ ...editTarget, modalities })} />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="submit" disabled={dialogLocked} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50">저장</Button>
                            <Button type="button" disabled={dialogLocked} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 disabled:pointer-events-none disabled:opacity-50" onClick={deleteEditTarget}>
                              <Trash2 className="h-4 w-4" />삭제
                            </Button>
                          </div>
                        </form>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChatModalityPills(props: { value: Array<"text" | "image" | "file">; disabled: boolean; onChange: (value: Array<"text" | "image" | "file">) => void }) {
  const value = normalizeModalities(props.value);
  return (
    <fieldset className="flex flex-wrap gap-2 text-xs text-zinc-400" aria-label="모달리티">
      <span className="inline-flex h-7 items-center rounded-full border border-emerald-600 bg-emerald-600 px-3 font-medium text-white">text</span>
      {(["image", "file"] as const).map((modality) => {
        const selected = value.includes(modality);
        return (
          <Button key={modality} type="button" className={selected ? "inline-flex h-7 items-center rounded-full border border-emerald-600 bg-emerald-600 px-3 font-medium text-white disabled:opacity-50" : "inline-flex h-7 items-center rounded-full border border-zinc-700 bg-zinc-950 px-3 font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"} aria-pressed={selected} disabled={props.disabled} onClick={() => props.onChange(toggleModality(value, modality, !selected))}>
            {modality}
          </Button>
        );
      })}
    </fieldset>
  );
}

function ChatInferenceInput(props: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-zinc-500">
      <span>{props.label}</span>
      <Input aria-label={props.label} disabled={props.disabled} inputMode="decimal" className="h-8 min-w-0 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50" placeholder="off" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}
