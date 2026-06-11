import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { NDXAgentModelFolderPatchDraftRequest, NDXAgentModelFolderPatchDraftResponse, NDXAgentModelFolderPatchResponse } from "../../../common/protocol/index.js";

export type NDXModelFolderPatchOptions = {
  template: string;
  lmStudioHubModelsPath?: string;
};

export function draftModelFolderPatch(input: NDXAgentModelFolderPatchDraftRequest, options: { template: string }): NDXAgentModelFolderPatchDraftResponse {
  const folderName = input.folderName.trim() || "model";
  const publisher = slugModelName(input.publisher?.trim() || "local");
  const baseModelKey = input.baseModelKey?.trim() || `${publisher}/${folderName}`;
  const aliasModelKey = input.aliasModelKey?.trim() || `${publisher}/${slugModelName(folderName)}-ndx`;
  const ggufFiles = [...new Set(input.ggufFiles ?? [])].filter((fileName) => fileName.toLowerCase().endsWith(".gguf")).sort();
  const existingModelYaml = input.existingModelYaml ?? "";
  const template = input.template?.trim() ? input.template : options.template;
  const modelYaml = modelYamlContents({ aliasModelKey, baseModelKey, template });
  const hasNoThinkPromptGuard = existingModelYaml.includes("ndx_no_think") || existingModelYaml.includes("reasoning_effort in ['none', 'minimal', 'low']");
  const alreadyPatched = existingModelYaml.includes(`model: ${aliasModelKey}`) && hasNoThinkPromptGuard && existingModelYaml.includes("stopStrings: []");
  const createdAt = new Date().toISOString();
  const backupFileName = existingModelYaml ? `model.yaml.ndx-backup.${createdAt.replace(/[:.]/g, "-")}` : undefined;
  const warnings: string[] = [];
  if (ggufFiles.length === 0) {
    warnings.push("선택한 폴더에서 GGUF 파일명을 찾지 못했습니다. GGUF 원본 폴더가 아니라 LM Studio hub alias 폴더를 선택했다면 정상일 수 있습니다.");
  }
  if (ggufFiles.length > 0) {
    warnings.push("GGUF 원본 모델 폴더 안에 model.yaml을 직접 쓰지 마세요. 다운로드한 model.yaml은 LM Studio hub alias 폴더에 두는 용도입니다.");
  }
  if (!input.baseModelKey?.trim()) {
    warnings.push("브라우저는 부모 절대경로를 안정적으로 알 수 없습니다. base model key가 맞는지 확인하세요.");
  }
  return {
    status: alreadyPatched ? "patched" : "needs_patch",
    folderName,
    publisher,
    baseModelKey,
    aliasModelKey,
    ggufFiles,
    modelYaml,
    modelYamlFileName: "model.yaml",
    manifest: {
      version: 1,
      createdAt,
      folderName,
      publisher,
      baseModelKey,
      aliasModelKey,
      outputFileName: "model.yaml",
      originalModelYamlExisted: Boolean(existingModelYaml),
      originalModelYamlSha256: existingModelYaml ? sha256(existingModelYaml) : undefined,
      backupFileName
    },
    manifestFileName: "ndx-model-patch.json",
    backupFileName,
    backupContents: existingModelYaml || undefined,
    warnings
  };
}

export async function analyzeModelFolderPatch(folderPath: string, options: NDXModelFolderPatchOptions): Promise<NDXAgentModelFolderPatchResponse> {
  const inputPath = folderPath.trim();
  if (!inputPath) {
    return inaccessibleResponse(folderPath, "모델 폴더 경로를 입력해야 합니다.");
  }

  const resolvedFolderPath = await firstAccessibleDirectory(inputPath);
  if (!resolvedFolderPath) {
    return inaccessibleResponse(folderPath, `서버에서 접근할 수 없는 폴더입니다: ${folderPath}`);
  }

  const entries = await fs.readdir(resolvedFolderPath, { withFileTypes: true });
  const ggufFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".gguf")).map((entry) => entry.name).sort();
  const modelFolderName = path.basename(resolvedFolderPath);
  const publisher = path.basename(path.dirname(resolvedFolderPath));
  const baseModelKey = publisher && publisher !== "." ? `${publisher}/${modelFolderName}` : modelFolderName;
  const aliasModelKey = `${publisher && publisher !== "." ? `${publisher}/` : ""}${slugModelName(modelFolderName)}-ndx`;
  const hubModelYamlPath = path.join(resolveLmStudioHubModelsPath(options.lmStudioHubModelsPath), ...(publisher && publisher !== "." ? [publisher] : []), `${slugModelName(modelFolderName)}-ndx`, "model.yaml");
  const warnings: string[] = [];
  if (ggufFiles.length === 0) {
    warnings.push("선택한 폴더에서 GGUF 파일을 찾지 못했습니다.");
  }
  if (await pathExists(path.join(resolvedFolderPath, "model.yaml"))) {
    warnings.push("모델 폴더 안의 model.yaml은 LM Studio 스캔을 방해할 수 있습니다. NDX 패치는 hub 모델 정의에 적용합니다.");
  }
  const hubContents = await fs.readFile(hubModelYamlPath, "utf8").catch(() => "");
  const hasNoThinkPromptGuard = hubContents.includes("ndx_no_think") || hubContents.includes("reasoning_effort in ['none', 'minimal', 'low']");
  const hasNdxHubPatch = hubContents.includes(`model: ${aliasModelKey}`) && hasNoThinkPromptGuard && hubContents.includes("stopStrings: []");
  return {
    status: hasNdxHubPatch ? "patched" : "needs_patch",
    folderPath,
    resolvedFolderPath,
    modelFolderName,
    publisher,
    baseModelKey,
    aliasModelKey,
    hubModelYamlPath,
    ggufFiles,
    hasNdxHubPatch,
    warnings
  };
}

