import {
  createNDXAgentResourceResolver,
  DEFAULT_NDX_AGENT_LANGUAGE,
  DEFAULT_NDX_AGENT_RESOURCES,
  normalizeNDXAgentLanguage,
  type NDXAgentLanguage,
  type NDXAgentResourceBundle,
  type NDXAgentResourceResolver
} from "ndx/agent/common";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtimeAssetsDir = "/ndx/assets";

export function createAgentServerResourceResolver(options: { runtimeAssetsDir?: string; bundledAssetsDir?: string } = {}): NDXAgentResourceResolver {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const bundledAssetsDir = options.bundledAssetsDir ?? path.resolve(serverDir, "../../../assets");
  const assetRoots = [options.runtimeAssetsDir ?? runtimeAssetsDir, bundledAssetsDir];

  return (key, resourceOptions = {}) => {
    const language = normalizeNDXAgentLanguage(resourceOptions.language, DEFAULT_NDX_AGENT_LANGUAGE);
    const resources = {
      en: { ...DEFAULT_NDX_AGENT_RESOURCES.en, ...readLocaleResources(assetRoots, "en") },
      ko: { ...DEFAULT_NDX_AGENT_RESOURCES.ko, ...readLocaleResources(assetRoots, "ko") }
    };
    return createNDXAgentResourceResolver(resources)(key, { ...resourceOptions, language });
  };
}

function readLocaleResources(assetRoots: string[], language: NDXAgentLanguage): NDXAgentResourceBundle {
  const merged: NDXAgentResourceBundle = {};
  for (const root of [...assetRoots].reverse()) {
    const filePath = path.join(root, "i18n", `${language}.json`);
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") {
          merged[key] = value;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  return merged;
}
