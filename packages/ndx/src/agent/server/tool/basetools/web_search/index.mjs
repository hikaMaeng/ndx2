import {
  applyDomainFilters,
  compactText,
  durationSeconds,
  emitError,
  emitProgress,
  emitResult,
  providerApiKey,
  providerBaseUrl,
  readToolArguments,
  readWebSearchSettings,
  safeHostname
} from "../_lib/web.mjs";

const PROVIDER_ALIASES = new Map([
  ["duckduckgo", "duckduckgo"],
  ["ddg", "duckduckgo"],
  ["tavily", "tavily"],
  ["brave", "brave"],
  ["bing", "bing"],
  ["exa", "exa"],
  ["you", "you"],
  ["you.com", "you"],
  ["jina", "jina"],
  ["mojeek", "mojeek"],
  ["linkup", "linkup"]
]);

function normalizeProvider(value) {
  const key = String(value || "duckduckgo").trim().toLowerCase();
  return PROVIDER_ALIASES.get(key) || key;
}

async function checkedJson(response, provider) {
  if (!response.ok) {
    throw new Error(`${provider} search error ${response.status}: ${await response.text().catch(() => "")}`);
  }
  return response.json();
}

function result(title, url, description) {
  return {
    title: compactText(title || url, 220),
    url,
    description: compactText(description || "", 800),
    source: safeHostname(url)
  };
}

