import React from "react";
import type { NDXAgentWebSession } from "ndx/webclient/common";
import { createWebProvider, createWebProviderModel, deleteWebProvider, deleteWebProviderModel, listWebProviderModels, listWebProviders, normalizeReasoningEffort, readProviderModelNames, syncWebProviderModels, updateWebProviderModel, type ProviderBundle, type SelectedModelConfig } from "ndx/webclient/front";
import { RSC } from "../../app/resource";
import { ModelDialog } from "./ModelDialog";

type UseModelDialogControllerOptions = {
  activeSession?: NDXAgentWebSession;
  selectedModel: SelectedModelConfig;
  setSelectedModel: (update: SelectedModelConfig | ((current: SelectedModelConfig) => SelectedModelConfig)) => void;
  setNotice: (message: string) => void;
  t: Record<string, string>;
};

export function useModelDialogController({ activeSession, selectedModel, setSelectedModel, setNotice, t }: UseModelDialogControllerOptions) {
  const [open, setOpen] = React.useState(false);
  const [providerBundles, setProviderBundles] = React.useState<ProviderBundle[]>([]);
  const restoredModelSessionRef = React.useRef<string | undefined>(undefined);

  const refreshProviderBundles = () => {
    return (async () => {
      const providers = await listWebProviders();
      const nextBundles: ProviderBundle[] = [];
      for (const provider of providers) {
        nextBundles.push({ provider, models: await listWebProviderModels(provider.title) });
      }
      setProviderBundles(nextBundles);
      return nextBundles;
    })();
  };

  const syncProviderFromBrowser = async (provider: { title: string; url: string; token: string }) => {
    const names = await readProviderModelNames(provider);
    const existing = new Set((await listWebProviderModels(provider.title)).map((model) => model.model));
    for (const model of names) {
      if (!existing.has(model)) {
        await createWebProviderModel(provider.title, { model, contextsize: 100_000, modalities: ["text"] });
      }
    }
    return names.length;
  };

  React.useEffect(() => {
    void refreshProviderBundles()
      .catch(() => setNotice(t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT]));
  }, [t[RSC.APP_STATUS_STATE_UNAVAILABLE_ALERT]]);

  React.useEffect(() => {
    if (!activeSession) return;
    if (restoredModelSessionRef.current === activeSession.sessionid) return;
    const bundle =
      providerBundles.find((item) => activeSession.model.url && item.provider.url === activeSession.model.url && item.provider.token === activeSession.model.token) ??
      providerBundles.find((item) => item.models.some((model) => model.model === activeSession.model.model));
    const modelRow = bundle?.models.find((model) => model.model === activeSession.model.model);
    setSelectedModel({
      provider: bundle?.provider.title ?? "",
      model: activeSession.model.model,
      contextsize: activeSession.model.contextsize || modelRow?.contextsize || 100_000,
      url: bundle?.provider.url || activeSession.model.url || "",
      token: bundle?.provider.token || activeSession.model.token || "",
      modalities: activeSession.model.modalities ?? modelRow?.modalities ?? ["text"],
      reasoningEffort: normalizeReasoningEffort(activeSession.model.reasoningEffort ?? modelRow?.reasoningEffort),
      ...(typeof activeSession.model.temperature === "number" ? { temperature: activeSession.model.temperature } : typeof modelRow?.temperature === "number" ? { temperature: modelRow.temperature } : {}),
      ...(typeof activeSession.model.topP === "number" ? { topP: activeSession.model.topP } : typeof modelRow?.topP === "number" ? { topP: modelRow.topP } : {}),
      ...(typeof activeSession.model.topK === "number" ? { topK: activeSession.model.topK } : typeof modelRow?.topK === "number" ? { topK: modelRow.topK } : {}),
      ...(typeof activeSession.model.minP === "number" ? { minP: activeSession.model.minP } : typeof modelRow?.minP === "number" ? { minP: modelRow.minP } : {})
    });
    restoredModelSessionRef.current = activeSession.sessionid;
  }, [activeSession?.sessionid]);

  React.useEffect(() => {
    if (!activeSession) return;
    const bundle =
      providerBundles.find((item) => activeSession.model.url && item.provider.url === activeSession.model.url && item.provider.token === activeSession.model.token) ??
      providerBundles.find((item) => item.models.some((model) => model.model === activeSession.model.model));
    if (bundle && (!selectedModel.provider || !selectedModel.url)) {
      const modelRow = bundle.models.find((model) => model.model === activeSession.model.model);
      setSelectedModel((current) => ({
        ...current,
        provider: current.provider || bundle.provider.title,
        contextsize: current.contextsize || modelRow?.contextsize || activeSession.model.contextsize,
        modalities: current.modalities ?? modelRow?.modalities ?? activeSession.model.modalities ?? ["text"],
        reasoningEffort: normalizeReasoningEffort(current.reasoningEffort ?? modelRow?.reasoningEffort ?? activeSession.model.reasoningEffort),
        url: bundle.provider.url || current.url,
        token: bundle.provider.token || current.token,
        ...(typeof current.temperature === "number" ? { temperature: current.temperature } : typeof modelRow?.temperature === "number" ? { temperature: modelRow.temperature } : typeof activeSession.model.temperature === "number" ? { temperature: activeSession.model.temperature } : {}),
        ...(typeof current.topP === "number" ? { topP: current.topP } : typeof modelRow?.topP === "number" ? { topP: modelRow.topP } : typeof activeSession.model.topP === "number" ? { topP: activeSession.model.topP } : {}),
        ...(typeof current.topK === "number" ? { topK: current.topK } : typeof modelRow?.topK === "number" ? { topK: modelRow.topK } : typeof activeSession.model.topK === "number" ? { topK: activeSession.model.topK } : {}),
        ...(typeof current.minP === "number" ? { minP: current.minP } : typeof modelRow?.minP === "number" ? { minP: modelRow.minP } : typeof activeSession.model.minP === "number" ? { minP: activeSession.model.minP } : {})
      }));
    }
  }, [activeSession?.sessionid, providerBundles, selectedModel.provider, selectedModel.url]);

  const dialog = open ? <ModelDialog selectedModel={selectedModel} providers={providerBundles} t={t} onClose={() => setOpen(false)} onReasoningEffortChange={(reasoningEffort) => {
    setSelectedModel((current) => ({ ...current, reasoningEffort }));
  }} onSelect={(provider, model) => {
    const bundle = providerBundles.find((item) => item.provider.title === provider);
    setSelectedModel((current) => ({ provider, model: model.model, contextsize: model.contextsize, url: bundle?.provider.url ?? "", token: bundle?.provider.token ?? "", modalities: model.modalities ?? ["text"], reasoningEffort: normalizeReasoningEffort(current.reasoningEffort ?? model.reasoningEffort), ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}), ...(typeof model.topP === "number" ? { topP: model.topP } : {}), ...(typeof model.topK === "number" ? { topK: model.topK } : {}), ...(typeof model.minP === "number" ? { minP: model.minP } : {}) }));
    setOpen(false);
  }} onAddProvider={async (input) => {
    const provider = await createWebProvider({ title: input.title, type: "openai", url: input.url, token: input.token });
    await refreshProviderBundles();
    const synced = await syncWebProviderModels(provider.title).catch(() => ({ models: [], syncError: t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT] }));
    if (synced.syncError) {
      await syncProviderFromBrowser(provider).catch((error) => setNotice(`${t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT]} ${error instanceof Error ? error.message : synced.syncError}`));
    }
    await refreshProviderBundles();
  }} onAddModel={async (provider, input) => {
    await createWebProviderModel(provider, input);
    await refreshProviderBundles();
  }} onSyncProvider={async (provider) => {
    const synced = await syncWebProviderModels(provider).catch(() => ({ models: [], syncError: t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT] }));
    if (synced.syncError) {
      const bundle = providerBundles.find((item) => item.provider.title === provider);
      if (bundle) await syncProviderFromBrowser(bundle.provider).catch((error) => setNotice(`${t[RSC.SESSION_MODEL_DIALOG_MODEL_SYNC_FAILED_ALERT]} ${error instanceof Error ? error.message : synced.syncError}`));
    }
    await refreshProviderBundles();
  }} onUpdateModel={async (provider, model, input) => {
    await updateWebProviderModel(provider, model, input);
    await refreshProviderBundles();
  }} onDeleteProvider={async (provider) => {
    await deleteWebProvider(provider);
    await refreshProviderBundles();
  }} onDeleteModel={async (provider, model) => {
    await deleteWebProviderModel(provider, model);
    await refreshProviderBundles();
  }} /> : null;

  return { open, setOpen, dialog };
}
