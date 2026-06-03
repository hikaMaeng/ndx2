# Web Tools

NDX ships two built-in read-only web tools under
`packages/ndx/src/agent/tool/base`.

## `web_fetch`

`web_fetch` loads a public HTTP(S) URL directly and returns readable text.
HTML responses are converted to compact plain text. Non-HTML text responses are
returned as UTF-8 text.

Input:

| Field | Required | Description |
| --- | --- | --- |
| `url` | yes | Public `http` or `https` URL. `http` is upgraded to `https`. |
| `max_chars` | no | Maximum returned content characters. Default `20000`, maximum `100000`. |

Constraints:

* URLs with embedded credentials are rejected.
* Hostnames must look like public DNS names.
* Redirects are followed only when they stay on the same hostname, allowing
  only `www.` add/remove variants. Cross-host redirects are returned to the
  model as an explicit redirect result.
* Responses over 10 MiB are rejected.
* Authenticated, private, and browser-session-only pages require a specialized
  connector instead of `web_fetch`.

The behavior follows OpenClaude's WebFetch design at the policy level: public
HTTP(S), bounded response size, no credentialed URLs, and conservative redirect
handling. The NDX implementation is separate process-tool code and does not
copy upstream source.

## `web_search`

`web_search` searches public web indexes. DuckDuckGo is the default and requires
no settings. Other providers are selected with `.ndx/settings.json`.

Settings are read from:

1. `<user home>/.ndx/settings.json`
2. `<project home>/.ndx/settings.json`

Project settings override user settings.

Example:

```json
{
  "websearch": {
    "provider": "tavily",
    "apiKey": "tvly-dev-..."
  }
}
```

Provider-specific settings can also be nested:

```json
{
  "websearch": {
    "provider": "brave",
    "providers": {
      "brave": {
        "apiKey": "..."
      }
    }
  }
}
```

Input:

| Field | Required | Description |
| --- | --- | --- |
| `query` | yes | Search query, minimum 2 characters. |
| `allowed_domains` | no | Keep only results whose hostname exactly matches or is a subdomain. |
| `blocked_domains` | no | Drop results whose hostname exactly matches or is a subdomain. |
| `limit` | no | Maximum results. Default `10`, maximum `15`. |

Supported providers:

| Provider | Required settings | Environment fallback | API shape |
| --- | --- | --- | --- |
| `duckduckgo` or `ddg` | none | none | Scrapes DuckDuckGo HTML results. |
| `tavily` | `apiKey` | `TAVILY_API_KEY` | `POST https://api.tavily.com/search`, Bearer token. |
| `exa` | `apiKey` | `EXA_API_KEY` | `POST https://api.exa.ai/search`, `x-api-key`. |
| `brave` | `apiKey` | `BRAVE_API_KEY` | `GET https://api.search.brave.com/res/v1/web/search`, `X-Subscription-Token`. |
| `bing` | `apiKey` | `BING_API_KEY` | `GET https://api.bing.microsoft.com/v7.0/search`, `Ocp-Apim-Subscription-Key`. |
| `you` or `you.com` | `apiKey` | `YOU_API_KEY` | `GET https://api.ydc-index.io/v1/search`, `X-API-Key`. |
| `jina` | `apiKey` | `JINA_API_KEY` | `GET https://s.jina.ai/`, Bearer token. |
| `mojeek` | `apiKey` | `MOJEEK_API_KEY` | `GET https://www.mojeek.com/search?fmt=json`, Bearer token. |
| `linkup` | `apiKey` | `LINKUP_API_KEY` | `POST https://api.linkup.so/v1/search`, Bearer token. |
| `custom` | `baseUrl` | `WEB_SEARCH_API` | Generic JSON endpoint. Defaults to `GET` with query parameter `q`; optional `apiKey`, `method`, and `queryParam`. |

The provider list and adapter boundaries are informed by OpenClaude's
WebSearch provider architecture. NDX intentionally defaults to DuckDuckGo only
instead of OpenClaude's full auto-fallback chain so a provider configured in
settings fails loudly when misconfigured.
