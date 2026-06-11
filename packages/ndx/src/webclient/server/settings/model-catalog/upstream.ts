import type { NDXSettingsProviderRow } from "../../../../common/settings/index.js";

export async function fetchProviderModels(provider: NDXSettingsProviderRow): Promise<{ data?: Array<{ id?: string }> }> {
  const endpoints = providerModelEndpointCandidates(provider.url);
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      const timeoutSignal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(5_000) : undefined;
      const response = await fetch(endpoint, {
        headers: provider.token ? { Authorization: `Bearer ${provider.token}` } : {},
        ...(timeoutSignal ? { signal: timeoutSignal } : {})
      });
      if (response.ok) {
        return (await response.json()) as { data?: Array<{ id?: string }> };
      }
      lastError = new Error(`provider model sync failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("provider model sync failed.");
}

export function providerModelEndpointCandidates(providerUrlText: string): string[] {
  const providerUrl = new URL(providerUrlText.trim());
  const normalizedPath = providerUrl.pathname.replace(/\/$/, "");
  const endpoints = [new URL(`${normalizedPath}/models`, providerUrl)];
  if (!normalizedPath.endsWith("/v1")) {
    endpoints.push(new URL(`${normalizedPath}/v1/models`, providerUrl));
  }
  return endpoints.map((endpoint) => endpoint.toString());
}
