import React from "react";
import { CircleAlert, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import type { NDXAgentWebModel, NDXAgentWebProvider } from "ndx/webclient/common";
import { normalizeModalities, optionalNullableNumber, optionalNumber, optionalNumberText, toggleModality } from "ndx/webclient/front";
import { RSC } from "../resource";

type ProviderBundle = {
  provider: NDXAgentWebProvider;
  models: NDXAgentWebModel[];
};

type ModelDialogProps = {
  selectedModel: { provider: string; model: string };
  providers: ProviderBundle[];
  t: Record<string, string>;
  onClose: () => void;
  onSelect: (provider: string, model: NDXAgentWebModel) => void;
  onAddProvider: (input: { title: string; url: string; token: string }) => Promise<void>;
  onAddModel: (provider: string, input: ModelFormInput) => Promise<void>;
  onSyncProvider: (provider: string) => Promise<void>;
  onUpdateModel: (provider: string, model: string, input: ModelUpdateInput) => Promise<void>;
  onDeleteProvider: (provider: string) => Promise<void>;
  onDeleteModel: (provider: string, model: string) => Promise<void>;
};

type ModelFormInput = {
  model: string;
  contextsize: number;
  modalities: Array<"text" | "image" | "file">;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

type ModelUpdateInput = {
  contextsize: number;
  modalities: Array<"text" | "image" | "file">;
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  minP?: number | null;
};

type ModelEditTarget = {
  provider: string;
  model: string;
  contextsize: string;
  modalities: Array<"text" | "image" | "file">;
  temperature: string;
  topP: string;
  topK: string;
  minP: string;
};

export function ModelDialog(props: ModelDialogProps) {
  const dialogIdPrefix = React.useId();
  const [providerFormOpen, setProviderFormOpen] = React.useState(false);
  const [providerTitle, setProviderTitle] = React.useState("");
  const [providerUrl, setProviderUrl] = React.useState("");
  const [providerToken, setProviderToken] = React.useState("");
  const [providerError, setProviderError] = React.useState("");
  const [modelProvider, setModelProvider] = React.useState<string>();
  const [modelName, setModelName] = React.useState("");
  const [contextsize, setContextsize] = React.useState("100000");
  const [modelModalities, setModelModalities] = React.useState<Array<"text" | "image" | "file">>(["text"]);
  const [modelTemperature, setModelTemperature] = React.useState("");
  const [modelTopP, setModelTopP] = React.useState("");
  const [modelTopK, setModelTopK] = React.useState("");
  const [modelMinP, setModelMinP] = React.useState("");
  const [modelError, setModelError] = React.useState("");
  const [editTarget, setEditTarget] = React.useState<ModelEditTarget | null>(null);
  const [syncingProviders, setSyncingProviders] = React.useState<Set<string>>(() => new Set());
  const [syncErrorProviders, setSyncErrorProviders] = React.useState<Set<string>>(() => new Set());
  const [pendingActions, setPendingActions] = React.useState<Set<string>>(() => new Set());
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

  const submitProvider = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = providerTitle.trim();
    const actionKey = `add-provider:${title}`;
    if (!title || !providerUrl.trim()) {
      setProviderError(props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_REQUIRED_ALERT]);
      return;
    }
    if (!startAction(actionKey)) return;
    setSyncingProviders((current) => new Set(current).add(title));
    setSyncErrorProviders((current) => {
      const next = new Set(current);
      next.delete(title);
      return next;
    });
    void props.onAddProvider({ title, url: providerUrl.trim(), token: providerToken.trim() }).then(() => {
      setProviderTitle("");
      setProviderUrl("");
      setProviderToken("");
      setProviderError("");
      setProviderFormOpen(false);
    }).catch(() => {
      setSyncErrorProviders((current) => new Set(current).add(title));
    }).finally(() => {
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
    if (!modelProvider) return;
    if (!modelName.trim()) {
      setModelError(props.t[RSC.SESSION_MODEL_DIALOG_MODEL_REQUIRED_ALERT]);
      return;
    }
    const actionKey = `add-model:${modelProvider}`;
    if (!startAction(actionKey)) return;
    void props.onAddModel(modelProvider, {
      model: modelName.trim(),
      contextsize: Number(contextsize) || 100000,
      modalities: normalizeModalities(modelModalities),
      ...optionalNumber("temperature", modelTemperature),
      ...optionalNumber("topP", modelTopP),
      ...optionalNumber("topK", modelTopK),
      ...optionalNumber("minP", modelMinP)
    }).then(() => {
      setModelName("");
      setContextsize("100000");
      setModelModalities(["text"]);
      setModelTemperature("");
      setModelTopP("");
      setModelTopK("");
      setModelMinP("");
      setModelError("");
      setModelProvider(undefined);
    }).catch(() => setModelError(props.t[RSC.SESSION_MODEL_DIALOG_FAILED_ALERT])).finally(() => finishAction(actionKey));
  };

  const syncProvider = (provider: string) => {
    const actionKey = `sync:${provider}`;
    if (!startAction(actionKey)) return;
    setSyncingProviders((current) => new Set(current).add(provider));
    setSyncErrorProviders((current) => {
      const next = new Set(current);
      next.delete(provider);
      return next;
    });
    void props.onSyncProvider(provider).catch(() => {
      setSyncErrorProviders((current) => new Set(current).add(provider));
    }).finally(() => {
      finishAction(actionKey);
      setSyncingProviders((current) => {
        const next = new Set(current);
        next.delete(provider);
        return next;
      });
    });
  };

  const updateEditTarget = () => {
    if (!editTarget) return;
    const actionKey = `edit:${editTarget.provider}:${editTarget.model}`;
    if (!startAction(actionKey)) return;
    void props.onUpdateModel(editTarget.provider, editTarget.model, {
      contextsize: Number(editTarget.contextsize) || 100000,
      modalities: normalizeModalities(editTarget.modalities),
      temperature: optionalNullableNumber(editTarget.temperature),
      topP: optionalNullableNumber(editTarget.topP),
      topK: optionalNullableNumber(editTarget.topK),
      minP: optionalNullableNumber(editTarget.minP)
    }).then(() => setEditTarget(null)).catch(() => setModelError(props.t[RSC.SESSION_MODEL_DIALOG_FAILED_ALERT])).finally(() => finishAction(actionKey));
  };

  const deleteEditTarget = () => {
    if (!editTarget) return;
    const actionKey = `delete-model:${editTarget.provider}:${editTarget.model}`;
    if (!startAction(actionKey)) return;
    void props.onDeleteModel(editTarget.provider, editTarget.model).then(() => setEditTarget(null)).catch(() => setModelError(props.t[RSC.SESSION_MODEL_DIALOG_FAILED_ALERT])).finally(() => finishAction(actionKey));
  };

  const deleteProvider = (provider: string) => {
    const actionKey = `delete-provider:${provider}`;
    if (!startAction(actionKey)) return;
    void props.onDeleteProvider(provider).catch(() => setProviderError(props.t[RSC.SESSION_MODEL_DIALOG_FAILED_ALERT])).finally(() => finishAction(actionKey));
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4">
      <section role="dialog" aria-modal="true" aria-busy={dialogLocked} aria-labelledby="model-dialog-title" className="grid w-full max-w-3xl gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="model-dialog-title" className="text-sm font-semibold text-zinc-100">{props.t[RSC.SESSION_MODEL_DIALOG_TITLE_TEXT]}</h2>
            <button type="button" className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-expanded={providerFormOpen} disabled={dialogLocked} onClick={() => setProviderFormOpen((open) => !open)}>
              <Plus className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_ADD_BUTTON]}
            </button>
          </div>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_CLOSE_BUTTON]} disabled={dialogLocked} onClick={props.onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {!providerFormOpen && providerError ? <p role="alert" className="text-xs text-red-300">{providerError}</p> : null}
        {dialogLocked ? <p role="status" className="text-xs text-zinc-500">{props.t[RSC.SESSION_MODEL_DIALOG_BUSY_STATUS]}</p> : null}

        {providerFormOpen ? (
          <form className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" onSubmit={submitProvider}>
            <div className="grid gap-2 md:grid-cols-3">
              <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_TITLE_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_TITLE_INPUT_PLACEHOLDER]} value={providerTitle} onChange={(event) => setProviderTitle(event.target.value)} />
              <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_URL_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50 md:col-span-2" placeholder={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_URL_INPUT_PLACEHOLDER]} value={providerUrl} onChange={(event) => setProviderUrl(event.target.value)} />
              <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_TOKEN_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50 md:col-span-3" placeholder={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_TOKEN_INPUT_PLACEHOLDER]} value={providerToken} onChange={(event) => setProviderToken(event.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-red-300" role={providerError ? "alert" : "status"}>{providerError || (dialogLocked ? props.t[RSC.SESSION_MODEL_DIALOG_BUSY_STATUS] : "")}</p>
              <button type="submit" disabled={dialogLocked} className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50"><Plus className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_ADD_BUTTON]}</button>
            </div>
          </form>
        ) : null}

        <div className="grid gap-3 max-h-[70vh] overflow-auto pr-1">
          {props.providers.map(({ provider, models }, providerIndex) => {
            const syncing = syncingProviders.has(provider.title);
            const syncError = syncErrorProviders.has(provider.title);
            return (
              <section key={provider.title} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3" aria-labelledby={`provider-${provider.title}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`provider-${provider.title}`} className="text-sm font-semibold text-zinc-100">{provider.title}</h3>
                  <div className="flex items-center gap-1">
                    <button type="button" className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_REFRESH_BUTTON]} aria-busy={syncing} disabled={syncing || dialogLocked} onClick={() => syncProvider(provider.title)}>
                      <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                      {syncError ? (
                        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 animate-[sync-error-pop_180ms_ease-out] place-items-center rounded-full bg-red-500 text-white ring-2 ring-zinc-950" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT]}>
                          <CircleAlert className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_ADD_BUTTON]} disabled={dialogLocked} onClick={() => { setModelError(""); setModelProvider(modelProvider === provider.title ? undefined : provider.title); }}>
                      <Plus className="h-4 w-4" />
                    </button>
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_DELETE_BUTTON]} disabled={dialogLocked} onClick={() => deleteProvider(provider.title)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {modelProvider === provider.title ? (
                  <form className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2" onSubmit={submitModel}>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto]">
                      <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_NAME_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_NAME_INPUT_PLACEHOLDER]} value={modelName} onChange={(event) => setModelName(event.target.value)} />
                      <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_CONTEXT_SIZE_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_CONTEXT_SIZE_INPUT_PLACEHOLDER]} inputMode="numeric" value={contextsize} onChange={(event) => setContextsize(event.target.value)} />
                      <button type="submit" disabled={dialogLocked} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50"><Plus className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_ADD_BUTTON]}</button>
                      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_CLOSE_BUTTON]} disabled={dialogLocked} onClick={() => setModelProvider(undefined)}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                      <InferenceInput label="temperature" value={modelTemperature} disabled={dialogLocked} onChange={setModelTemperature} />
                      <InferenceInput label="topP" value={modelTopP} disabled={dialogLocked} onChange={setModelTopP} />
                      <InferenceInput label="topK" value={modelTopK} disabled={dialogLocked} onChange={setModelTopK} />
                      <InferenceInput label="minP" value={modelMinP} disabled={dialogLocked} onChange={setModelMinP} />
                    </div>
                    <ModalityPills value={modelModalities} disabled={dialogLocked} onChange={setModelModalities} />
                    {modelError ? <p className="text-xs text-red-300" role="alert">{modelError}</p> : null}
                  </form>
                ) : null}
                {models.length === 0 ? <p className="text-xs text-zinc-500">{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_EMPTY_MESSAGE]}</p> : null}
                <div className="grid gap-2">
                  {models.map((model, modelIndex) => {
                    const isSelected = props.selectedModel.provider === provider.title && props.selectedModel.model === model.model;
                    const isEditing = editTarget?.provider === provider.title && editTarget.model === model.model;
                    const editPanelId = `${dialogIdPrefix}-model-edit-${providerIndex}-${modelIndex}`;
                    const modelModalities = normalizeModalities(model.modalities ?? ["text"]);
                    return (
                      <article
                        key={model.model}
                        className={isSelected
                          ? "grid gap-3 rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-left text-sm text-emerald-200"
                          : "grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"}
                        aria-labelledby={`${editPanelId}-title`}
                      >
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <button type="button" id={`${editPanelId}-title`} className="min-w-0 flex-1 truncate text-left disabled:pointer-events-none disabled:opacity-50" disabled={dialogLocked} onClick={() => props.onSelect(provider.title, model)}>{model.model}</button>
                          <span className="flex min-w-fit shrink-0 flex-wrap items-center justify-end gap-1.5 text-xs text-zinc-500" aria-label="모델 요약">
                            <span className="inline-flex h-6 items-center rounded-full border border-zinc-700 bg-zinc-900 px-2.5 text-zinc-300" aria-label={`context ${Math.floor(model.contextsize / 1000)}k`}>{Math.floor(model.contextsize / 1000)}k</span>
                            {modelModalities.map((modality) => (
                              <span key={modality} className={modality === "text" ? "inline-flex h-6 items-center rounded-full border border-emerald-700 bg-emerald-950/60 px-2.5 text-emerald-200" : "inline-flex h-6 items-center rounded-full border border-zinc-700 bg-zinc-900 px-2.5 text-zinc-300"}>{modality}</span>
                            ))}
                            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_EDIT_BUTTON]} aria-expanded={isEditing} aria-controls={editPanelId} disabled={dialogLocked} onClick={() => { setModelError(""); setEditTarget(isEditing ? null : {
                              provider: provider.title,
                              model: model.model,
                              contextsize: String(model.contextsize),
                              modalities: modelModalities,
                              temperature: optionalNumberText(model.temperature),
                              topP: optionalNumberText(model.topP),
                              topK: optionalNumberText(model.topK),
                              minP: optionalNumberText(model.minP)
                            }); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                        {isEditing && editTarget ? (
                          <form id={editPanelId} className="grid min-w-0 gap-3 border-t border-zinc-800 pt-3" aria-labelledby={`${editPanelId}-title`} onSubmit={(event) => { event.preventDefault(); updateEditTarget(); }}>
                            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                              <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_NAME_INPUT_PLACEHOLDER]} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={editTarget.model} readOnly />
                              <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_CONTEXT_SIZE_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" inputMode="numeric" value={editTarget.contextsize} onChange={(event) => setEditTarget({ ...editTarget, contextsize: event.target.value })} />
                              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_CLOSE_BUTTON]} disabled={dialogLocked} onClick={() => setEditTarget(null)}>
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                              <InferenceInput label="temperature" value={editTarget.temperature} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, temperature: value })} />
                              <InferenceInput label="topP" value={editTarget.topP} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, topP: value })} />
                              <InferenceInput label="topK" value={editTarget.topK} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, topK: value })} />
                              <InferenceInput label="minP" value={editTarget.minP} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, minP: value })} />
                            </div>
                            <ModalityPills value={editTarget.modalities} disabled={dialogLocked} onChange={(modalities) => setEditTarget({ ...editTarget, modalities })} />
                            {modelError ? <p className="text-xs text-red-300" role="alert">{modelError}</p> : null}
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="submit" disabled={dialogLocked} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50">{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_SAVE_BUTTON]}</button>
                              <button type="button" disabled={dialogLocked} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" onClick={deleteEditTarget}>
                                <Trash2 className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_DELETE_BUTTON]}
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ModalityPills(props: { value: Array<"text" | "image" | "file">; disabled: boolean; onChange: (value: Array<"text" | "image" | "file">) => void }) {
  const value = normalizeModalities(props.value);
  return (
    <fieldset className="flex flex-wrap gap-2 text-xs text-zinc-400" aria-label="모달리티">
      <span className="inline-flex h-7 items-center rounded-full border border-emerald-600 bg-emerald-600 px-3 font-medium text-white" aria-label="text selected" aria-disabled="true">text</span>
      {(["image", "file"] as const).map((modality) => {
        const selected = value.includes(modality);
        return (
          <button
            key={modality}
            type="button"
            className={selected
              ? "inline-flex h-7 items-center rounded-full border border-emerald-600 bg-emerald-600 px-3 font-medium text-white disabled:opacity-50"
              : "inline-flex h-7 items-center rounded-full border border-zinc-700 bg-zinc-950 px-3 font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"}
            aria-pressed={selected}
            disabled={props.disabled}
            onClick={() => props.onChange(toggleModality(value, modality, !selected))}
          >
            {modality}
          </button>
        );
      })}
    </fieldset>
  );
}

function InferenceInput(props: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const empty = props.value.trim().length === 0;
  return (
    <label className="grid min-w-0 gap-1 text-xs text-zinc-500">
      <span>{props.label}</span>
      <input
        aria-label={props.label}
        disabled={props.disabled}
        inputMode="decimal"
        className={empty
          ? "h-8 min-w-0 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-500 placeholder:text-zinc-600 disabled:opacity-50"
          : "h-8 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 disabled:opacity-50"}
        placeholder="off"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}
