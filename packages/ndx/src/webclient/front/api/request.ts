export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { cache: "no-store", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
    throw new Error(typeof body?.error === "string" && body.error.trim() ? body.error : `Request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
