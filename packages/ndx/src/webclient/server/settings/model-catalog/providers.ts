import {
  readNDXSettingsDocument,
  settingsProviderRow,
  writeNDXSettingsDocument,
  type NDXSettingsProviderRow
} from "../../../../common/settings/index.js";

export async function listSettingsWebProvider(userHome: string): Promise<NDXSettingsProviderRow[]> {
  const settings = await readNDXSettingsDocument(userHome);
  return Object.entries(settings.providers ?? {})
    .map(([title, provider]) => settingsProviderRow(title, provider))
    .filter((provider): provider is NDXSettingsProviderRow => Boolean(provider))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function getSettingsWebProvider(userHome: string, title: string): Promise<NDXSettingsProviderRow | undefined> {
  const settings = await readNDXSettingsDocument(userHome);
  const provider = settings.providers?.[title.trim()];
  return provider ? settingsProviderRow(title.trim(), provider) : undefined;
}

export async function createSettingsWebProvider(userHome: string, input: NDXSettingsProviderRow): Promise<NDXSettingsProviderRow> {
  const settings = await readNDXSettingsDocument(userHome);
  const title = input.title.trim();
  if (!title) throw new Error("provider title is required.");
  settings.providers = settings.providers ?? {};
  const existing = settings.providers[title] ?? {};
  settings.providers[title] = {
    ...existing,
    type: "openai",
    url: input.url.trim(),
    key: input.token ?? ""
  };
  await writeNDXSettingsDocument(userHome, settings);
  const row = settingsProviderRow(title, settings.providers[title]);
  if (!row) throw new Error("settings provider upsert returned no row.");
  return row;
}

export async function updateSettingsWebProvider(userHome: string, title: string, input: Partial<NDXSettingsProviderRow>): Promise<NDXSettingsProviderRow> {
  const settings = await readNDXSettingsDocument(userHome);
  const key = title.trim();
  const current = settings.providers?.[key];
  if (!current) throw new Error(`settings provider not found: ${title}`);
  settings.providers = settings.providers ?? {};
  settings.providers[key] = {
    ...current,
    ...(input.type ? { type: input.type } : {}),
    ...(typeof input.url === "string" ? { url: input.url.trim() } : {}),
    ...(typeof input.token === "string" ? { key: input.token } : {})
  };
  await writeNDXSettingsDocument(userHome, settings);
  const row = settingsProviderRow(key, settings.providers[key]);
  if (!row) throw new Error(`settings provider not found: ${title}`);
  return row;
}

export async function deleteSettingsWebProvider(userHome: string, title: string): Promise<void> {
  const settings = await readNDXSettingsDocument(userHome);
  const key = title.trim();
  if (settings.providers) {
    delete settings.providers[key];
  }
  if (settings.models) {
    for (const [modelKey, model] of Object.entries(settings.models)) {
      if (model && typeof model === "object" && model.provider === key) {
        delete settings.models[modelKey];
      }
    }
  }
  if (settings.model && typeof settings.model === "string" && settings.models && !settings.models[settings.model]) {
    settings.model = Object.keys(settings.models)[0] ?? "";
  }
  if (settings.embeddings && typeof settings.embeddings === "object" && settings.embeddings.provider === key) {
    delete settings.embeddings;
  }
  await writeNDXSettingsDocument(userHome, settings);
}
