import fs from "node:fs/promises";
import path from "node:path";

export function emitProgress(message) {
  process.stdout.write(`${JSON.stringify({ type: "progress", message })}\n`);
}

export function emitResult(output) {
  process.stdout.write(`${JSON.stringify({ type: "result", success: true, output })}\n`);
}

export function emitError(message, output) {
  process.stdout.write(`${JSON.stringify({ type: "error", success: false, message, ...(output === undefined ? {} : { output }) })}\n`);
}

export function readToolArguments() {
  try {
    const parsed = JSON.parse(process.env.NDX_TOOL_ARGUMENTS || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function readWebSearchSettings() {
  const userHome = process.env.NDX_USER_HOME || process.env.HOME || "";
  const projectHome = process.env.NDX_PROJECT_HOME || process.cwd();
  const settings = {};

  for (const settingsPath of [
    userHome ? path.join(userHome, ".ndx", "settings.json") : "",
    path.join(projectHome, ".ndx", "settings.json")
  ]) {
    if (!settingsPath) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      if (parsed?.websearch && typeof parsed.websearch === "object" && !Array.isArray(parsed.websearch)) {
        Object.assign(settings, parsed.websearch);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error(`failed to read websearch settings from ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return settings;
}

export function providerApiKey(settings, provider, envName) {
  const providerSettings = settings?.providers?.[provider];
  return String(
    providerSettings?.apiKey ||
    settings?.apiKey ||
    process.env[envName] ||
    ""
  );
}

export function providerBaseUrl(settings, provider, envName) {
  const providerSettings = settings?.providers?.[provider];
  return String(
    providerSettings?.baseUrl ||
    settings?.baseUrl ||
    process.env[envName] ||
    ""
  );
}

export function durationSeconds(start) {
  return Math.round((performance.now() - start) / 10) / 100;
}

export function validateHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("url is required.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid URL: ${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`unsupported URL protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not supported.");
  }
  if (!parsed.hostname.includes(".")) {
    throw new Error(`hostname must be a public DNS name: ${parsed.hostname}`);
  }
  return parsed;
}

export function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

export function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function applyDomainFilters(hits, input) {
  let output = hits;
  if (Array.isArray(input.blocked_domains) && input.blocked_domains.length > 0) {
    output = output.filter((hit) => {
      const host = safeHostname(hit.url);
      return !host || !input.blocked_domains.some((domain) => hostMatchesDomain(host, String(domain)));
    });
  }
  if (Array.isArray(input.allowed_domains) && input.allowed_domains.length > 0) {
    output = output.filter((hit) => {
      const host = safeHostname(hit.url);
      return Boolean(host && input.allowed_domains.some((domain) => hostMatchesDomain(host, String(domain))));
    });
  }
  return output;
}

export function compactText(value, maxLength = 1000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}
