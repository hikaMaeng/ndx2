# Constraints

## Blast radius

| Surface | Consumers | Invariants (do not break) |
| --- | --- | --- |
| `src/server/index.ts` (process boot) | Docker entrypoint, `npm run deploy` | One Express server owns both HTTP and the WebSocket upgrade; agent init runs before routes attach. |
| `src/server/web/webclient` routes | browser webclient via `ndx/webclient/front` | HTTP contract matches `ndx/webclient/common/protocol`; routes never execute agent turns. |
| `src/server/agent/socketServer.ts` | browser session socket client | `clientid` upgrade handshake order (account → project → ready) is fixed; durable turn events persist before delivery. |
| `src/webclient_front` React shell | end users | Presentation only; screen is a pure projection of model-render stores; no agent execution in the browser. |
| `src/documents_front` | `/docs` site, `docs:audit` | Every backticked source path resolves; new `src/*` dirs land in `reference/source-inventory.md` and a coverage surface. |
| `docker/baseImage` | `scripts/deploy.sh`, local Docker builds | Must publish/load both `linux/amd64` and `linux/arm64` archive variants; app Dockerfile may depend only on the loaded local tag. |
| `npm/Dockerfile` | `apps/ndx/docker/publish-ghcr.sh`, npm users | Must build one final `ndx2-agent:<version>` image directly and must not consume local base-image archives. |

## Frontend locator contract

UI uses shadcn/ui-style components, Tailwind CSS, and semantic markup for
headless-browser smoke tests. Prefer landmarks and accessible names; use the
approved test ids below for structure-independent hooks. See the
`headless-browser-markup` skill for the contract shape.

Landmarks: `main` (session/active surface), `header`, `nav` (menu), `aside`
(sidebars). Smoke checks target `main`, the heading, status text, and buttons by
role/name (see [testing.md](testing.md)).

Approved test ids (stable selectors — do not rename without updating browser tests):

| Test id | Marks |
| --- | --- |
| `user-chat-message` | A user message row in the session transcript. |
| `user-message-attachment` | An attachment chip on a user message. |
| `turn-iteration` | One turn iteration block. |
| `turn-progress` | Turn progress indicator. |
| `turn-tool-run` | A tool run entry within a turn. |
| `cot-work-overlay` | The chain-of-thought work overlay. |
| `right-sidebar-card` | A right-sidebar group card. |
| `right-sidebar-card-item` | An item within a right-sidebar card. |
| `right-sidebar-card-subgroup` | A second-level subgroup heading inside a card. |
| `project-sidebar-item` | A project entry in the left menu. |

Exceptions: right-sidebar items dedupe identical explicit item keys within a
section, so a repeated changed file renders once (see [api.md](api.md)).
