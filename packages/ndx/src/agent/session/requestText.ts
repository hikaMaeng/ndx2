export function normalizeInternalRequestMarkers(text: string): string {
  return text
    .replace(/\[\[rewriter\]\]/giu, "")
    .replace(/\[\[NDX_THINKING_(?:none|nothink|normal|high|low|medium|minimal|allowed)\]\]/giu, "")
    .replace(/\[\[NDX[ _]SKILL_([^\]\r\n]+)\]\]/giu, (_match, rawName: string) => `$${decodeSkillName(rawName)}`)
    .split(/\r\n|\n|\r/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function decodeSkillName(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}
