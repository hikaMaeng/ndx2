# 소스 인벤토리

이 문서는 `apps/ndx/src`와 `packages/ndx/src`의 현재 문서화 대상 디렉터리를 코드 감사와 맞추기 위한 인벤토리다. `yarn workspace ndx-app docs:audit`는 아래 경로가 실제 소스에 존재하고 이 문서에 언급되는지 검사한다.

## apps/ndx/src

| 경로 | 문서화 책임 |
| --- | --- |
| `apps/ndx/src/admin_front` | admin React shell, shadcn/ui primitives, admin-only browser composition. |
| `apps/ndx/src/admin_front/components` | admin UI component grouping. |
| `apps/ndx/src/admin_front/components/ui` | admin shadcn/ui component files. |
| `apps/ndx/src/admin_front/lib` | admin front utility glue. |
| `apps/ndx/src/server` | Express process wiring, health/static/API route attachment. |
| `apps/ndx/src/server/agent` | session socket transport, history replay, project negotiation, connection lifecycle. |
| `apps/ndx/src/server/resource` | runtime/bundled resource lookup overlay. |
| `apps/ndx/src/server/web` | web HTTP surface namespace. |
| `apps/ndx/src/server/web/admin` | admin API route registration. |
| `apps/ndx/src/server/web/common` | shared web route types. |
| `apps/ndx/src/server/web/webclient` | webclient API route registration. |
| `apps/ndx/src/webclient_front` | user-facing webclient React shell. |
| `apps/ndx/src/webclient_front/app` | app shell, bridge, layout composition. |
| `apps/ndx/src/webclient_front/app/bridge` | browser/server API bridge wiring. |
| `apps/ndx/src/webclient_front/app/layout` | shell layout controls. |
| `apps/ndx/src/webclient_front/chat` | chat surface composition. |
| `apps/ndx/src/webclient_front/chat/surface` | chat-only surface UI. |
| `apps/ndx/src/webclient_front/documents` | Markdown document site and audit code. |
| `apps/ndx/src/webclient_front/documents/architecture` | architecture Markdown documents. |
| `apps/ndx/src/webclient_front/documents/capabilities` | tools, skills, hooks Markdown documents. |
| `apps/ndx/src/webclient_front/documents/getting-started` | install and first-session Markdown documents. |
| `apps/ndx/src/webclient_front/documents/operations` | Docker, monorepo, testing Markdown documents. |
| `apps/ndx/src/webclient_front/documents/reference` | source map, inventory, long-run documentation plan. |
| `apps/ndx/src/webclient_front/documents/resources` | document-local static resources and future images. |
| `apps/ndx/src/webclient_front/menu` | left menu composition. |
| `apps/ndx/src/webclient_front/menu/area` | menu controller and pane composition. |
| `apps/ndx/src/webclient_front/menu/chat` | chat folder/session menu composition. |
| `apps/ndx/src/webclient_front/menu/components` | shared menu components including document link. |
| `apps/ndx/src/webclient_front/menu/project` | project menu resources. |
| `apps/ndx/src/webclient_front/modal` | cross-surface modal layer. |
| `apps/ndx/src/webclient_front/session` | coding session UI composition. |
| `apps/ndx/src/webclient_front/session/area` | main session surface selection. |
| `apps/ndx/src/webclient_front/session/askUserQuestion` | interactive browser request dialog and protocol conversion. |
| `apps/ndx/src/webclient_front/session/components` | session message, composer, landing, status, context UI. |
| `apps/ndx/src/webclient_front/session/cotWork` | cot work overlay composition. |
| `apps/ndx/src/webclient_front/session/hooks` | session UI/request/socket controllers. |
| `apps/ndx/src/webclient_front/session/modals` | model and session title dialogs. |
| `apps/ndx/src/webclient_front/session/rightsidebar` | session right sidebar resources. |
| `apps/ndx/src/webclient_front/session/socket` | browser session socket client. |
| `apps/ndx/src/webclient_front/session/turn` | turn-flow rendering for model/tool/reasoning steps. |

## packages/ndx/src