export async function applyModelFolderPatch(folderPath: string, options: NDXModelFolderPatchOptions): Promise<NDXAgentModelFolderPatchResponse> {
  const analysis = await analyzeModelFolderPatch(folderPath, options);
  if (analysis.status === "inaccessible" || !analysis.hubModelYamlPath || !analysis.aliasModelKey || !analysis.baseModelKey) {
    return analysis;
  }
  await fs.mkdir(path.dirname(analysis.hubModelYamlPath), { recursive: true });
  await fs.writeFile(analysis.hubModelYamlPath, modelYamlContents({
    aliasModelKey: analysis.aliasModelKey,
    baseModelKey: analysis.baseModelKey,
    template: options.template
  }), "utf8");
  return { ...(await analyzeModelFolderPatch(folderPath, options)), applied: true };
}

function inaccessibleResponse(folderPath: string, warning: string): NDXAgentModelFolderPatchResponse {
  return {
    status: "inaccessible",
    folderPath,
    ggufFiles: [],
    hasNdxHubPatch: false,
    warnings: [warning]
  };
}

async function firstAccessibleDirectory(value: string): Promise<string | undefined> {
  for (const candidate of pathCandidates(value)) {
    const stat = await fs.stat(candidate).catch(() => undefined);
    if (stat?.isDirectory()) {
      return candidate;
    }
  }
  return undefined;
}

function pathCandidates(value: string): string[] {
  const normalized = value.trim().replace(/\\/g, "/");
  const candidates = [normalized];
  const windowsDrive = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (windowsDrive) {
    candidates.push(path.posix.join("/mnt", windowsDrive[1]!.toLowerCase(), windowsDrive[2] ?? ""));
  }
  return [...new Set(candidates)];
}

function resolveLmStudioHubModelsPath(configuredPath: string | undefined): string {
  if (configuredPath?.trim()) {
    return configuredPath.trim();
  }
  if (process.env.NDX_LMSTUDIO_HUB_MODELS?.trim()) {
    return process.env.NDX_LMSTUDIO_HUB_MODELS.trim();
  }
  if (process.env.USERPROFILE?.trim()) {
    return path.join(process.env.USERPROFILE.trim(), ".lmstudio", "hub", "models");
  }
  const user = process.env.USER || os.userInfo().username;
  const wslHome = path.join("/mnt/c/Users", user, ".lmstudio", "hub", "models");
  if (pathExistsSyncHint(wslHome)) {
    return wslHome;
  }
  const windowsUsersRoot = "/mnt/c/Users";
  if (pathExistsSyncHint(windowsUsersRoot)) {
    for (const entry of readdirSync(windowsUsersRoot, { withFileTypes: true }).filter((candidate) => candidate.isDirectory()).map((candidate) => candidate.name).sort()) {
      const hub = path.join(windowsUsersRoot, entry, ".lmstudio", "hub", "models");
      if (pathExistsSyncHint(hub)) {
        return hub;
      }
    }
  }
  return path.join(os.homedir(), ".lmstudio", "hub", "models");
}

function pathExistsSyncHint(value: string): boolean {
  return existsSync(value);
}

async function pathExists(value: string): Promise<boolean> {
  return fs.stat(value).then(() => true).catch(() => false);
}

function slugModelName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function modelYamlContents(input: { aliasModelKey: string; baseModelKey: string; template: string }): string {
  const indentedTemplate = input.template.replace(/\r\n/g, "\n").split("\n").map((line) => `              ${line}`).join("\n");
  const baseSource = huggingFaceSource(input.baseModelKey);
  return [
    "# Generated by NDX. Do not place this file inside the raw GGUF model folder.",
    `model: ${input.aliasModelKey}`,
    "base:",
    `  - key: ${input.baseModelKey}`,
    ...(baseSource ? [
      "    sources:",
      "      - type: huggingface",
      `        user: ${baseSource.user}`,
      `        repo: ${baseSource.repo}`
    ] : []),
    "metadataOverrides:",
    "  domain: llm",
    "  compatibilityTypes:",
    "    - gguf",
    "  contextLengths:",
    "    - 262144",
    "  vision: true",
    "  reasoning: true",
    "  trainedForToolUse: true",
    "customFields:",
    "  - key: enableThinking",
    "    displayName: Enable Thinking",
    "    description: Controls whether the prompt template opens the assistant thinking channel.",
    "    type: boolean",
    "    defaultValue: false",
    "    effects:",
    "      - type: setJinjaVariable",
    "        variable: enable_thinking",
    "config:",
    "  operation:",
    "    fields:",
    "      - key: llm.prediction.reasoning.parsing",
    "        value:",
    "          enabled: true",
    "          startString: \"<think>\"",
    "          endString: \"</think>\"",
    "      - key: llm.prediction.promptTemplate",
    "        value:",
    "          type: jinja",
    "          jinjaPromptTemplate:",
    "            template: |-",
    indentedTemplate,
    "          stopStrings: []",
    ""
  ].join("\n");
}

function huggingFaceSource(baseModelKey: string): { user: string; repo: string } | undefined {
  const parts = baseModelKey.split("/");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
    return undefined;
  }
  return { user: parts[0], repo: parts[1] };
}
