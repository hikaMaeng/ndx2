import React from "react";
import { CheckCircle2, Download, FileCode2, FolderOpen, RotateCw, Save, Undo2 } from "lucide-react";
import type { NDXAgentModelFolderPatchDraftResponse, NDXAgentModelFolderPatchManifest } from "ndx/webclient/common";
import { getSettingsSurfaceModel } from "ndx/webclient/front";
import { useModel } from "../model/useModel";
import { Button, Input, Textarea } from "../components/ui";
import { draftModelFolderPatch } from "./modelPatchApi";

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

export function ModelPatchSettingsTab() {
  const settingsModel = getSettingsSurfaceModel();
  const modelFolder = useModel(settingsModel.modelFolder).value as LocalFolderSnapshot | undefined;
  const targetFolderName = useModel(settingsModel.targetFolderName).value;
  const targetHandle = useModel(settingsModel.targetHandle).value as LocalDirectoryHandle | undefined;
  const publisher = useModel(settingsModel.publisher).value;
  const baseModelKey = useModel(settingsModel.baseModelKey).value;
  const aliasModelKey = useModel(settingsModel.aliasModelKey).value;
  const template = useModel(settingsModel.template).value;
  const draft = useModel(settingsModel.draft).value;
  const pending = useModel(settingsModel.pending).value;
  const error = useModel(settingsModel.error).value;
  const message = useModel(settingsModel.message).value;
  const setModelFolder = (update: React.SetStateAction<LocalFolderSnapshot | undefined>) => settingsModel.modelFolder.set(update);
  const setTargetFolderName = (update: React.SetStateAction<string>) => settingsModel.targetFolderName.set(update);
  const setTargetHandle = (update: React.SetStateAction<LocalDirectoryHandle | undefined>) => settingsModel.targetHandle.set(update);
  const setPublisher = (update: React.SetStateAction<string>) => settingsModel.publisher.set(update);
  const setBaseModelKey = (update: React.SetStateAction<string>) => settingsModel.baseModelKey.set(update);
  const setAliasModelKey = (update: React.SetStateAction<string>) => settingsModel.aliasModelKey.set(update);
  const setTemplate = (update: React.SetStateAction<string>) => settingsModel.template.set(update);
  const setDraft = (update: React.SetStateAction<NDXAgentModelFolderPatchDraftResponse | undefined>) => settingsModel.draft.set(update);
  const setPending = (update: React.SetStateAction<"model" | "target" | "draft" | "write" | "restore" | "">) => settingsModel.pending.set(update);
  const setError = (update: React.SetStateAction<string>) => settingsModel.error.set(update);
  const setMessage = (update: React.SetStateAction<string>) => settingsModel.message.set(update);
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
          <div className="mx-auto grid max-w-5xl gap-4">
            <PageIntro hasDirectoryPicker={hasDirectoryPicker} />
            <StepCard
              step="1"
              title="원본 모델 폴더 선택"
              description="GGUF 파일이 들어 있는 모델 폴더를 선택합니다. NDX는 대용량 GGUF를 업로드하지 않고 파일명과 기존 model.yaml만 읽어 패치 대상을 추정합니다."
              done={Boolean(modelFolder)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={Boolean(pending)} onClick={selectModelFolder}>
                  {pending === "model" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FolderOpen aria-hidden="true" className="h-4 w-4" />}
                  원본 모델 폴더 선택
                </Button>
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
                <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={Boolean(pending)} onClick={selectTargetFolder}>
                  {pending === "target" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FolderOpen aria-hidden="true" className="h-4 w-4" />}
                  패치 대상 폴더 선택
                </Button>
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
                <Textarea className="min-h-28 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" value={template} onChange={(event) => setTemplate(event.target.value)} placeholder="대부분 비워두면 됩니다." />
              </label>
            </StepCard>
            <StepCard
              step="4"
              title="패치 파일 생성"
              description="서버가 입력값을 바탕으로 model.yaml, 백업 파일명, 복구 정보를 계산합니다. 아직 로컬 폴더에는 쓰지 않습니다."
              done={Boolean(draft)}
            >
              <Button type="button" className="inline-flex h-9 w-fit items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={!modelFolder || Boolean(pending)} onClick={createDraft}>
                {pending === "draft" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileCode2 aria-hidden="true" className="h-4 w-4" />}
                패치 파일 생성
              </Button>
              {draft ? <LocalDraftResult draft={draft} /> : null}
            </StepCard>
            <StepCard
              step="5"
              title="적용하거나 파일로 내려받기"
              description="대상 폴더를 선택했다면 브라우저가 직접 파일을 씁니다. 선택하지 않았다면 다운로드한 파일을 LM Studio alias 폴더에 직접 넣으면 됩니다."
              done={Boolean(message)}
            >
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50" disabled={!draft || !targetHandle || Boolean(pending)} onClick={writeDraftToTarget}>
                  {pending === "write" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                  선택 폴더에 쓰기
                </Button>
                <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!draft} onClick={() => draft ? downloadText(draft.modelYamlFileName, draft.modelYaml) : undefined}>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  model.yaml 다운로드
                </Button>
                <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!draft} onClick={() => draft ? downloadText(draft.manifestFileName, JSON.stringify(draft.manifest, null, 2)) : undefined}>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  복구정보 다운로드
                </Button>
                <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!draft?.backupFileName || !draft.backupContents} onClick={() => draft?.backupFileName && draft.backupContents ? downloadText(draft.backupFileName, draft.backupContents) : undefined}>
                  <Download aria-hidden="true" className="h-4 w-4" />
                  백업 다운로드
                </Button>
                <Button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50" disabled={!targetHandle || Boolean(pending)} onClick={restoreTarget}>
                  {pending === "restore" ? <RotateCw aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Undo2 aria-hidden="true" className="h-4 w-4" />}
                  선택 폴더 복구
                </Button>
              </div>
              <HelpText>`선택 폴더에 쓰기`는 기존 model.yaml이 있으면 먼저 백업을 만들고, `ndx-model-patch.json`에 복구 정보를 남깁니다. 복구 버튼은 이 정보를 사용합니다.</HelpText>
            </StepCard>
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
      <Input className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function StatusPill({ text, tone }: { text: string; tone: "ok" | "idle" | "warn" }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${tone === "ok" ? "border-emerald-700 bg-emerald-950/50 text-emerald-200" : tone === "warn" ? "border-amber-700 bg-amber-950/50 text-amber-200" : "border-zinc-700 bg-zinc-950 text-zinc-400"}`}>
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
