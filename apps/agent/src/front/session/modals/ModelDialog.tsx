import React from "react";
import { CircleAlert, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import type { NDXAgentWebModel, NDXAgentWebProvider } from "ndx/agent/web";
import { Button } from "../../components/ui/button";
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
      modalities: modelModalities,
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
      modalities: editTarget.modalities,
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
            <Button type="button" size="sm" className="h-8 bg-emerald-600 px-3 text-white hover:bg-emerald-500" aria-expanded={providerFormOpen} disabled={dialogLocked} onClick={() => setProviderFormOpen((open) => !open)}>
              <Plus className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_ADD_BUTTON]}
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 w-8 border-zinc-800 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_CLOSE_BUTTON]} disabled={dialogLocked} onClick={props.onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
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
              <Button type="submit" size="sm" disabled={dialogLocked} className="h-8 bg-emerald-600 text-white hover:bg-emerald-500"><Plus className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_ADD_BUTTON]}</Button>
            </div>
          </form>
        ) : null}

        <div className="grid gap-3 max-h-[70vh] overflow-auto pr-1">
          {props.providers.map(({ provider, models }) => {
            const syncing = syncingProviders.has(provider.title);
            const syncError = syncErrorProviders.has(provider.title);
            return (
              <section key={provider.title} className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3" aria-labelledby={`provider-${provider.title}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`provider-${provider.title}`} className="text-sm font-semibold text-zinc-100">{provider.title}</h3>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" className="relative h-8 w-8 border-zinc-800 bg-zinc-950 p-0 text-zinc-300 hover:bg-zinc-900" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_REFRESH_BUTTON]} aria-busy={syncing} disabled={syncing || dialogLocked} onClick={() => syncProvider(provider.title)}>
                      <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                      {syncError ? (
                        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 animate-[sync-error-pop_180ms_ease-out] place-items-center rounded-full bg-red-500 text-white ring-2 ring-zinc-950" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT]}>
                          <CircleAlert className="h-3 w-3" />
                        </span>
                      ) : null}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 border-zinc-800 bg-zinc-950 p-0 text-zinc-300 hover:bg-zinc-900" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_ADD_BUTTON]} disabled={dialogLocked} onClick={() => { setModelError(""); setModelProvider(modelProvider === provider.title ? undefined : provider.title); }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 border-zinc-800 bg-zinc-950 p-0 text-zinc-300 hover:bg-zinc-900" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_PROVIDER_DELETE_BUTTON]} disabled={dialogLocked} onClick={() => deleteProvider(provider.title)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {modelProvider === provider.title ? (
                  <form className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-2" onSubmit={submitModel}>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto_auto]">
                      <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_NAME_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_NAME_INPUT_PLACEHOLDER]} value={modelName} onChange={(event) => setModelName(event.target.value)} />
                      <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_CONTEXT_SIZE_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" placeholder={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_CONTEXT_SIZE_INPUT_PLACEHOLDER]} inputMode="numeric" value={contextsize} onChange={(event) => setContextsize(event.target.value)} />
                      <Button type="submit" size="sm" disabled={dialogLocked} className="h-9 bg-emerald-600 px-3 text-white hover:bg-emerald-500"><Plus className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_ADD_BUTTON]}</Button>
                      <Button type="button" variant="outline" size="sm" className="h-9 w-9 border-zinc-800 bg-zinc-950 p-0 text-zinc-300 hover:bg-zinc-900" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_CLOSE_BUTTON]} disabled={dialogLocked} onClick={() => setModelProvider(undefined)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <InferenceInput label="temperature" value={modelTemperature} disabled={dialogLocked} onChange={setModelTemperature} />
                      <InferenceInput label="topP" value={modelTopP} disabled={dialogLocked} onChange={setModelTopP} />
                      <InferenceInput label="topK" value={modelTopK} disabled={dialogLocked} onChange={setModelTopK} />
                      <InferenceInput label="minP" value={modelMinP} disabled={dialogLocked} onChange={setModelMinP} />
                    </div>
                    <fieldset className="flex flex-wrap gap-3 text-xs text-zinc-400" aria-label="모달리티">
                      <label className="inline-flex items-center gap-1"><input type="checkbox" checked readOnly /> text</label>
                      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={modelModalities.includes("image")} onChange={(event) => setModelModalities((current) => toggleModality(current, "image", event.currentTarget.checked))} /> image</label>
                      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={modelModalities.includes("file")} onChange={(event) => setModelModalities((current) => toggleModality(current, "file", event.currentTarget.checked))} /> file</label>
                    </fieldset>
                    {modelError ? <p className="text-xs text-red-300" role="alert">{modelError}</p> : null}
                  </form>
                ) : null}
                {models.length === 0 ? <p className="text-xs text-zinc-500">{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_EMPTY_MESSAGE]}</p> : null}
                <div className="grid gap-2">
                  {models.map((model) => (
                    <div
                      key={model.model}
                      className={props.selectedModel.provider === provider.title && props.selectedModel.model === model.model ? "flex items-center justify-between rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-left text-sm text-emerald-200" : "flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"}
                    >
                      <button type="button" className="min-w-0 flex-1 truncate text-left disabled:pointer-events-none disabled:opacity-50" disabled={dialogLocked} onClick={() => props.onSelect(provider.title, model)}>{model.model}</button>
                      <span className="flex items-center gap-2 text-xs text-zinc-500">
                        {Math.floor(model.contextsize / 1000)}k
                        {model.modalities.filter((item) => item !== "text").join("+") || "text"}
                        <Button type="button" variant="outline" size="sm" className="h-7 w-7 border-zinc-800 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800" aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_EDIT_BUTTON]} disabled={dialogLocked} onClick={() => { setModelError(""); setEditTarget({
                          provider: provider.title,
                          model: model.model,
                          contextsize: String(model.contextsize),
                          modalities: model.modalities ?? ["text"],
                          temperature: optionalNumberText(model.temperature),
                          topP: optionalNumberText(model.topP),
                          topK: optionalNumberText(model.topK),
                          minP: optionalNumberText(model.minP)
                        }); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {editTarget ? (
          <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-400">{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_EDIT_BUTTON]}</p>
              <Button type="button" variant="outline" size="sm" className="h-8 w-8 border-zinc-800 bg-zinc-950 p-0" disabled={dialogLocked} onClick={() => setEditTarget(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_NAME_INPUT_PLACEHOLDER]} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={editTarget.model} readOnly />
            <input aria-label={props.t[RSC.SESSION_MODEL_DIALOG_MODEL_CONTEXT_SIZE_INPUT_PLACEHOLDER]} disabled={dialogLocked} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50" inputMode="numeric" value={editTarget.contextsize} onChange={(event) => setEditTarget({ ...editTarget, contextsize: event.target.value })} />
            <div className="grid gap-2 sm:grid-cols-4">
              <InferenceInput label="temperature" value={editTarget.temperature} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, temperature: value })} />
              <InferenceInput label="topP" value={editTarget.topP} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, topP: value })} />
              <InferenceInput label="topK" value={editTarget.topK} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, topK: value })} />
              <InferenceInput label="minP" value={editTarget.minP} disabled={dialogLocked} onChange={(value) => setEditTarget({ ...editTarget, minP: value })} />
            </div>
            <fieldset className="flex flex-wrap gap-3 text-xs text-zinc-400" aria-label="모달리티">
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked readOnly /> text</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={editTarget.modalities.includes("image")} onChange={(event) => setEditTarget({ ...editTarget, modalities: toggleModality(editTarget.modalities, "image", event.currentTarget.checked) })} /> image</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={editTarget.modalities.includes("file")} onChange={(event) => setEditTarget({ ...editTarget, modalities: toggleModality(editTarget.modalities, "file", event.currentTarget.checked) })} /> file</label>
            </fieldset>
            {modelError ? <p className="text-xs text-red-300" role="alert">{modelError}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" disabled={dialogLocked} onClick={updateEditTarget}>{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_SAVE_BUTTON]}</Button>
              <Button type="button" variant="outline" size="sm" disabled={dialogLocked} className="border-zinc-800 bg-zinc-950 text-zinc-300" onClick={deleteEditTarget}>
                <Trash2 className="h-4 w-4" />{props.t[RSC.SESSION_MODEL_DIALOG_MODEL_DELETE_BUTTON]}
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function toggleModality(current: Array<"text" | "image" | "file">, modality: "image" | "file", checked: boolean): Array<"text" | "image" | "file"> {
  const next = new Set<"text" | "image" | "file">(["text", ...current]);
  if (checked) {
    next.add(modality);
  } else {
    next.delete(modality);
  }
  return [...next];
}

function InferenceInput(props: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const empty = props.value.trim().length === 0;
  return (
    <label className="grid gap-1 text-xs text-zinc-500">
      <span>{props.label}</span>
      <input
        aria-label={props.label}
        disabled={props.disabled}
        inputMode="decimal"
        className={empty
          ? "rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-500 placeholder:text-zinc-600 disabled:opacity-50"
          : "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"}
        placeholder="off"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function optionalNumber<Key extends string>(key: Key, value: string): Partial<Record<Key, number>> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const number = Number(trimmed);
  return Number.isFinite(number) ? ({ [key]: number } as Partial<Record<Key, number>>) : {};
}

function optionalNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function optionalNumberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}
