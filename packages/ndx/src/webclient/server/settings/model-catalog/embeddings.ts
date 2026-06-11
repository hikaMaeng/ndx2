import {
  isEmbeddingModelName,
  readNDXSettingsDocument,
  settingsEmbeddingRow,
  writeNDXSettingsDocument,
  type NDXSettingsEmbeddingSettingsRow
} from "../../../../common/settings/index.js";

export async function getSettingsWebEmbeddingSettings(userHome: string): Promise<NDXSettingsEmbeddingSettingsRow | undefined> {
  const settings = await readNDXSettingsDocument(userHome);
  return settingsEmbeddingRow(settings.embeddings);
}

export async function updateSettingsWebEmbeddingSettings(userHome: string, input: NDXSettingsEmbeddingSettingsRow): Promise<NDXSettingsEmbeddingSettingsRow> {
  const settings = await readNDXSettingsDocument(userHome);
  const provider = input.provider.trim();
  const model = input.model.trim();
  if (!provider || !model) throw new Error("embedding provider and model are required.");
  if (!settings.providers?.[provider]) throw new Error(`settings provider not found: ${provider}`);
  if (!isEmbeddingModelName(model)) throw new Error("embedding model name must include embedding.");
  settings.embeddings = {
    ...(settings.embeddings && typeof settings.embeddings === "object" ? settings.embeddings : {}),
    provider,
    model
  };
  delete settings.embeddings.url;
  delete settings.embeddings.token;
  delete settings.embeddings.key;
  delete settings.embeddings.apiKey;
  await writeNDXSettingsDocument(userHome, settings);
  const row = settingsEmbeddingRow(settings.embeddings);
  if (!row) throw new Error("settings embedding update returned no row.");
  return row;
}
