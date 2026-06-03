import sessionRuntimeDiagram from "./resources/session-runtime.svg?url";

export const documentAssetUrls: Record<string, string> = {
  "resources/session-runtime.svg": sessionRuntimeDiagram
};

export function documentAssetUrl(src: string) {
  const normalizedSrc = src.replace(/^\.\/+/, "").replace(/^(\.\.\/)+/, "");
  return documentAssetUrls[normalizedSrc] ?? documentAssetUrls[src] ?? src;
}
