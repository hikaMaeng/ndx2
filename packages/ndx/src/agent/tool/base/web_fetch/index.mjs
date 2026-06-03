import { compactText, emitError, emitProgress, emitResult, emitSidebarItem, readToolArguments, safeHostname, validateHttpUrl } from "../_lib/web.mjs";

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 10;

function normalizeHtml(html) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = decodeHtmlEntities(withoutNoise
    .replace(/<\/(p|div|section|article|header|footer|main|aside|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n"));
  const cleanTitle = compactText(decodeHtmlEntities(title), 300);
  const cleanText = text.split(/\n/).map((line) => line.trim()).filter(Boolean).join("\n");
  return cleanTitle ? `# ${cleanTitle}\n\n${cleanText}` : cleanText;
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function permittedRedirect(originalUrl, redirectUrl) {
  const original = new URL(originalUrl);
  const redirect = new URL(redirectUrl);
  if (original.protocol !== redirect.protocol || original.port !== redirect.port || redirect.username || redirect.password) {
    return false;
  }
  return original.hostname.replace(/^www\./, "") === redirect.hostname.replace(/^www\./, "");
}

async function fetchWithPermittedRedirects(url, depth = 0) {
  if (depth > MAX_REDIRECTS) {
    throw new Error(`too many redirects; exceeded ${MAX_REDIRECTS}`);
  }
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      Accept: "text/markdown, text/plain, text/html, application/json, */*",
      "User-Agent": "ndx-web-fetch/0.1"
    }
  });

  if ([301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect response is missing Location header");
    const redirectUrl = new URL(location, url).toString();
    if (!permittedRedirect(url, redirectUrl)) {
      return {
        redirected: true,
        originalUrl: url,
        redirectUrl,
        status: response.status,
        statusText: response.statusText
      };
    }
    return fetchWithPermittedRedirects(redirectUrl, depth + 1);
  }

  return { response };
}

try {
  const input = readToolArguments();
  let parsed = validateHttpUrl(input.url);
  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }
  const url = parsed.toString();
  const maxChars = Math.min(Math.max(Number(input.max_chars || 20_000), 1), 100_000);

  emitProgress(`fetching ${parsed.hostname}`);
  const start = performance.now();
  const fetched = await fetchWithPermittedRedirects(url);
  if (fetched.redirected) {
    emitSidebarItem({
      group: { id: "web-references", title: "웹 참조" },
      key: `web-fetch:${fetched.redirectUrl}`,
      title: safeHostname(fetched.redirectUrl) || fetched.redirectUrl,
      body: `${fetched.status} · redirect · ${fetched.redirectUrl}`,
      kind: "web_fetch"
    });
    emitResult({
      url,
      status: fetched.status,
      statusText: fetched.statusText,
      redirected: true,
      redirectUrl: fetched.redirectUrl,
      content: `Redirect detected from ${fetched.originalUrl} to ${fetched.redirectUrl}. Re-run web_fetch with the redirected URL if this destination is expected.`
    });
    process.exit(0);
  }

  const response = fetched.response;
  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`response too large: ${contentLength} bytes`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_RESPONSE_BYTES) {
    throw new Error(`response too large: ${buffer.length} bytes`);
  }

  const contentType = response.headers.get("content-type") || "";
  const raw = buffer.toString("utf8");
  const readable = contentType.includes("text/html") ? normalizeHtml(raw) : raw;
  const truncated = readable.length > maxChars;

  emitSidebarItem({
    group: { id: "web-references", title: "웹 참조" },
    key: `web-fetch:${response.url || url}`,
    title: safeHostname(response.url || url) || response.url || url,
    body: compactText([String(response.status), contentType.split(";")[0], `${buffer.length}B`, truncated ? "일부만 표시" : "", response.url || url].filter(Boolean).join(" · "), 180),
    kind: "web_fetch"
  });
  emitResult({
    url,
    finalUrl: response.url || url,
    status: response.status,
    statusText: response.statusText,
    contentType,
    bytes: buffer.length,
    durationMs: Math.round(performance.now() - start),
    truncated,
    content: truncated ? readable.slice(0, maxChars) : readable
  });
} catch (error) {
  emitError(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
