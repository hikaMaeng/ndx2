import React from "react";
import { Bot, Braces, ClipboardCheck, Database, FolderSearch, Gauge, Menu, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Wrench, X } from "lucide-react";
import type { NDXAgentWebEmbeddingSettings, NDXAgentWebModel, NDXAgentWebProvider, NDXAgentWebSelfcheck, NDXAgentWebSelfcheckCandidate, NDXAgentWebSelfcheckCursor, NDXAgentWebSelfcheckRun, NDXAgentWebSelfcheckStatus, NDXAgentWebSettingsDocument } from "ndx/webclient/common";
import { createWebProvider, createWebProviderEmbeddingModel, deleteWebProvider, deleteWebProviderModel, getSettingsSurfaceModel, getWebEmbeddingSettings, getWebSettings, listWebProviderEmbeddingModels, listWebProviderModels, listWebProviders, listWebSelfcheck, listWebSelfcheckCandidates, listWebSelfcheckCursors, listWebSelfcheckRuns, runWebSelfcheck, syncWebProviderEmbeddingModels, updateWebEmbeddingSettings, updateWebProvider, updateWebSettings, updateWebSelfcheckStatus } from "ndx/webclient/front";
import { ModelPatchSettingsTab } from "./ModelPatchSettingsTab";
import { HelpText, JsonBlock, NumberTextInput, SaveButton, SelfcheckCandidateList, SelfcheckSmallList, SettingsFeedback, SettingsFormShell, SettingsSectionTitle, StatusPill, TextInput, useSettingsState } from "./SettingsControls";
import { useModel } from "../model/useModel";
import { Button, Checkbox, Input, Select, Textarea } from "../components/ui";

type SettingsSurfaceProps = {
  menuLabel: string;
  onOpenMenu: () => void;
};


type SettingsTab = "modelCatalog" | "modelPatch" | "embedding" | "runtime" | "tools" | "hooks" | "selfcheck" | "websearch" | "other";
type EmbeddingProviderBundle = {
  provider: NDXAgentWebProvider;
  models: NDXAgentWebModel[];
};

type ProviderEditDraft = {
  title: string;
  url: string;
  token: string;
};

export function SettingsSurface({ menuLabel, onOpenMenu }: SettingsSurfaceProps) {
  const settingsModel = getSettingsSurfaceModel();
  const activeTab = useModel(settingsModel.activeTab).value;
  const setActiveTab = (update: React.SetStateAction<SettingsTab>) => settingsModel.activeTab.set(update);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
        <Button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 md:hidden" aria-label={menuLabel} onClick={onOpenMenu}>
          <Menu aria-hidden="true" className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold">설정</h1>
          <p className="text-xs text-zinc-500">settings.json 항목별 설정</p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-zinc-800 p-3 md:block">
          <SettingsMenu activeTab={activeTab} onSelect={setActiveTab} />
        </aside>
        <section className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:hidden">
            <SettingsMenu activeTab={activeTab} onSelect={setActiveTab} />
          </div>
          {activeTab === "modelCatalog" ? <ModelCatalogSettingsTab /> : null}
          {activeTab === "embedding" ? <EmbeddingModelSettingsTab /> : null}
          {activeTab === "runtime" ? <RuntimeSettingsTab /> : null}
          {activeTab === "tools" ? <ToolSettingsTab /> : null}
          {activeTab === "hooks" ? <HookSettingsTab /> : null}
          {activeTab === "selfcheck" ? <SelfcheckSettingsTab /> : null}
          {activeTab === "websearch" ? <WebSearchSettingsTab /> : null}
          {activeTab === "other" ? <OtherSettingsTab /> : null}
          {activeTab === "modelPatch" ? <ModelPatchSettingsTab /> : null}
        </section>
      </div>
    </main>
  );
}

function SettingsMenu({ activeTab, onSelect }: { activeTab: SettingsTab; onSelect: (tab: SettingsTab) => void }) {
  const tabs: Array<{ id: SettingsTab; icon: React.ReactNode; label: string }> = [
    { id: "modelCatalog", icon: <Bot aria-hidden="true" className="h-4 w-4" />, label: "모델" },
    { id: "embedding", icon: <Database aria-hidden="true" className="h-4 w-4" />, label: "임베딩 모델" },
    { id: "runtime", icon: <Gauge aria-hidden="true" className="h-4 w-4" />, label: "런타임" },
    { id: "tools", icon: <Wrench aria-hidden="true" className="h-4 w-4" />, label: "도구" },
    { id: "hooks", icon: <ShieldCheck aria-hidden="true" className="h-4 w-4" />, label: "훅" },
    { id: "selfcheck", icon: <ClipboardCheck aria-hidden="true" className="h-4 w-4" />, label: "자체 점검" },
    { id: "websearch", icon: <Search aria-hidden="true" className="h-4 w-4" />, label: "웹 검색" },
    { id: "modelPatch", icon: <FolderSearch aria-hidden="true" className="h-4 w-4" />, label: "모델 패치" },
    { id: "other", icon: <Braces aria-hidden="true" className="h-4 w-4" />, label: "기타 JSON" }
  ];
  return (
    <>
      {tabs.map((tab) => (
        <SettingsTabButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} onClick={() => onSelect(tab.id)} />
      ))}
    </>
  );
}

function SettingsTabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button type="button" className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium ${active ? "bg-emerald-950/50 text-emerald-200" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`} aria-pressed={active} onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

function ModelCatalogSettingsTab() {
  const [settings, setSettings] = useSettingsState<NDXAgentWebSettingsDocument | undefined>("modelCatalog.settings", undefined);
  const [bundles, setBundles] = useSettingsState<EmbeddingProviderBundle[]>("modelCatalog.bundles", []);
  const [defaultModelKey, setDefaultModelKey] = useSettingsState("modelCatalog.defaultModelKey", "");
  const [pending, setPending] = useSettingsState("modelCatalog.pending", "");
  const [error, setError] = useSettingsState("modelCatalog.error", "");
  const [message, setMessage] = useSettingsState("modelCatalog.message", "");

  const refresh = React.useCallback(async () => {
    const [nextSettings, providers] = await Promise.all([getWebSettings(), listWebProviders()]);
    const nextBundles: EmbeddingProviderBundle[] = [];
    for (const provider of providers) {
      nextBundles.push({ provider, models: await listWebProviderModels(provider.title) });
    }
    setSettings(nextSettings);
    setDefaultModelKey(nextSettings.defaultModelKey);
    setBundles(nextBundles);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void refresh().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "모델 설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => { cancelled = true; };
  }, [refresh]);

  const saveDefaultModel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("save-default-model");
    setError("");
    setMessage("");
    void updateWebSettings({ defaultModelKey }).then((response) => {
      setSettings(response.settings);
      setDefaultModelKey(response.settings.defaultModelKey);
      setMessage("기본 모델 키를 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "기본 모델 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <SettingsSectionTitle title="모델 설정" description="`providers`, `models`, `model` 항목을 확인하고 기본 모델 키를 저장합니다. 개별 세션 모델 선택은 세션 화면에서 계속 override할 수 있습니다." pending={pending} />
      <form className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4" onSubmit={saveDefaultModel}>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">기본 모델 키</span>
          <Select className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" disabled={Boolean(pending)} value={defaultModelKey} onChange={(event) => setDefaultModelKey(event.target.value)}>
            <option value="">선택 안 함</option>
            {bundles.flatMap(({ models }) => models).map((model) => (
              <option key={`${model.provider}:${model.model}`} value={model.key ?? model.model}>{model.key ?? model.model} · {model.provider}/{model.model}</option>
            ))}
          </Select>
        </label>
        <div className="flex justify-end">
          <SaveButton disabled={Boolean(pending)} label="기본 모델 저장" />
        </div>
      </form>
      <div className="grid gap-3">
        {bundles.map(({ provider, models }) => (
          <section key={provider.title} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-zinc-100">{provider.title}</h3>
              <p className="truncate text-xs text-zinc-500">{provider.url}</p>
            </div>
            <div className="grid gap-2">
              {models.map((model) => (
                <article key={model.model} className="grid gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate font-medium text-zinc-200">{model.model}</span>
                    <StatusPill text={`${model.contextsize.toLocaleString()} ctx`} tone="idle" />
                  </div>
                  <p className="text-xs text-zinc-500">{model.modalities.join(", ")}{model.reasoningEffort ? ` · reasoning ${model.reasoningEffort}` : ""}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <SettingsFeedback error={error} message={message} />
      {settings ? <HelpText>현재 settings.json top-level: {settings.topLevelKeys.join(", ") || "없음"}</HelpText> : null}
    </div>
  );
}

function RuntimeSettingsTab() {
  const [settings, setSettings] = useSettingsState<NDXAgentWebSettingsDocument | undefined>("runtime.settings", undefined);
  const [maxModelIterations, setMaxModelIterations] = useSettingsState("runtime.maxModelIterations", "500");
  const [loopDetectionInterval, setLoopDetectionInterval] = useSettingsState("runtime.loopDetectionInterval", "50");
  const [pending, setPending] = useSettingsState("runtime.pending", "");
  const [error, setError] = useSettingsState("runtime.error", "");
  const [message, setMessage] = useSettingsState("runtime.message", "");

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void getWebSettings().then((response) => {
      if (cancelled) return;
      setSettings(response);
      setMaxModelIterations(String(response.runtime.maxModelIterations));
      setLoopDetectionInterval(String(response.runtime.loopDetectionInterval));
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "런타임 설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => { cancelled = true; };
  }, []);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("save");
    setError("");
    setMessage("");
    void updateWebSettings({
      runtime: {
        maxModelIterations: Number(maxModelIterations),
        loopDetectionInterval: Number(loopDetectionInterval)
      }
    }).then((response) => {
      setSettings(response.settings);
      setMaxModelIterations(String(response.settings.runtime.maxModelIterations));
      setLoopDetectionInterval(String(response.settings.runtime.loopDetectionInterval));
      setMessage("런타임 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "런타임 설정 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <SettingsFormShell title="런타임 설정" description="`runtime.maxModelIterations`, `runtime.loopDetectionInterval`을 편집합니다." pending={pending} error={error} message={message} onSubmit={save}>
      <NumberTextInput label="최대 model/tool 반복 수" value={maxModelIterations} onChange={setMaxModelIterations} min={1} />
      <NumberTextInput label="loop detection hook 실행 간격" value={loopDetectionInterval} onChange={setLoopDetectionInterval} />
      {settings ? <HelpText>`loopDetectionInterval`은 0 이하로 두면 loop detection hook을 실행하지 않습니다.</HelpText> : null}
    </SettingsFormShell>
  );
}

function ToolSettingsTab() {
  const [promptRewriteModel, setPromptRewriteModel] = useSettingsState("tools.promptRewriteModel", "");
  const [modelNames, setModelNames] = useSettingsState<string[]>("tools.modelNames", []);
  const [pending, setPending] = useSettingsState("tools.pending", "");
  const [error, setError] = useSettingsState("tools.error", "");
  const [message, setMessage] = useSettingsState("tools.message", "");

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void (async () => {
      const [settings, providers] = await Promise.all([getWebSettings(), listWebProviders()]);
      const names: string[] = [];
      for (const provider of providers) {
        names.push(...(await listWebProviderModels(provider.title)).map((model) => model.model));
      }
      if (cancelled) return;
      setPromptRewriteModel(settings.tools.prompt_rewrite.model);
      setModelNames([...new Set(names)].sort());
    })().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "도구 설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => { cancelled = true; };
  }, []);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("save");
    setError("");
    setMessage("");
    void updateWebSettings({ tools: { prompt_rewrite: { model: promptRewriteModel } } }).then((response) => {
      setPromptRewriteModel(response.settings.tools.prompt_rewrite.model);
      setMessage("도구 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "도구 설정 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <SettingsFormShell title="도구 설정" description="`tools` 카테고리 안의 runtime 보조 설정을 편집합니다." pending={pending} error={error} message={message} onSubmit={save}>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-200">rewriter.model</span>
        <Input list="prompt-rewrite-models" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" disabled={Boolean(pending)} value={promptRewriteModel} onChange={(event) => setPromptRewriteModel(event.target.value)} placeholder="비우면 세션 모델 사용" />
        <datalist id="prompt-rewrite-models">{modelNames.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
    </SettingsFormShell>
  );
}

function HookSettingsTab() {
  const [maxReasoningLength, setMaxReasoningLength] = useSettingsState("hooks.maxReasoningLength", "240000");
  const [analysisModel, setAnalysisModel] = useSettingsState("hooks.analysisModel", "");
  const [modelNames, setModelNames] = useSettingsState<string[]>("hooks.modelNames", []);
  const [pending, setPending] = useSettingsState("hooks.pending", "");
  const [error, setError] = useSettingsState("hooks.error", "");
  const [message, setMessage] = useSettingsState("hooks.message", "");

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void (async () => {
      const [settings, providers] = await Promise.all([getWebSettings(), listWebProviders()]);
      const names: string[] = [];
      for (const provider of providers) {
        names.push(...(await listWebProviderModels(provider.title)).map((model) => model.model));
      }
      if (cancelled) return;
      setMaxReasoningLength(String(settings.hooks.StreamGuard.MAX_REASONING_LENGTH));
      setAnalysisModel(settings.hooks.StreamGuard.analysisModel);
      setModelNames([...new Set(names)].sort());
    })().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "훅 설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => { cancelled = true; };
  }, []);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("save");
    setError("");
    setMessage("");
    void updateWebSettings({ hooks: { StreamGuard: { MAX_REASONING_LENGTH: Number(maxReasoningLength), analysisModel } } }).then((response) => {
      setMaxReasoningLength(String(response.settings.hooks.StreamGuard.MAX_REASONING_LENGTH));
      setAnalysisModel(response.settings.hooks.StreamGuard.analysisModel);
      setMessage("훅 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "훅 설정 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <SettingsFormShell title="훅 설정" description="`hooks` 카테고리 안의 시스템 훅 설정을 편집합니다." pending={pending} error={error} message={message} onSubmit={save}>
      <NumberTextInput label="StreamGuard.MAX_REASONING_LENGTH" value={maxReasoningLength} onChange={setMaxReasoningLength} min={1} />
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-200">StreamGuard.analysisModel</span>
        <span className="text-xs leading-5 text-zinc-500">비우면 규칙 기반 중단 설명만 사용합니다.</span>
        <Input list="stream-guard-analysis-models" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" disabled={Boolean(pending)} value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)} placeholder="예: qwen3.6-35b-mp" />
        <datalist id="stream-guard-analysis-models">{modelNames.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
    </SettingsFormShell>
  );
}

function SelfcheckSettingsTab() {
  const [enabled, setEnabled] = useSettingsState("selfcheck.enabled", false);
  const [model, setModel] = useSettingsState("selfcheck.model", "");
  const [savedModel, setSavedModel] = useSettingsState("selfcheck.savedModel", "");
  const [modelKeys, setModelKeys] = useSettingsState<string[]>("selfcheck.modelKeys", []);
  const [defaultIntervalMs, setDefaultIntervalMs] = useSettingsState("selfcheck.defaultIntervalMs", "300000");
  const [defaultBatchSize, setDefaultBatchSize] = useSettingsState("selfcheck.defaultBatchSize", "100");
  const [maxLlmAnalysesPerRun, setMaxLlmAnalysesPerRun] = useSettingsState("selfcheck.maxLlmAnalysesPerRun", "20");
  const [maxEvidenceChars, setMaxEvidenceChars] = useSettingsState("selfcheck.maxEvidenceChars", "12000");
  const [selfchecks, setSelfchecks] = useSettingsState<NDXAgentWebSelfcheck[]>("selfcheck.selfchecks", []);
  const [candidates, setCandidates] = useSettingsState<NDXAgentWebSelfcheckCandidate[]>("selfcheck.candidates", []);
  const [cursors, setCursors] = useSettingsState<NDXAgentWebSelfcheckCursor[]>("selfcheck.cursors", []);
  const [runs, setRuns] = useSettingsState<NDXAgentWebSelfcheckRun[]>("selfcheck.runs", []);
  const [statusFilter, setStatusFilter] = useSettingsState("selfcheck.statusFilter", "");
  const [pending, setPending] = useSettingsState("selfcheck.pending", "");
  const [error, setError] = useSettingsState("selfcheck.error", "");
  const [message, setMessage] = useSettingsState("selfcheck.message", "");

  const refresh = React.useCallback(async () => {
    const [settings, providers, nextSelfchecks, nextCandidates, nextCursors, nextRuns] = await Promise.all([
      getWebSettings(),
      listWebProviders(),
      listWebSelfcheck({ status: statusFilter || undefined }),
      listWebSelfcheckCandidates(),
      listWebSelfcheckCursors(),
      listWebSelfcheckRuns()
    ]);
    const keys: string[] = [];
    for (const provider of providers) {
      keys.push(...(await listWebProviderModels(provider.title)).map((item) => item.key ?? item.model));
    }
    setEnabled(settings.selfcheck.enabled);
    setModel(settings.selfcheck.model);
    setSavedModel(settings.selfcheck.model);
    setDefaultIntervalMs(String(settings.selfcheck.defaultIntervalMs));
    setDefaultBatchSize(String(settings.selfcheck.defaultBatchSize));
    setMaxLlmAnalysesPerRun(String(settings.selfcheck.maxLlmAnalysesPerRun));
    setMaxEvidenceChars(String(settings.selfcheck.maxEvidenceChars));
    setModelKeys([...new Set(keys)].sort());
    setSelfchecks(nextSelfchecks);
    setCandidates(nextCandidates);
    setCursors(nextCursors);
    setRuns(nextRuns);
  }, [statusFilter]);

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void refresh().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "자체 점검 정보를 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => { cancelled = true; };
  }, [refresh]);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("save");
    setError("");
    setMessage("");
    void updateWebSettings({
      selfcheck: {
        enabled,
        model,
        defaultIntervalMs: Number(defaultIntervalMs),
        defaultBatchSize: Number(defaultBatchSize),
        maxLlmAnalysesPerRun: Number(maxLlmAnalysesPerRun),
        maxEvidenceChars: Number(maxEvidenceChars)
      }
    }).then((response) => {
      setEnabled(response.settings.selfcheck.enabled);
      setModel(response.settings.selfcheck.model);
      setSavedModel(response.settings.selfcheck.model);
      setDefaultIntervalMs(String(response.settings.selfcheck.defaultIntervalMs));
      setDefaultBatchSize(String(response.settings.selfcheck.defaultBatchSize));
      setMaxLlmAnalysesPerRun(String(response.settings.selfcheck.maxLlmAnalysesPerRun));
      setMaxEvidenceChars(String(response.settings.selfcheck.maxEvidenceChars));
      setMessage("자체 점검 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "자체 점검 설정 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  const run = (mode: "extract" | "analyze" | "all") => {
    if (pending) return;
    if ((mode === "analyze" || mode === "all") && !model.trim()) {
      setError("분석 모델 키를 저장한 뒤 LLM 분석을 실행하세요.");
      setMessage("");
      return;
    }
    if ((mode === "analyze" || mode === "all") && model.trim() !== savedModel.trim()) {
      setError("변경한 분석 모델 키를 먼저 저장한 뒤 LLM 분석을 실행하세요.");
      setMessage("");
      return;
    }
    setPending(`run:${mode}`);
    setError("");
    setMessage("");
    void runWebSelfcheck({ mode, batchSize: Number(defaultBatchSize), maxLlmAnalyses: Number(maxLlmAnalysesPerRun) }).then(async (result) => {
      setMessage(`실행 완료: 후보 ${result.createdCandidates}건, LLM 분석 ${result.llmAnalyses}건, selfcheck ${result.createdChecks}건`);
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "자체 점검 실행에 실패했습니다.")).finally(() => setPending(""));
  };

  const changeStatus = (item: NDXAgentWebSelfcheck, status: NDXAgentWebSelfcheckStatus) => {
    if (pending) return;
    setPending(`status:${item.selfcheckid}`);
    setError("");
    setMessage("");
    void updateWebSelfcheckStatus(item.selfcheckid, status).then(async () => {
      setMessage("selfcheck 상태를 변경했습니다.");
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "selfcheck 상태 변경에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <form className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4" onSubmit={save}>
        <SettingsSectionTitle title="자체 점검 설정" description="도구와 기존 훅 실행 이력을 후보로 추출하고, 설정된 모델이 개선 후보를 분석해 selfcheck에 누적합니다." pending={pending} />
        <label className="flex items-center gap-3 text-sm text-zinc-200">
          <Checkbox type="checkbox" className="h-4 w-4 accent-emerald-500" checked={enabled} disabled={Boolean(pending)} onChange={(event) => setEnabled(event.target.checked)} />
          정기 실행 활성화
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-200">분석 모델 키</span>
          <Input list="selfcheck-models" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" disabled={Boolean(pending)} value={model} onChange={(event) => setModel(event.target.value)} placeholder="settings.models의 key" />
          <datalist id="selfcheck-models">{modelKeys.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
        <div className="grid gap-3 md:grid-cols-4">
          <NumberTextInput label="실행 간격 ms" value={defaultIntervalMs} onChange={setDefaultIntervalMs} min={1} />
          <NumberTextInput label="batch size" value={defaultBatchSize} onChange={setDefaultBatchSize} min={1} />
          <NumberTextInput label="run당 LLM 분석" value={maxLlmAnalysesPerRun} onChange={setMaxLlmAnalysesPerRun} min={0} />
          <NumberTextInput label="evidence 문자 수" value={maxEvidenceChars} onChange={setMaxEvidenceChars} min={1000} />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50" disabled={Boolean(pending)} onClick={() => run("extract")}>
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${pending === "run:extract" ? "animate-spin" : ""}`} />
              후보 추출
            </Button>
            <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50" disabled={Boolean(pending)} onClick={() => run("analyze")}>
              <Bot aria-hidden="true" className="h-4 w-4" />
              LLM 분석
            </Button>
            <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50" disabled={Boolean(pending)} onClick={() => run("all")}>
              <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
              전체 실행
            </Button>
          </div>
          <SaveButton disabled={Boolean(pending)} label="설정 저장" />
        </div>
        <SettingsFeedback error={error} message={message} />
      </form>

      <section className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SettingsSectionTitle title="Selfcheck" description="LLM이 제안한 수동 개선 후보입니다." pending="" />
          <Select className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">전체 상태</option>
            {["open", "reviewing", "accepted", "dismissed", "resolved"].map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
        </div>
        <div className="grid gap-3">
          {selfchecks.map((item) => (
            <article key={item.selfcheckid} className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <StatusPill text={item.subjectkind} tone="idle" />
                    <StatusPill text={item.subjectname} tone="idle" />
                    <StatusPill text={item.severity} tone={item.severity === "high" ? "warn" : "idle"} />
                    <StatusPill text={item.status} tone={item.status === "open" ? "warn" : "ok"} />
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-zinc-100">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{item.summary}</p>
                </div>
                <Select className="h-9 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100" disabled={Boolean(pending)} value={item.status} onChange={(event) => changeStatus(item, event.target.value as NDXAgentWebSelfcheckStatus)}>
                  {["open", "reviewing", "accepted", "dismissed", "resolved"].map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <JsonBlock title="recommendation" value={item.recommendation} />
                <JsonBlock title="evidence" value={item.evidence} />
              </div>
              <p className="text-xs text-zinc-500">occurrence {item.occurrencecount} · confidence {item.confidence ?? "n/a"} · {new Date(item.updatedat).toLocaleString()}</p>
            </article>
          ))}
          {selfchecks.length === 0 ? (
            <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-6 text-center text-sm text-zinc-500">
              <p>표시할 selfcheck 수정 제안이 없습니다.</p>
              {candidates.length > 0 ? (
                <p className="mt-2 text-xs leading-5 text-amber-200">
                  분석 후보 {candidates.length}건이 대기 중입니다. 분석 모델 키를 저장한 뒤 LLM 분석을 실행해야 수정 제안이 생성됩니다.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <SelfcheckCandidateList candidates={candidates} />
        <SelfcheckSmallList title="커서" rows={cursors.map((item) => `${item.analyzer} · ${item.lastdataid} · ${item.laststatus ?? "n/a"}`)} />
        <SelfcheckSmallList title="실행" rows={runs.map((item) => `${item.status} · 후보 ${item.createdcandidates} · LLM ${item.llmanalyses} · ${new Date(item.startedat).toLocaleString()}`)} />
      </div>
    </div>
  );
}

function WebSearchSettingsTab() {
  const [provider, setProvider] = useSettingsState("websearch.provider", "duckduckgo");
  const [apiKey, setApiKey] = useSettingsState("websearch.apiKey", "");
  const [baseUrl, setBaseUrl] = useSettingsState("websearch.baseUrl", "");
  const [method, setMethod] = useSettingsState("websearch.method", "");
  const [queryParam, setQueryParam] = useSettingsState("websearch.queryParam", "");
  const [providersJson, setProvidersJson] = useSettingsState("websearch.providersJson", "{}");
  const [pending, setPending] = useSettingsState("websearch.pending", "");
  const [error, setError] = useSettingsState("websearch.error", "");
  const [message, setMessage] = useSettingsState("websearch.message", "");

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void getWebSettings().then((settings) => {
      if (cancelled) return;
      setProvider(settings.websearch.provider);
      setApiKey(settings.websearch.apiKey);
      setBaseUrl(settings.websearch.baseUrl);
      setMethod(settings.websearch.method);
      setQueryParam(settings.websearch.queryParam);
      setProvidersJson(settings.websearch.providersJson);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "웹 검색 설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => { cancelled = true; };
  }, []);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("save");
    setError("");
    setMessage("");
    void updateWebSettings({ websearch: { provider, apiKey, baseUrl, method, queryParam, providersJson } }).then((response) => {
      setProvider(response.settings.websearch.provider);
      setApiKey(response.settings.websearch.apiKey);
      setBaseUrl(response.settings.websearch.baseUrl);
      setMethod(response.settings.websearch.method);
      setQueryParam(response.settings.websearch.queryParam);
      setProvidersJson(response.settings.websearch.providersJson);
      setMessage("웹 검색 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "웹 검색 설정 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <SettingsFormShell title="웹 검색 설정" description="`websearch` 카테고리를 편집합니다. DuckDuckGo 외 provider는 API key나 provider별 설정이 필요합니다." pending={pending} error={error} message={message} onSubmit={save}>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-200">provider</span>
        <Select className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" disabled={Boolean(pending)} value={provider} onChange={(event) => setProvider(event.target.value)}>
          {["duckduckgo", "tavily", "exa", "brave", "bing", "you", "jina", "mojeek", "linkup", "custom"].map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </label>
      <TextInput label="apiKey" description="top-level websearch.apiKey입니다. provider별 키가 필요하면 아래 providers JSON을 사용하세요." value={apiKey} onChange={setApiKey} placeholder="비워두면 환경변수 또는 provider별 설정 사용" />
      <TextInput label="baseUrl" description="custom provider 기본 URL입니다." value={baseUrl} onChange={setBaseUrl} placeholder="https://search.example/api" />
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="method" description="custom provider 요청 방식입니다." value={method} onChange={setMethod} placeholder="GET 또는 POST" />
        <TextInput label="queryParam" description="custom provider query parameter 이름입니다." value={queryParam} onChange={setQueryParam} placeholder="q" />
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-200">providers JSON</span>
        <Textarea className="min-h-40 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100" disabled={Boolean(pending)} value={providersJson} onChange={(event) => setProvidersJson(event.target.value)} />
      </label>
    </SettingsFormShell>
  );
}

function OtherSettingsTab() {
  const [version, setVersion] = useSettingsState("other.version", "");
  const [otherJson, setOtherJson] = useSettingsState("other.otherJson", "{}");
  const [pending, setPending] = useSettingsState("other.pending", "");
  const [error, setError] = useSettingsState("other.error", "");
  const [message, setMessage] = useSettingsState("other.message", "");

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void getWebSettings().then((settings) => {
      if (cancelled) return;
      setVersion(settings.version);
      setOtherJson(settings.otherJson);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "기타 설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => { cancelled = true; };
  }, []);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("save");
    setError("");
    setMessage("");
    void updateWebSettings({ version, otherJson }).then((response) => {
      setVersion(response.settings.version);
      setOtherJson(response.settings.otherJson);
      setMessage("기타 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "기타 설정 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <SettingsFormShell title="기타 JSON" description="코드에서 별도 메뉴로 분류되지 않은 settings.json top-level 항목을 보존/편집합니다." pending={pending} error={error} message={message} onSubmit={save}>
      <TextInput label="version" description="settings.json 문서 버전입니다." value={version} onChange={setVersion} placeholder="0.1.41" />
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-200">기타 top-level JSON</span>
        <Textarea className="min-h-72 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100" disabled={Boolean(pending)} value={otherJson} onChange={(event) => setOtherJson(event.target.value)} />
      </label>
    </SettingsFormShell>
  );
}

function EmbeddingModelSettingsTab() {
  const [bundles, setBundles] = useSettingsState<EmbeddingProviderBundle[]>("embedding.bundles", []);
  const [embeddings, setEmbeddings] = useSettingsState<NDXAgentWebEmbeddingSettings | undefined>("embedding.embeddings", undefined);
  const [providerFormOpen, setProviderFormOpen] = useSettingsState("embedding.providerFormOpen", false);
  const [providerTitle, setProviderTitle] = useSettingsState("embedding.providerTitle", "");
  const [providerUrl, setProviderUrl] = useSettingsState("embedding.providerUrl", "");
  const [providerToken, setProviderToken] = useSettingsState("embedding.providerToken", "");
  const [editProvider, setEditProvider] = useSettingsState<ProviderEditDraft | undefined>("embedding.editProvider", undefined);
  const [modelProvider, setModelProvider] = useSettingsState("embedding.modelProvider", "");
  const [modelName, setModelName] = useSettingsState("embedding.modelName", "");
  const [pending, setPending] = useSettingsState("embedding.pending", "");
  const [error, setError] = useSettingsState("embedding.error", "");
  const [message, setMessage] = useSettingsState("embedding.message", "");
  const locked = Boolean(pending);

  const refresh = React.useCallback(async () => {
    const [providers, current] = await Promise.all([listWebProviders(), getWebEmbeddingSettings()]);
    const nextBundles: EmbeddingProviderBundle[] = [];
    for (const provider of providers) {
      nextBundles.push({ provider, models: await listWebProviderEmbeddingModels(provider.title) });
    }
    setBundles(nextBundles);
    setEmbeddings(current);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void refresh().catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "임베딩 모델 설정을 불러오지 못했습니다.");
    }).finally(() => {
      if (!cancelled) setPending("");
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const addProvider = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = providerTitle.trim();
    const url = providerUrl.trim();
    if (!title || !url || locked) {
      setError("프로바이더 이름과 Base URL이 필요합니다.");
      return;
    }
    setPending(`provider-add:${title}`);
    setError("");
    setMessage("");
    void createWebProvider({ title, type: "openai", url, token: providerToken.trim(), skipSync: true }).then(async () => {
      await syncWebProviderEmbeddingModels(title).catch(() => ({ models: [], syncError: "sync failed" }));
      setProviderTitle("");
      setProviderUrl("");
      setProviderToken("");
      setProviderFormOpen(false);
      setMessage("프로바이더를 추가했습니다.");
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "프로바이더 추가에 실패했습니다.")).finally(() => setPending(""));
  };

  const saveProvider = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editProvider || locked) return;
    if (!editProvider.title.trim() || !editProvider.url.trim()) {
      setError("프로바이더 이름과 Base URL이 필요합니다.");
      return;
    }
    setPending(`provider-edit:${editProvider.title}`);
    setError("");
    setMessage("");
    void updateWebProvider(editProvider.title, { type: "openai", url: editProvider.url.trim(), token: editProvider.token }).then(async () => {
      setEditProvider(undefined);
      setMessage("프로바이더 설정을 저장했습니다.");
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "프로바이더 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  const removeProvider = (provider: string) => {
    if (locked) return;
    setPending(`provider-delete:${provider}`);
    setError("");
    setMessage("");
    void deleteWebProvider(provider).then(async () => {
      setMessage("프로바이더를 삭제했습니다.");
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "프로바이더 삭제에 실패했습니다.")).finally(() => setPending(""));
  };

  const syncProvider = (provider: string) => {
    if (locked) return;
    setPending(`provider-sync:${provider}`);
    setError("");
    setMessage("");
    void syncWebProviderEmbeddingModels(provider).then(async (result) => {
      setMessage(result.syncError ? result.syncError : "임베딩 모델 목록을 동기화했습니다.");
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "임베딩 모델 동기화에 실패했습니다.")).finally(() => setPending(""));
  };

  const addModel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const provider = modelProvider.trim();
    const model = modelName.trim();
    if (!provider || !model || locked) return;
    if (!isEmbeddingModelName(model)) {
      setError("임베딩 모델 이름에는 embedding이 포함되어야 합니다.");
      return;
    }
    setPending(`model-add:${provider}`);
    setError("");
    setMessage("");
    void createWebProviderEmbeddingModel(provider, { model }).then(async () => {
      setModelProvider("");
      setModelName("");
      setMessage("임베딩 모델을 추가했습니다.");
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "임베딩 모델 추가에 실패했습니다.")).finally(() => setPending(""));
  };

  const selectModel = (provider: string, model: string) => {
    if (locked) return;
    setPending(`embedding-select:${provider}:${model}`);
    setError("");
    setMessage("");
    void updateWebEmbeddingSettings({ provider, model }).then((response) => {
      setEmbeddings(response.embeddings);
      setMessage("임베딩 모델 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "임베딩 모델 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  const removeModel = (provider: string, model: string) => {
    if (locked) return;
    setPending(`model-delete:${provider}:${model}`);
    setError("");
    setMessage("");
    void deleteWebProviderModel(provider, model).then(async () => {
      setMessage("임베딩 모델을 삭제했습니다.");
      await refresh();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "임베딩 모델 삭제에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">임베딩 모델 설정</h2>
        <p className="max-w-3xl text-sm leading-6 text-zinc-400">세션 검색 임베딩에 사용할 provider와 model을 `settings.json`의 `embeddings` 값으로 저장합니다.</p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill text={embeddings ? `${embeddings.provider} / ${embeddings.model}` : "아직 선택 안 됨"} tone={embeddings ? "ok" : "idle"} />
          {locked ? <StatusPill text="처리 중" tone="idle" /> : null}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">프로바이더</h3>
            <p className="mt-1 text-sm text-zinc-500">OpenAI 호환 embeddings endpoint를 제공하는 Base URL을 등록합니다.</p>
          </div>
          <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={locked} onClick={() => setProviderFormOpen((open) => !open)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            프로바이더 추가
          </Button>
        </div>
        {providerFormOpen ? (
          <form className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3" onSubmit={addProvider}>
            <div className="grid gap-2 md:grid-cols-3">
              <Input aria-label="프로바이더 이름" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50" disabled={locked} placeholder="프로바이더 이름" value={providerTitle} onChange={(event) => setProviderTitle(event.target.value)} />
              <Input aria-label="Base URL" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50 md:col-span-2" disabled={locked} placeholder="Base URL" value={providerUrl} onChange={(event) => setProviderUrl(event.target.value)} />
              <Input aria-label="API token" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50 md:col-span-3" disabled={locked} placeholder="API token" value={providerToken} onChange={(event) => setProviderToken(event.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300" aria-label="닫기" disabled={locked} onClick={() => setProviderFormOpen(false)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
              <Button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={locked}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                추가
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      <div className="grid gap-3">
        {bundles.length === 0 && !locked ? <p className="rounded-md border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-sm text-zinc-500">등록된 프로바이더가 없습니다.</p> : null}
        {bundles.map(({ provider, models }) => {
          const editing = editProvider?.title === provider.title;
          const addingModel = modelProvider === provider.title;
          return (
            <section key={provider.title} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-zinc-100">{provider.title}</h3>
                  <p className="truncate text-xs text-zinc-500">{provider.url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="모델 동기화" disabled={locked} onClick={() => syncProvider(provider.title)}>
                    {pending === `provider-sync:${provider.title}` ? <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                  </Button>
                  <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="모델 추가" disabled={locked} onClick={() => { setModelProvider(addingModel ? "" : provider.title); setModelName(""); }}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="프로바이더 편집" disabled={locked} onClick={() => setEditProvider(editing ? undefined : { title: provider.title, url: provider.url, token: provider.token })}>
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="프로바이더 삭제" disabled={locked} onClick={() => removeProvider(provider.title)}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {editing && editProvider ? (
                <form className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3" onSubmit={saveProvider}>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input aria-label="프로바이더 이름" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-400" value={editProvider.title} readOnly />
                    <Input aria-label="Base URL" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 md:col-span-2" disabled={locked} value={editProvider.url} onChange={(event) => setEditProvider({ ...editProvider, url: event.target.value })} />
                    <Input aria-label="API token" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 md:col-span-3" disabled={locked} value={editProvider.token} onChange={(event) => setEditProvider({ ...editProvider, token: event.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300" aria-label="닫기" disabled={locked} onClick={() => setEditProvider(undefined)}>
                      <X aria-hidden="true" className="h-4 w-4" />
                    </Button>
                    <Button type="submit" className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={locked}>저장</Button>
                  </div>
                </form>
              ) : null}

              {addingModel ? (
                <form className="flex min-w-0 flex-wrap gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3" onSubmit={addModel}>
                  <Input aria-label="임베딩 모델 이름" className="h-10 min-w-64 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50" disabled={locked} placeholder="text-embedding-3-small" value={modelName} onChange={(event) => setModelName(event.target.value)} />
                  <Button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={locked}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    추가
                  </Button>
                </form>
              ) : null}

              {models.length === 0 ? <p className="text-sm text-zinc-500">`embedding`이 들어간 모델이 없습니다.</p> : null}
              <div className="grid gap-2">
                {models.map((model) => {
                  const selected = embeddings?.provider === provider.title && embeddings.model === model.model;
                  return (
                    <article key={model.model} className={selected ? "flex min-w-0 items-center justify-between gap-3 rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100" : "flex min-w-0 items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"}>
                      <Button type="button" className="min-w-0 flex-1 truncate text-left disabled:opacity-50" disabled={locked} onClick={() => selectModel(provider.title, model.model)}>
                        {model.model}
                      </Button>
                      <div className="flex shrink-0 items-center gap-2">
                        {selected ? <StatusPill text="사용 중" tone="ok" /> : null}
                        <Button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="모델 삭제" disabled={locked} onClick={() => removeModel(provider.title, model.model)}>
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {error ? <p className="rounded-md border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {message ? <p className="rounded-md border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}
    </div>
  );
}

function isEmbeddingModelName(value: string): boolean {
  return value.toLowerCase().includes("embedding");
}