| 경로 | 문서화 책임 |
| --- | --- |
| `packages/ndx/src/admin` | admin package namespace. |
| `packages/ndx/src/admin/common` | admin shared contracts. |
| `packages/ndx/src/admin/front` | admin browser-facing helpers. |
| `packages/ndx/src/admin/server` | admin server-side domain helpers. |
| `packages/ndx/src/agent` | agent runtime authority namespace. |
| `packages/ndx/src/agent/account` | default account and user persistence domain. |
| `packages/ndx/src/agent/chat` | project-independent chat runtime. |
| `packages/ndx/src/agent/chat/context` | chat context reconstruction. |
| `packages/ndx/src/agent/chat/folder` | chat folder persistence. |
| `packages/ndx/src/agent/chat/session` | chat session persistence. |
| `packages/ndx/src/agent/chat/tool` | chat tool allowlist policy. |
| `packages/ndx/src/agent/chat/turnloop` | chat turn loop. |
| `packages/ndx/src/agent/compact` | durable context compaction and model-window row selection. |
| `packages/ndx/src/agent/context` | developer/user/environment prompt prelude assembly. |
| `packages/ndx/src/agent/context/availablePluginsInstructions` | plugin instruction rendering. |
| `packages/ndx/src/agent/context/availableSkillsInstructions` | skill discovery and context budget rendering. |
| `packages/ndx/src/agent/context/developerInstructions` | stable developer instruction builder. |
| `packages/ndx/src/agent/context/environmentContext` | stable environment context prelude. |
| `packages/ndx/src/agent/context/modelInstrcution` | model-specific instruction resolver. |
| `packages/ndx/src/agent/context/userInstructions` | project/user instruction collection. |
| `packages/ndx/src/agent/contextusage` | context window accounting. |
| `packages/ndx/src/agent/hook` | hook runtime and system hook plan. |
| `packages/ndx/src/agent/hook/base` | built-in hook implementations shared by hook event folders. |
| `packages/ndx/src/agent/hook/turn.context.prepared` | context-prepared hook implementations. |
| `packages/ndx/src/agent/hook/turn.model.responding` | streaming model response hooks. |
| `packages/ndx/src/agent/hook/turn.request.received` | request-received hooks. |
| `packages/ndx/src/agent/hook/turn.end` | final turn post-processing hooks. |
| `packages/ndx/src/agent/hook/turn.model.request` | pre-model request diagnostics and effects. |
| `packages/ndx/src/agent/hook/turn.tool.called` | pre-tool execution hook. |
| `packages/ndx/src/agent/hook/turn.tool.results.collected` | tool-result hook and loop detection. |
| `packages/ndx/src/agent/init` | runtime initialization and bundled assets. |
| `packages/ndx/src/agent/init/assets` | scaffolded skills, tools, and baseline assets. |
| `packages/ndx/src/agent/project` | durable project identity. |
| `packages/ndx/src/agent/runtime-settings` | runtime settings reader and defaults. |
| `packages/ndx/src/agent/session` | PostgreSQL session/sessiondata/sessionsearch domain. |
| `packages/ndx/src/agent/tool` | tool registry and execution. |
| `packages/ndx/src/agent/tool/base` | built-in process-backed tools and function-tool adapters. |
| `packages/ndx/src/agent/tool/execute` | process/function tool execution. |
| `packages/ndx/src/agent/turnloop` | coding session turn loop. |
| `packages/ndx/src/agent/turnloop/after-loop` | final turn completion, compaction finish, and post-loop handling. |
| `packages/ndx/src/agent/turnloop/base` | shared turn-loop context, state, compact, interrupt, and cot-work helpers. |
| `packages/ndx/src/agent/turnloop/before-loop` | pre-iteration turn-loop preparation. |
| `packages/ndx/src/agent/turnloop/iteration` | per-iteration context preparation and hook integration. |
| `packages/ndx/src/agent/turnloop/model-call` | model request dispatch and streaming event handling. |
| `packages/ndx/src/agent/turnloop/model-response` | model response classification and assistant text handling. |
| `packages/ndx/src/agent/turnloop/request` | user request persistence and turn bootstrap. |
| `packages/ndx/src/agent/turnloop/tool-call` | tool-call execution, result persistence, and tool event fan-out. |
| `packages/ndx/src/common` | runtime-neutral shared contracts. |
| `packages/ndx/src/common/file` | file helper contracts. |
| `packages/ndx/src/common/log` | JSONL logging helper. |
| `packages/ndx/src/common/protocol` | shared protocol namespace. |
| `packages/ndx/src/common/protocol/error` | protocol error contracts. |
| `packages/ndx/src/common/protocol/identity` | client/account identity protocol. |
| `packages/ndx/src/common/protocol/project` | project negotiation protocol. |
| `packages/ndx/src/common/protocol/session` | session socket message/data contracts. |
| `packages/ndx/src/common/protocol/turn` | turn event/card/cot-work protocol. |
| `packages/ndx/src/common/resource` | resource key and localization contracts. |
| `packages/ndx/src/common/responseapi` | model provider request/response abstraction. |
| `packages/ndx/src/common/server-path` | host/container path mapping. |
| `packages/ndx/src/common/uuid7` | UUIDv7 helper. |
| `packages/ndx/src/webclient` | webclient package namespace. |
| `packages/ndx/src/webclient/common` | browser/backend shared webclient contracts. |
| `packages/ndx/src/webclient/common/protocol` | webclient API protocol. |
| `packages/ndx/src/webclient/front` | browser-facing domain helpers. |
| `packages/ndx/src/webclient/front/api` | browser API request helpers. |
| `packages/ndx/src/webclient/front/app` | browser app helper contracts. |
| `packages/ndx/src/webclient/front/i18n` | translation loader. |
| `packages/ndx/src/webclient/front/model` | model form/config helpers. |
| `packages/ndx/src/webclient/front/project` | project UI helper contracts. |
| `packages/ndx/src/webclient/front/session` | session UI helper contracts. |
| `packages/ndx/src/webclient/front/storage` | client-state cache helpers. |
| `packages/ndx/src/webclient/server` | server-side webclient persistence helpers. |
| `packages/ndx/src/webclient/server/client-state` | browser client state table. |
| `packages/ndx/src/webclient/server/model-settings` | provider/model settings store. |

## 감사 정책

이 인벤토리는 사람이 읽는 색인이면서 코드 감사의 입력이다. 새 디렉터리가 추가되면 `apps/ndx/src/webclient_front/documents/audit.mjs`가 실패해야 하고, 문서 작성자는 해당 경로의 책임과 관련 문서를 추가해야 한다.