async function duckduckgoSearch(input, _settings, limit) {
  const start = performance.now();
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", input.query);
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 ndx-web-search/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo search error ${response.status}: ${await response.text().catch(() => "")}`);
  }
  const html = await response.text();
  if (/anomaly in the request|requests too quickly/i.test(html)) {
    throw new Error("DuckDuckGo scraping is rate-limited from this network. Configure a keyed provider in .ndx/settings.json.");
  }
  const hits = [];
  const anchors = [...html.matchAll(/<a\b(?=[^>]*class="result__a")[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  for (let index = 0; index < anchors.length; index += 1) {
    const titleAnchor = anchors[index];
    if (!titleAnchor) continue;
    const nextAnchorIndex = anchors[index + 1]?.index ?? html.length;
    const afterTitle = html.slice((titleAnchor.index ?? 0) + titleAnchor[0].length, nextAnchorIndex);
    const snippetAnchor = afterTitle.match(/<a\b(?=[^>]*class="result__snippet")[^>]*>([\s\S]*?)<\/a>/i);
    const rawUrl = decodeHtml(titleAnchor[1] || "");
    const title = decodeHtml(stripTags(titleAnchor[2] || ""));
    const description = decodeHtml(stripTags(snippetAnchor?.[1] || ""));
    const directUrl = duckduckgoResultUrl(rawUrl);
    if (directUrl) hits.push(result(title, directUrl, description));
    if (hits.length >= limit * 2) break;
  }
  if (hits.length === 0) {
    for (const match of html.matchAll(/<a\b(?=[^>]*class="result__a")[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const directUrl = duckduckgoResultUrl(decodeHtml(match[1] || ""));
      if (directUrl) hits.push(result(decodeHtml(stripTags(match[2] || "")), directUrl, ""));
      if (hits.length >= limit * 2) break;
    }
  }
  return {
    provider: "duckduckgo",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters(hits, input).slice(0, limit)
  };
}

function duckduckgoResultUrl(value) {
  try {
    const parsed = new URL(value, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? new URL(uddg).toString() : parsed.toString();
  } catch {
    return "";
  }
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
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

async function tavilySearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "tavily", "TAVILY_API_KEY");
  if (!apiKey) throw new Error("tavily requires websearch.apiKey or websearch.providers.tavily.apiKey.");
  const data = await checkedJson(await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query: input.query, max_results: limit, include_answer: false })
  }), "Tavily");
  return {
    provider: "tavily",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters((data.results || []).map((item) => result(item.title, item.url, item.content || item.snippet)), input).slice(0, limit)
  };
}

async function exaSearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "exa", "EXA_API_KEY");
  if (!apiKey) throw new Error("exa requires websearch.apiKey or websearch.providers.exa.apiKey.");
  const body = { query: input.query, numResults: limit, type: "auto", contents: { highlights: true } };
  if (input.allowed_domains?.length) body.includeDomains = input.allowed_domains;
  if (input.blocked_domains?.length) body.excludeDomains = input.blocked_domains;
  const data = await checkedJson(await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body)
  }), "Exa");
  return {
    provider: "exa",
    durationSeconds: durationSeconds(start),
    results: (data.results || []).map((item) => result(item.title, item.url, Array.isArray(item.highlights) ? item.highlights.slice(0, 3).join(" ... ") : item.text)).slice(0, limit)
  };
}

async function braveSearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "brave", "BRAVE_API_KEY");
  if (!apiKey) throw new Error("brave requires websearch.apiKey or websearch.providers.brave.apiKey.");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("count", String(limit));
  const data = await checkedJson(await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } }), "Brave");
  return {
    provider: "brave",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters((data.web?.results || []).map((item) => result(item.title, item.url, item.description)), input).slice(0, limit)
  };
}

async function bingSearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "bing", "BING_API_KEY");
  if (!apiKey) throw new Error("bing requires websearch.apiKey or websearch.providers.bing.apiKey.");
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("count", String(limit));
  const data = await checkedJson(await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": apiKey } }), "Bing");
  return {
    provider: "bing",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters((data.webPages?.value || []).map((item) => result(item.name, item.url, item.snippet)), input).slice(0, limit)
  };
}

async function youSearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "you", "YOU_API_KEY");
  if (!apiKey) throw new Error("you requires websearch.apiKey or websearch.providers.you.apiKey.");
  const url = new URL("https://api.ydc-index.io/v1/search");
  url.searchParams.set("query", input.query);
  url.searchParams.set("num_web_results", String(limit));
  const data = await checkedJson(await fetch(url, { headers: { "X-API-Key": apiKey } }), "You.com");
  const webResults = data?.results?.web || data?.results || [];
  return {
    provider: "you",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters(webResults.map((item) => result(item.title, item.url, Array.isArray(item.snippets) ? item.snippets[0] : item.snippet || item.description)), input).slice(0, limit)
  };
}

async function jinaSearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "jina", "JINA_API_KEY");
  if (!apiKey) throw new Error("jina requires websearch.apiKey or websearch.providers.jina.apiKey.");
  const url = new URL("https://s.jina.ai/");
  url.searchParams.set("q", input.query);
  url.searchParams.set("count", String(limit));
  const data = await checkedJson(await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } }), "Jina");
  return {
    provider: "jina",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters((data.data || data.results || []).map((item) => result(item.title, item.url, item.description || item.snippet || item.content)), input).slice(0, limit)
  };
}

async function mojeekSearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "mojeek", "MOJEEK_API_KEY");
  if (!apiKey) throw new Error("mojeek requires websearch.apiKey or websearch.providers.mojeek.apiKey.");
  const url = new URL("https://www.mojeek.com/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("t", String(limit));
  const data = await checkedJson(await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } }), "Mojeek");
  return {
    provider: "mojeek",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters((data?.response?.results || data.results || []).map((item) => result(item.title, item.url, item.snippet || item.desc)), input).slice(0, limit)
  };
}

async function linkupSearch(input, settings, limit) {
  const start = performance.now();
  const apiKey = providerApiKey(settings, "linkup", "LINKUP_API_KEY");
  if (!apiKey) throw new Error("linkup requires websearch.apiKey or websearch.providers.linkup.apiKey.");
  const data = await checkedJson(await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ q: input.query, search_type: "standard", depth: "standard" })
  }), "Linkup");
  return {
    provider: "linkup",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters((data.results || []).map((item) => result(item.name || item.title, item.url, item.snippet || item.description || item.content)), input).slice(0, limit)
  };
}

async function customSearch(input, settings, limit) {
  const start = performance.now();
  const baseUrl = providerBaseUrl(settings, "custom", "WEB_SEARCH_API");
  if (!baseUrl) throw new Error("custom requires websearch.baseUrl or websearch.providers.custom.baseUrl.");
  const apiKey = providerApiKey(settings, "custom", "WEB_SEARCH_API_KEY");
  const method = String(settings.method || settings.providers?.custom?.method || "GET").toUpperCase();
  const queryParam = String(settings.queryParam || settings.providers?.custom?.queryParam || "q");
  const url = new URL(baseUrl);
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = method === "POST"
    ? await fetch(url, { method, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ [queryParam]: input.query, limit }) })
    : await fetch(Object.assign(url, { search: new URLSearchParams({ ...Object.fromEntries(url.searchParams), [queryParam]: input.query, limit: String(limit) }).toString() }), { headers });
  const data = await checkedJson(response, "Custom");
  const raw = data.results || data.items || data.web?.results || data.data || [];
  return {
    provider: "custom",
    durationSeconds: durationSeconds(start),
    results: applyDomainFilters(raw.map((item) => result(item.title || item.name || item.headline, item.url || item.link || item.href, item.description || item.snippet || item.content)), input).slice(0, limit)
  };
}

try {
  const args = readToolArguments();
  const query = String(args.query || "").trim();
  if (query.length < 2) {
    throw new Error("query must contain at least 2 characters.");
  }
  const input = {
    query,
    allowed_domains: Array.isArray(args.allowed_domains) ? args.allowed_domains.map(String).filter(Boolean) : undefined,
    blocked_domains: Array.isArray(args.blocked_domains) ? args.blocked_domains.map(String).filter(Boolean) : undefined
  };
  const limit = Math.min(Math.max(Number(args.limit || 10), 1), 15);
  const settings = await readWebSearchSettings();
  const provider = normalizeProvider(settings.provider);
  const searchers = {
    duckduckgo: duckduckgoSearch,
    tavily: tavilySearch,
    exa: exaSearch,
    brave: braveSearch,
    bing: bingSearch,
    you: youSearch,
    jina: jinaSearch,
    mojeek: mojeekSearch,
    linkup: linkupSearch,
    custom: customSearch
  };
  if (!searchers[provider]) {
    throw new Error(`unsupported websearch provider "${provider}". Supported providers: ${Object.keys(searchers).join(", ")}`);
  }

  emitProgress(`searching with ${provider}`);
  const output = await searchers[provider](input, settings, limit);
  emitResult({
    query,
    provider: output.provider,
    durationSeconds: output.durationSeconds,
    results: output.results
  });
} catch (error) {
  emitError(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
