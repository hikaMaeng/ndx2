import {
  SETTINGS_KNOWN_TOP_LEVEL_KEYS,
  readNDXSettingsDocument,
  settingsDocumentRow,
  writeNDXSettingsDocument,
  type NDXSettingsDocumentInput,
  type NDXSettingsDocumentRow
} from "../../../../common/settings/index.js";

export async function getSettingsWebDocument(userHome: string): Promise<NDXSettingsDocumentRow> {
  const settings = await readNDXSettingsDocument(userHome);
  return settingsDocumentRow(settings);
}

export async function updateSettingsWebDocument(userHome: string, input: NDXSettingsDocumentInput): Promise<NDXSettingsDocumentRow> {
  const settings = await readNDXSettingsDocument(userHome);
  if (typeof input.version === "string") {
    const version = input.version.trim();
    if (version) settings.version = version;
  }
  if (typeof input.defaultModelKey === "string") {
    const requestedModel = input.defaultModelKey.trim();
    const modelKey = requestedModel ? resolveExistingSettingsModelKey(settings, requestedModel) : "";
    if (requestedModel && !modelKey) throw new Error(`settings model key not found: ${requestedModel}`);
    settings.model = modelKey;
  }
  if (input.runtime) {
    settings.runtime = settings.runtime && typeof settings.runtime === "object" && !Array.isArray(settings.runtime) ? settings.runtime : {};
    if (typeof input.runtime.maxModelIterations === "number" && Number.isInteger(input.runtime.maxModelIterations) && input.runtime.maxModelIterations > 0) {
      settings.runtime.maxModelIterations = input.runtime.maxModelIterations;
    }
    if (typeof input.runtime.loopDetectionInterval === "number" && Number.isInteger(input.runtime.loopDetectionInterval)) {
      settings.runtime.loopDetectionInterval = input.runtime.loopDetectionInterval;
    }
  }
  if (input.tools?.prompt_rewrite) {
    settings.tools = settings.tools && typeof settings.tools === "object" && !Array.isArray(settings.tools) ? settings.tools : {};
    const promptRewrite = settings.tools.prompt_rewrite && typeof settings.tools.prompt_rewrite === "object" && !Array.isArray(settings.tools.prompt_rewrite)
      ? settings.tools.prompt_rewrite as Record<string, unknown>
      : {};
    const model = input.tools.prompt_rewrite.model?.trim() ?? "";
    if (model) promptRewrite.model = model;
    else delete promptRewrite.model;
    settings.tools.prompt_rewrite = promptRewrite;
  }
  if (input.hooks?.StreamGuard) {
    settings.hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? settings.hooks : {};
    const streamGuard = settings.hooks.StreamGuard && typeof settings.hooks.StreamGuard === "object" && !Array.isArray(settings.hooks.StreamGuard)
      ? settings.hooks.StreamGuard as Record<string, unknown>
      : {};
    const maxReasoningLength = input.hooks.StreamGuard.MAX_REASONING_LENGTH;
    if (typeof maxReasoningLength === "number" && Number.isInteger(maxReasoningLength) && maxReasoningLength > 0) streamGuard.MAX_REASONING_LENGTH = maxReasoningLength;
    else if (maxReasoningLength !== undefined) delete streamGuard.MAX_REASONING_LENGTH;
    const analysisModel = input.hooks.StreamGuard.analysisModel?.trim() ?? "";
    if (analysisModel) streamGuard.analysisModel = analysisModel;
    else if (input.hooks.StreamGuard.analysisModel !== undefined) delete streamGuard.analysisModel;
    settings.hooks.StreamGuard = streamGuard;
  }
  if (input.websearch) {
    settings.websearch = settings.websearch && typeof settings.websearch === "object" && !Array.isArray(settings.websearch) ? settings.websearch : {};
    applyOptionalString(settings.websearch, "provider", input.websearch.provider);
    applyOptionalString(settings.websearch, "apiKey", input.websearch.apiKey);
    applyOptionalString(settings.websearch, "baseUrl", input.websearch.baseUrl);
    applyOptionalString(settings.websearch, "method", input.websearch.method);
    applyOptionalString(settings.websearch, "queryParam", input.websearch.queryParam);
    if (typeof input.websearch.providersJson === "string") {
      const providers = input.websearch.providersJson.trim() ? JSON.parse(input.websearch.providersJson) as unknown : undefined;
      if (providers && (typeof providers !== "object" || Array.isArray(providers))) throw new Error("websearch.providers must be a JSON object.");
      if (providers) settings.websearch.providers = providers;
      else delete settings.websearch.providers;
    }
  }
  if (input.selfcheck) {
    settings.selfcheck = settings.selfcheck && typeof settings.selfcheck === "object" && !Array.isArray(settings.selfcheck) ? settings.selfcheck : {};
    if (typeof input.selfcheck.enabled === "boolean") {
      settings.selfcheck.enabled = input.selfcheck.enabled;
    }
    if (typeof input.selfcheck.model === "string") {
      const model = input.selfcheck.model.trim();
      const modelKey = model ? resolveExistingSettingsModelKey(settings, model) : "";
      if (model && settings.selfcheck.enabled !== false && !modelKey) throw new Error(`settings model key not found: ${model}`);
      if (model) settings.selfcheck.model = settings.selfcheck.enabled === false ? model : modelKey || model;
      else delete settings.selfcheck.model;
    }
    applyOptionalPositiveInteger(settings.selfcheck, "defaultIntervalMs", input.selfcheck.defaultIntervalMs);
    applyOptionalPositiveInteger(settings.selfcheck, "defaultBatchSize", input.selfcheck.defaultBatchSize);
    applyOptionalPositiveInteger(settings.selfcheck, "maxLlmAnalysesPerRun", input.selfcheck.maxLlmAnalysesPerRun);
    applyOptionalPositiveInteger(settings.selfcheck, "maxEvidenceChars", input.selfcheck.maxEvidenceChars);
  }
  if (typeof input.otherJson === "string") {
    const parsed = input.otherJson.trim() ? JSON.parse(input.otherJson) as unknown : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("other settings must be a JSON object.");
    for (const key of Object.keys(settings)) {
      if (!SETTINGS_KNOWN_TOP_LEVEL_KEYS.has(key)) delete settings[key];
    }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!SETTINGS_KNOWN_TOP_LEVEL_KEYS.has(key)) settings[key] = value;
    }
  }
  await writeNDXSettingsDocument(userHome, settings);
  return settingsDocumentRow(settings);
}

function applyOptionalString(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
  else delete target[key];
}

function applyOptionalPositiveInteger(target: Record<string, unknown>, key: string, value: number | undefined): void {
  if (value === undefined) return;
  if (Number.isInteger(value) && value > 0) target[key] = value;
  else delete target[key];
}

function resolveExistingSettingsModelKey(settings: { models?: Record<string, { name?: unknown }> }, requested: string): string | undefined {
  if (settings.models?.[requested]) return requested;
  return Object.entries(settings.models ?? {}).find(([, model]) => typeof model.name === "string" && model.name.trim() === requested)?.[0];
}
