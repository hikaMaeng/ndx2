import React from "react";
import { Bot, Braces, CheckCircle2, Database, Download, FileCode2, FolderOpen, FolderSearch, Gauge, Menu, Pencil, Plus, RefreshCw, RotateCw, Save, Search, ShieldCheck, Trash2, Undo2, Wrench, X } from "lucide-react";
import type { NDXAgentModelFolderPatchDraftResponse, NDXAgentModelFolderPatchManifest, NDXAgentWebEmbeddingSettings, NDXAgentWebModel, NDXAgentWebProvider, NDXAgentWebSettingsDocument } from "ndx/webclient/common";
import { createWebProvider, createWebProviderEmbeddingModel, deleteWebProvider, deleteWebProviderModel, getWebEmbeddingSettings, getWebSettings, listWebProviderEmbeddingModels, listWebProviderModels, listWebProviders, syncWebProviderEmbeddingModels, updateWebEmbeddingSettings, updateWebProvider, updateWebSettings } from "ndx/webclient/front";
import { draftModelFolderPatch } from "./modelPatchApi";

type SettingsSurfaceProps = {
  menuLabel: string;
  onOpenMenu: () => void;
};

type LocalFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }>;
};

type LocalDirectoryHandle = {
  name: string;
  values: () => AsyncIterable<LocalFileHandle | { name: string; kind?: string }>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<LocalFileHandle>;
  removeEntry?: (name: string) => Promise<void>;
  queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

type LocalFolderSnapshot = {
  name: string;
  ggufFiles: string[];
  existingModelYaml?: string;
};

type SettingsTab = "modelCatalog" | "modelPatch" | "embedding" | "runtime" | "tools" | "hooks" | "websearch" | "other";
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
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("modelCatalog");
  const [modelFolder, setModelFolder] = React.useState<LocalFolderSnapshot | undefined>();
  const [targetFolderName, setTargetFolderName] = React.useState("");
  const [targetHandle, setTargetHandle] = React.useState<LocalDirectoryHandle | undefined>();
  const [publisher, setPublisher] = React.useState("local");
  const [baseModelKey, setBaseModelKey] = React.useState("");
  const [aliasModelKey, setAliasModelKey] = React.useState("");
  const [template, setTemplate] = React.useState("");
  const [draft, setDraft] = React.useState<NDXAgentModelFolderPatchDraftResponse | undefined>();
  const [pending, setPending] = React.useState<"model" | "target" | "draft" | "write" | "restore" | "">("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const hasDirectoryPicker = typeof window !== "undefined" && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

  const selectModelFolder = () => {
    setError("");
    setMessage("");
    const picker = (window as Window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<LocalDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      setError("이 브라우저는 로컬 폴더 선택을 지원하지 않습니다. Chromium 기반 브라우저에서 다시 열어 주세요.");
      return;
    }
    setPending("model");
    void picker({ mode: "read" }).then(async (handle) => {
      const snapshot = await readLocalFolderSnapshot(handle);
      setModelFolder(snapshot);
      const nextPublisher = publisher.trim() || "local";
      setPublisher(nextPublisher);
      setBaseModelKey((current) => current.trim() || `${nextPublisher}/${snapshot.name}`);
      setAliasModelKey((current) => current.trim() || `${nextPublisher}/${slugModelName(snapshot.name)}-ndx`);
      setDraft(undefined);
    }).catch((reason) => {
      if (!isAbortError(reason)) setError(reason instanceof Error ? reason.message : "모델 폴더 선택에 실패했습니다.");
    }).finally(() => setPending(""));
  };
  const selectTargetFolder = () => {
    setError("");
    setMessage("");
    const picker = (window as Window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<LocalDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      setError("이 브라우저는 로컬 폴더 쓰기를 지원하지 않습니다. 파일 다운로드 방식으로 패치하세요.");
      return;
    }
    setPending("target");
    void picker({ mode: "readwrite" }).then((handle) => {
      setTargetHandle(handle);
      setTargetFolderName(handle.name);
    }).catch((reason) => {
      if (!isAbortError(reason)) setError(reason instanceof Error ? reason.message : "패치 대상 폴더 선택에 실패했습니다.");
    }).finally(() => setPending(""));
  };
  const createDraft = () => {
    if (!modelFolder || pending) return;
    setPending("draft");
    setError("");
    setMessage("");
    void readTargetModelYaml(targetHandle).then((targetModelYaml) => draftModelFolderPatch({
      folderName: modelFolder.name,
      publisher,
      baseModelKey,
      aliasModelKey,
      ggufFiles: modelFolder.ggufFiles,
      existingModelYaml: targetModelYaml ?? modelFolder.existingModelYaml,
      template: template.trim() || undefined
    })).then(setDraft).catch((reason) => setError(reason instanceof Error ? reason.message : "패치 파일 생성에 실패했습니다.")).finally(() => setPending(""));
  };
  const writeDraftToTarget = () => {
    if (!draft || !targetHandle || pending) return;
    setPending("write");
    setError("");
    setMessage("");
    void writeLocalPatch(targetHandle, draft).then(() => setMessage("선택한 대상 폴더에 model.yaml, ndx-model-patch.json, 백업 파일을 기록했습니다.")).catch((reason) => setError(reason instanceof Error ? reason.message : "로컬 폴더 쓰기에 실패했습니다.")).finally(() => setPending(""));
  };
  const restoreTarget = () => {
    if (!targetHandle || pending) return;
    setPending("restore");
    setError("");
    setMessage("");
    void restoreLocalPatch(targetHandle).then(setMessage).catch((reason) => setError(reason instanceof Error ? reason.message : "복구에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 md:hidden" aria-label={menuLabel} onClick={onOpenMenu}>
          <Menu aria-hidden="true" className="h-4 w-4" />
        </button>
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
          {activeTab === "websearch" ? <WebSearchSettingsTab /> : null}
          {activeTab === "other" ? <OtherSettingsTab /> : null}
          {activeTab === "modelPatch" ? (
          <div className="mx-auto grid max-w-5xl gap-4">
            <PageIntro hasDirectoryPicker={hasDirectoryPicker} />
            <StepCard
              step="1"
              title="원본 모델 폴더 선택"
              description="GGUF 파일이 들어 있는 모델 폴더를 선택합니다. NDX는 대용량 GGUF를 업로드하지 않고 파일명과 기존 model.yaml만 읽어 패치 대상을 추정합니다."
              done={Boolean(modelFolder)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={Boolean(pending)} onClick={selectModelFolder}>
                  {pending === "model" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FolderOpen aria-hidden="true" className="h-4 w-4" />}
                  원본 모델 폴더 선택
                </button>
                <StatusPill text={modelFolder ? `${modelFolder.name} · GGUF ${modelFolder.ggufFiles.length}개` : "아직 선택 안 됨"} tone={modelFolder ? "ok" : "idle"} />
              </div>
              <HelpText>예: `Step-3.7-Flash-GGUF`처럼 `.gguf` 파일들이 있는 폴더. 이 폴더에는 패치 파일을 직접 쓰지 않는 것을 권장합니다.</HelpText>
            </StepCard>
            <StepCard
              step="2"
              title="패치가 들어갈 LM Studio alias 폴더 선택"
              description="생성된 model.yaml과 복구 정보를 쓸 대상 폴더입니다. 보통 LM Studio hub/models 아래에 만들 alias 폴더를 선택합니다."
              done={Boolean(targetHandle)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={Boolean(pending)} onClick={selectTargetFolder}>
                  {pending === "target" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FolderOpen aria-hidden="true" className="h-4 w-4" />}
                  패치 대상 폴더 선택
                </button>
                <StatusPill text={targetFolderName || "다운로드만 할 수도 있음"} tone={targetHandle ? "ok" : "idle"} />
              </div>
              <HelpText>자동으로 쓰려면 이 폴더를 선택하세요. 폴더 쓰기가 불안하면 선택하지 말고 아래 다운로드 파일을 직접 복사해도 됩니다.</HelpText>
            </StepCard>
            <StepCard
              step="3"
              title="모델 식별값 확인"
              description="이 값들은 생성될 model.yaml의 alias와 원본 모델 연결에 들어갑니다. 자동 추정값이 틀리면 여기서 고치면 됩니다."
              done={Boolean(modelFolder && publisher.trim() && baseModelKey.trim() && aliasModelKey.trim())}
            >
              <div className="grid gap-3 md:grid-cols-3">
                <TextInput
                  label="publisher"
                  description="alias의 앞부분입니다. LM Studio 목록에서 모델 소유자처럼 보입니다."
                  value={publisher}
                  onChange={setPublisher}
                  placeholder="unsloth"
                />
                <TextInput
                  label="base model key"
                  description="새 alias가 참조할 원본 모델 키입니다. 원본 폴더의 실제 LM Studio 모델 이름과 맞아야 합니다."
                  value={baseModelKey}
                  onChange={setBaseModelKey}
                  placeholder="unsloth/Step-3.7-Flash-GGUF"
                />
                <TextInput
                  label="NDX alias"
                  description="LM Studio에 새로 보일 NDX용 모델 이름입니다. 기존 모델과 겹치지 않게 둡니다."
                  value={aliasModelKey}
                  onChange={setAliasModelKey}
                  placeholder="unsloth/step-3.7-flash-gguf-ndx"
                />
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-zinc-200">Jinja 템플릿</span>
                <span className="text-xs leading-5 text-zinc-500">비워두면 NDX 기본 템플릿을 사용합니다. LM Studio에서 쓰던 커스텀 템플릿을 유지해야 할 때만 붙여넣으세요.</span>
                <textarea className="min-h-28 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="대부분 비워두면 됩니다." />
              </label>
            </StepCard>
            <StepCard
              step="4"
              title="패치 파일 생성"
              description="서버가 입력값을 바탕으로 model.yaml, 백업 파일명, 복구 정보를 계산합니다. 아직 로컬 폴더에는 쓰지 않습니다."
              done={Boolean(draft)}
            >
              <button type="button" className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={!modelFolder || Boolean(pending)} onClick={createDraft}>
                {pending === "draft" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileCode2 aria-hidden="true" className="h-4 w-4" />}
                패치 파일 생성
              </button>
              {draft ? <LocalDraftResult draft={draft} /> : null}
            </StepCard>
            <StepCard
              step="5"
              title="적용하거나 파일로 내려받기"
              description="대상 폴더를 선택했다면 브라우저가 직접 파일을 씁니다. 선택하지 않았다면 다운로드한 파일을 LM Studio alias 폴더에 직접 넣으면 됩니다."
              done={Boolean(message)}
            >
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50" disabled={!draft || !targetHandle || Boolean(pending)} onClick={writeDraftToTarget}>
                  {pending === "write" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                  선택 폴더에 쓰기
                </button>
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!draft} onClick={() => draft ? downloadText(draft.modelYamlFileName, draft.modelYaml) : undefined}>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  model.yaml 다운로드
                </button>
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!draft} onClick={() => draft ? downloadText(draft.manifestFileName, JSON.stringify(draft.manifest, null, 2)) : undefined}>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  복구정보 다운로드
                </button>
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!draft?.backupFileName || !draft.backupContents} onClick={() => draft?.backupFileName && draft.backupContents ? downloadText(draft.backupFileName, draft.backupContents) : undefined}>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  백업 다운로드
                </button>
                <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!targetHandle || Boolean(pending)} onClick={restoreTarget}>
                  {pending === "restore" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Undo2 aria-hidden="true" className="h-4 w-4" />}
                  선택 폴더 복구
                </button>
              </div>
              <HelpText>`선택 폴더에 쓰기`는 기존 model.yaml이 있으면 먼저 백업을 만들고, `ndx-model-patch.json`에 복구 정보를 남깁니다. 복구 버튼은 이 정보를 사용합니다.</HelpText>
            </StepCard>
            {error ? <p className="rounded-md border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</p> : null}
            {message ? <p className="rounded-md border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}
          </div>
          ) : null}
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
    <button type="button" className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium ${active ? "bg-emerald-950/50 text-emerald-200" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"}`} aria-pressed={active} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function ModelCatalogSettingsTab() {
  const [settings, setSettings] = React.useState<NDXAgentWebSettingsDocument | undefined>();
  const [bundles, setBundles] = React.useState<EmbeddingProviderBundle[]>([]);
  const [defaultModelKey, setDefaultModelKey] = React.useState("");
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

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
          <select className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" disabled={Boolean(pending)} value={defaultModelKey} onChange={(event) => setDefaultModelKey(event.target.value)}>
            <option value="">선택 안 함</option>
            {bundles.flatMap(({ models }) => models).map((model) => (
              <option key={`${model.provider}:${model.model}`} value={model.key ?? model.model}>{model.key ?? model.model} · {model.provider}/{model.model}</option>
            ))}
          </select>
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
  const [settings, setSettings] = React.useState<NDXAgentWebSettingsDocument | undefined>();
  const [maxModelIterations, setMaxModelIterations] = React.useState("500");
  const [loopDetectionInterval, setLoopDetectionInterval] = React.useState("50");
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

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
  const [promptRewriteModel, setPromptRewriteModel] = React.useState("");
  const [modelNames, setModelNames] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

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
        <input list="prompt-rewrite-models" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" disabled={Boolean(pending)} value={promptRewriteModel} onChange={(event) => setPromptRewriteModel(event.target.value)} placeholder="비우면 세션 모델 사용" />
        <datalist id="prompt-rewrite-models">{modelNames.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
    </SettingsFormShell>
  );
}

function HookSettingsTab() {
  const [maxReasoningLength, setMaxReasoningLength] = React.useState("240000");
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setPending("load");
    void getWebSettings().then((settings) => {
      if (!cancelled) setMaxReasoningLength(String(settings.hooks.StreamGuard.MAX_REASONING_LENGTH));
    }).catch((reason) => {
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
    void updateWebSettings({ hooks: { StreamGuard: { MAX_REASONING_LENGTH: Number(maxReasoningLength) } } }).then((response) => {
      setMaxReasoningLength(String(response.settings.hooks.StreamGuard.MAX_REASONING_LENGTH));
      setMessage("훅 설정을 저장했습니다.");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "훅 설정 저장에 실패했습니다.")).finally(() => setPending(""));
  };

  return (
    <SettingsFormShell title="훅 설정" description="`hooks` 카테고리 안의 시스템 훅 설정을 편집합니다." pending={pending} error={error} message={message} onSubmit={save}>
      <NumberTextInput label="StreamGuard.MAX_REASONING_LENGTH" value={maxReasoningLength} onChange={setMaxReasoningLength} min={1} />
    </SettingsFormShell>
  );
}

function WebSearchSettingsTab() {
  const [provider, setProvider] = React.useState("duckduckgo");
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [method, setMethod] = React.useState("");
  const [queryParam, setQueryParam] = React.useState("");
  const [providersJson, setProvidersJson] = React.useState("{}");
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

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
        <select className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100" disabled={Boolean(pending)} value={provider} onChange={(event) => setProvider(event.target.value)}>
          {["duckduckgo", "tavily", "exa", "brave", "bing", "you", "jina", "mojeek", "linkup", "custom"].map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <TextInput label="apiKey" description="top-level websearch.apiKey입니다. provider별 키가 필요하면 아래 providers JSON을 사용하세요." value={apiKey} onChange={setApiKey} placeholder="비워두면 환경변수 또는 provider별 설정 사용" />
      <TextInput label="baseUrl" description="custom provider 기본 URL입니다." value={baseUrl} onChange={setBaseUrl} placeholder="https://search.example/api" />
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="method" description="custom provider 요청 방식입니다." value={method} onChange={setMethod} placeholder="GET 또는 POST" />
        <TextInput label="queryParam" description="custom provider query parameter 이름입니다." value={queryParam} onChange={setQueryParam} placeholder="q" />
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-zinc-200">providers JSON</span>
        <textarea className="min-h-40 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100" disabled={Boolean(pending)} value={providersJson} onChange={(event) => setProvidersJson(event.target.value)} />
      </label>
    </SettingsFormShell>
  );
}

function OtherSettingsTab() {
  const [version, setVersion] = React.useState("");
  const [otherJson, setOtherJson] = React.useState("{}");
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");

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
        <textarea className="min-h-72 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100" disabled={Boolean(pending)} value={otherJson} onChange={(event) => setOtherJson(event.target.value)} />
      </label>
    </SettingsFormShell>
  );
}

function EmbeddingModelSettingsTab() {
  const [bundles, setBundles] = React.useState<EmbeddingProviderBundle[]>([]);
  const [embeddings, setEmbeddings] = React.useState<NDXAgentWebEmbeddingSettings | undefined>();
  const [providerFormOpen, setProviderFormOpen] = React.useState(false);
  const [providerTitle, setProviderTitle] = React.useState("");
  const [providerUrl, setProviderUrl] = React.useState("");
  const [providerToken, setProviderToken] = React.useState("");
  const [editProvider, setEditProvider] = React.useState<ProviderEditDraft | undefined>();
  const [modelProvider, setModelProvider] = React.useState("");
  const [modelName, setModelName] = React.useState("");
  const [pending, setPending] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
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
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={locked} onClick={() => setProviderFormOpen((open) => !open)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            프로바이더 추가
          </button>
        </div>
        {providerFormOpen ? (
          <form className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3" onSubmit={addProvider}>
            <div className="grid gap-2 md:grid-cols-3">
              <input aria-label="프로바이더 이름" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50" disabled={locked} placeholder="프로바이더 이름" value={providerTitle} onChange={(event) => setProviderTitle(event.target.value)} />
              <input aria-label="Base URL" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50 md:col-span-2" disabled={locked} placeholder="Base URL" value={providerUrl} onChange={(event) => setProviderUrl(event.target.value)} />
              <input aria-label="API token" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50 md:col-span-3" disabled={locked} placeholder="API token" value={providerToken} onChange={(event) => setProviderToken(event.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300" aria-label="닫기" disabled={locked} onClick={() => setProviderFormOpen(false)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
              <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={locked}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                추가
              </button>
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
                  <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="모델 동기화" disabled={locked} onClick={() => syncProvider(provider.title)}>
                    {pending === `provider-sync:${provider.title}` ? <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                  </button>
                  <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="모델 추가" disabled={locked} onClick={() => { setModelProvider(addingModel ? "" : provider.title); setModelName(""); }}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="프로바이더 편집" disabled={locked} onClick={() => setEditProvider(editing ? undefined : { title: provider.title, url: provider.url, token: provider.token })}>
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="프로바이더 삭제" disabled={locked} onClick={() => removeProvider(provider.title)}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {editing && editProvider ? (
                <form className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3" onSubmit={saveProvider}>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input aria-label="프로바이더 이름" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-400" value={editProvider.title} readOnly />
                    <input aria-label="Base URL" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 md:col-span-2" disabled={locked} value={editProvider.url} onChange={(event) => setEditProvider({ ...editProvider, url: event.target.value })} />
                    <input aria-label="API token" className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 md:col-span-3" disabled={locked} value={editProvider.token} onChange={(event) => setEditProvider({ ...editProvider, token: event.target.value })} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300" aria-label="닫기" disabled={locked} onClick={() => setEditProvider(undefined)}>
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button type="submit" className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={locked}>저장</button>
                  </div>
                </form>
              ) : null}

              {addingModel ? (
                <form className="flex min-w-0 flex-wrap gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3" onSubmit={addModel}>
                  <input aria-label="임베딩 모델 이름" className="h-10 min-w-64 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 disabled:opacity-50" disabled={locked} placeholder="text-embedding-3-small" value={modelName} onChange={(event) => setModelName(event.target.value)} />
                  <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={locked}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    추가
                  </button>
                </form>
              ) : null}

              {models.length === 0 ? <p className="text-sm text-zinc-500">`embedding`이 들어간 모델이 없습니다.</p> : null}
              <div className="grid gap-2">
                {models.map((model) => {
                  const selected = embeddings?.provider === provider.title && embeddings.model === model.model;
                  return (
                    <article key={model.model} className={selected ? "flex min-w-0 items-center justify-between gap-3 rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100" : "flex min-w-0 items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"}>
                      <button type="button" className="min-w-0 flex-1 truncate text-left disabled:opacity-50" disabled={locked} onClick={() => selectModel(provider.title, model.model)}>
                        {model.model}
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        {selected ? <StatusPill text="사용 중" tone="ok" /> : null}
                        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-50" aria-label="모델 삭제" disabled={locked} onClick={() => removeModel(provider.title, model.model)}>
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
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

function PageIntro({ hasDirectoryPicker }: { hasDirectoryPicker: boolean }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-semibold">NDX용 LM Studio 모델 패치</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">이 도구는 기존 GGUF 모델을 건드리지 않고, LM Studio에 NDX 전용 alias 모델을 하나 더 보이게 하는 model.yaml을 만듭니다. 목적은 낮은 thinking 설정에서 &lt;think&gt; 채널을 열지 않는 템플릿을 적용하는 것입니다.</p>
      </div>
      <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">
        <p className="font-medium text-zinc-100">따라 할 절차</p>
        <p>1. 원본 GGUF 모델 폴더를 고릅니다. 2. `model.yaml`을 둘 LM Studio alias 폴더를 고릅니다. 3. 자동 입력된 모델 이름을 확인합니다. 4. 패치 파일을 생성합니다. 5. 폴더에 직접 쓰거나 다운로드해서 복사합니다.</p>
        <p className="text-xs leading-5 text-zinc-500">브라우저 보안 때문에 서버는 임의 로컬 폴더를 직접 고칠 수 없습니다. 파일 읽기와 쓰기는 사용자가 허가한 브라우저 권한으로만 수행됩니다.</p>
        <span className={`w-fit rounded-full border px-2 py-1 text-xs font-semibold ${hasDirectoryPicker ? "border-emerald-700 bg-emerald-950/50 text-emerald-200" : "border-amber-700 bg-amber-950/50 text-amber-200"}`}>
          {hasDirectoryPicker ? "현재 브라우저: 로컬 폴더 선택 가능" : "현재 브라우저: 폴더 선택 미지원, 다운로드 방식만 사용"}
        </span>
      </div>
    </section>
  );
}

function StepCard({ step, title, description, done, children }: { step: string; title: string; description: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
      <div className="flex gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${done ? "border-emerald-700 bg-emerald-950/60 text-emerald-200" : "border-zinc-700 bg-zinc-950 text-zinc-300"}`}>
          {done ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : step}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p>
        </div>
      </div>
      <div className="grid gap-3 pl-0 md:pl-11">{children}</div>
    </section>
  );
}

function TextInput({ label, description, value, onChange, placeholder }: { label: string; description: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <span className="text-xs leading-5 text-zinc-500">{description}</span>
      <input className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function NumberTextInput({ label, value, onChange, min }: { label: string; value: string; onChange: (value: string) => void; min?: number }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <input type="number" min={min} step={1} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SettingsSectionTitle({ title, description, pending }: { title: string; description: string; pending: string }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-3xl text-sm leading-6 text-zinc-400">{description}</p>
      {pending ? <StatusPill text="처리 중" tone="idle" /> : null}
    </section>
  );
}

function SettingsFormShell({ title, description, pending, error, message, onSubmit, children }: { title: string; description: string; pending: string; error: string; message: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return (
    <form className="mx-auto grid max-w-5xl gap-4" onSubmit={onSubmit}>
      <SettingsSectionTitle title={title} description={description} pending={pending} />
      <section className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
        {children}
        <div className="flex justify-end">
          <SaveButton disabled={Boolean(pending)} label="저장" />
        </div>
      </section>
      <SettingsFeedback error={error} message={message} />
    </form>
  );
}

function SaveButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={disabled}>
      <Save aria-hidden="true" className="h-4 w-4" />
      {label}
    </button>
  );
}

function SettingsFeedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error ? <p className="rounded-md border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {message ? <p className="rounded-md border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}
    </>
  );
}

function StatusPill({ text, tone }: { text: string; tone: "ok" | "idle" }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${tone === "ok" ? "border-emerald-700 bg-emerald-950/50 text-emerald-200" : "border-zinc-700 bg-zinc-950 text-zinc-400"}`}>
      {text}
    </span>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs leading-5 text-zinc-400">{children}</p>;
}

function LocalDraftResult({ draft }: { draft: NDXAgentModelFolderPatchDraftResponse }) {
  return (
    <section className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">생성 결과</h3>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${draft.status === "patched" ? "border-emerald-700 bg-emerald-950/60 text-emerald-200" : "border-amber-700 bg-amber-950/60 text-amber-200"}`}>
          {draft.status === "patched" ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : null}
          {draft.status === "patched" ? "이미 패치됨" : "패치 파일 준비됨"}
        </span>
      </div>
      <dl className="grid gap-2 text-sm md:grid-cols-[150px_minmax(0,1fr)]">
        <ResultRow label="참조 원본" value={draft.baseModelKey} />
        <ResultRow label="새 alias" value={draft.aliasModelKey} />
        <ResultRow label="생성 파일" value={`${draft.modelYamlFileName}, ${draft.manifestFileName}${draft.backupFileName ? `, ${draft.backupFileName}` : ""}`} />
        <ResultRow label="GGUF 파일" value={draft.ggufFiles.length ? draft.ggufFiles.join(", ") : "없음"} />
      </dl>
      {draft.warnings.length > 0 ? (
        <ul className="grid gap-1 rounded-md border border-zinc-800 bg-zinc-900/80 p-3 text-sm text-zinc-300">
          {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function ResultRow({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-all text-zinc-200">{value || "-"}</dd>
    </>
  );
}

async function readLocalFolderSnapshot(handle: LocalDirectoryHandle): Promise<LocalFolderSnapshot> {
  const ggufFiles: string[] = [];
  let existingModelYaml: string | undefined;
  for await (const entry of handle.values()) {
    if (!("getFile" in entry)) continue;
    if (entry.name.toLowerCase().endsWith(".gguf")) {
      ggufFiles.push(entry.name);
    }
    if (entry.name === "model.yaml") {
      existingModelYaml = await (await entry.getFile()).text();
    }
  }
  return { name: handle.name, ggufFiles: ggufFiles.sort(), existingModelYaml };
}

async function readTargetModelYaml(handle: LocalDirectoryHandle | undefined): Promise<string | undefined> {
  if (!handle) return undefined;
  try {
    return await (await (await handle.getFileHandle("model.yaml")).getFile()).text();
  } catch {
    return undefined;
  }
}

async function writeLocalPatch(handle: LocalDirectoryHandle, draft: NDXAgentModelFolderPatchDraftResponse): Promise<void> {
  await ensureReadWritePermission(handle);
  if (draft.backupFileName && draft.backupContents) {
    await writeTextFile(handle, draft.backupFileName, draft.backupContents);
  }
  await writeTextFile(handle, draft.modelYamlFileName, draft.modelYaml);
  await writeTextFile(handle, draft.manifestFileName, JSON.stringify(draft.manifest, null, 2));
}

async function restoreLocalPatch(handle: LocalDirectoryHandle): Promise<string> {
  await ensureReadWritePermission(handle);
  const manifest = JSON.parse(await (await (await handle.getFileHandle("ndx-model-patch.json")).getFile()).text()) as NDXAgentModelFolderPatchManifest;
  if (manifest.originalModelYamlExisted) {
    if (!manifest.backupFileName) {
      throw new Error("복구 정보에 백업 파일명이 없습니다.");
    }
    const backup = await (await (await handle.getFileHandle(manifest.backupFileName)).getFile()).text();
    await writeTextFile(handle, "model.yaml", backup);
    return "백업 파일에서 model.yaml을 복구했습니다.";
  }
  if (!handle.removeEntry) {
    throw new Error("이 브라우저는 파일 삭제 API를 지원하지 않습니다. model.yaml을 직접 삭제하세요.");
  }
  await handle.removeEntry("model.yaml").catch(() => undefined);
  return "패치 전 model.yaml이 없던 상태로 복구했습니다.";
}

async function ensureReadWritePermission(handle: LocalDirectoryHandle): Promise<void> {
  const descriptor = { mode: "readwrite" as const };
  const current = await handle.queryPermission?.(descriptor);
  if (current === "granted") return;
  const next = await handle.requestPermission?.(descriptor);
  if (next !== "granted") {
    throw new Error("선택한 폴더에 쓰기 권한이 없습니다.");
  }
}

async function writeTextFile(handle: LocalDirectoryHandle, name: string, contents: string): Promise<void> {
  const file = await handle.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(contents);
  await writable.close();
}

function downloadText(fileName: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugModelName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
}

function isEmbeddingModelName(value: string): boolean {
  return value.toLowerCase().includes("embedding");
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}
