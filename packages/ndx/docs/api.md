# API

Exports grouped by subpath. Partitions and drill-down symbols are in
[architecture.md](architecture.md); consumers and invariants are in
[constraints.md](constraints.md#blast-radius).

Public exports:

| Export | Purpose |
| --- | --- |
| `ndx` | Common domain entrypoint. |
| `ndx/common` | Runtime-neutral common entrypoint. |
| `ndx/common/log` | JSONL logging helper. |
| `ndx/common/protocol` | Shared protocol DTO entrypoint. |
| `ndx/common/responseapi` | Provider-neutral model request/response abstraction. |
| `ndx/agent` | Agent metadata only; runtime APIs use focused subpaths. |
| `ndx/agent/init` | Agent server initialization and database handle contracts. |
| `ndx/agent/account` | Account identity operations. |
| `ndx/agent/session` | Project session persistence and history operations. |
| `ndx/agent/compact` | Durable context compaction and model-window row selection. |
| `ndx/agent/selfcheck` | Agent self-check run/candidate/check persistence and execution. |
| `ndx/agent/chat` | Chat folder/session persistence and chat turn authority. |
| `ndx/agent/turnloop` | Agent turn orchestration boundary. |
| `ndx/agent/requestQue` | Per-session request queue domain and bridge contracts. |
| `ndx/agent/tool` | Tool registry and execution boundary. |
| `ndx/agent/hook` | Hook plan/runtime boundary. |
| `ndx/agent/context` | Agent context construction and skill metadata loading. |
| `ndx/agent/contextusage` | Context-window accounting helpers. |
| `ndx/agent/runtime-settings` | Runtime settings reader and defaults. |
| `ndx/webclient/common` | Webclient shared protocol and DTO entrypoint. |
| `ndx/webclient/common/protocol` | Webclient API protocol entrypoint. |
| `ndx/webclient/front` | Browser-facing helper entrypoint. |
| `ndx/webclient/server` | Server-side webclient persistence and settings entrypoint. |
| `ndx/webclient/server/client-state` | Browser client-state persistence entrypoint. |
| `ndx/common/server-path` | Server-side path mapping and fixed container path contracts. |

Add APIs only when a requested product behavior needs a durable domain contract.

## `ndx/common`

| API | Purpose |
| --- | --- |
| `uuid7()` | Creates UUIDv7-shaped ids for index-friendly product identifiers. |
| `normalizeWslPath(value)` | Normalizes Windows and WSL-style paths into POSIX form. |
| `ndxBasePath(userHome?)` | Returns the `.ndx` base directory under a user home. |
| `ndxFilePath(userHome, ...segments)` | Builds a normalized path under `.ndx`. |
| `readTextFileOptional(filePath)` | Reads UTF-8 text and returns `undefined` when the file is absent. |
| `writeTextFileIfNotExists(filePath, text)` | Writes UTF-8 text without overwriting an existing file. |
| `ensureDirectory(path)` | Creates a directory recursively. |
| `copyDirectoryRecursively(source, target, options?)` | Copies a directory tree, optionally overwriting existing files. |

## `ndx/common`

No server-only initialization or database API is exported from this runtime-neutral surface.

## `ndx/common/server-path`

| API | Purpose |
| --- | --- |
| `defaultServerVolumeMap()` | Reads host-side `NDX_ROOT`; container paths stay fixed. |
| `NDX_CONTAINER_ROOT` | Fixed runtime mount root, `/ndx`. |
| `NDX_CONTAINER_ASSETS_ROOT` | Fixed runtime user asset root, `/ndx/.ndx`. |
| `NDX_CONTAINER_DATA_ROOT` | Fixed app data root, `/ndx/.ndx/data`. |
| `NDX_CONTAINER_LOG_ROOT` | Fixed log root, `/ndx/.ndx/log`. |
| `NDX_CONTAINER_WORKSPACE` | Fixed workspace mount path, `/ndx/workspace`. |
| `NDX_CONTAINER_USER_HOME` | Fixed runtime user home, `/ndx`. |
| `NDX_CONTAINER_NDX_HOME` | Fixed mounted user `.ndx` directory, `/ndx/.ndx`. |
| `serverContainerRoot()` | Returns the fixed runtime mount root unless a test supplies an explicit map. |
| `serverContainerWorkspace()` | Returns the fixed workspace root unless a test supplies an explicit map. |
| `serverHostWorkspace()` | Returns the host-side workspace path as `NDX_ROOT/workspace` for web metadata. |
| `serverContainerUserHome()` | Returns the fixed user home unless a test supplies an explicit map. |
| `serverContainerNdxHome()` | Returns the fixed user `.ndx` home unless a test supplies an explicit map. |
| `toServerContainerPath(value, map?)` | Maps Windows, WSL, and container paths under configured host volumes into container paths. |
| `toServerProjectPath(value, map?)` | Resolves a project path into the container workspace path space. |
| `toServerWorkspacePath(value, map?)` | Requires a path to remain inside the fixed workspace volume. |
| `toServerWorkspaceDescendantPath(value, map?)` | Requires a project path below the workspace root. |
| `serverPathRelativeToWorkspace(value, map?)` | Returns the workspace-relative path used by web workspace browsing. |

## `ndx/agent`

| API | Purpose |
| --- | --- |
| `agentServerDomain` | Stable metadata for the agent service surface. |

## `ndx/agent/init`

| API | Purpose |
| --- | --- |
| `initServer(options?)` | Seeds server-owned `.ndx` assets and initializes account/session DB schemas when a database is requested. Runtime callers use the returned initialized database handle. |
| `NDXDatabase` | Minimal query/close interface accepted by init and schema functions. |

## `ndx/agent/context`

| API | Purpose |
| --- | --- |
| `buildContext(sessionMetadata)` | Builds the single developer context string and single user context string for an agent turn from the session model config, cwd, homes, and environment metadata. |
| `resolveModelInstruction(model)` | Resolves the static model instruction, trimming `:` suffixes from the right before falling back to the default prompt. |
| `loadSkills(options?)` | Loads available skill metadata for session socket skill-list responses. |
| `SessionMetadata` | Input contract for context construction; `model` is the persisted `NDXModelConfig`, including `contextsize` for skills budget calculation. |
| `BuiltContext` | `{ developer, user }` context output contract. |

## `ndx/agent/session`

| API | Purpose |
| --- | --- |
| `initSessionDatabase(database)` | Runs explicit session, sessiondata, and sessionsearch schema initialization. |
| `createSession(database, input)` | Inserts session metadata with UUIDv7-shaped id, empty title, default `none` mode, and idle state. |
| `getSession(database, sessionid)` | Reads one session metadata row. |
| `listSession(database, userid, projectname)` | Lists sessions for one owner and workspace project name, newest `lastupdated` first. |
| `updateSessionStartTurn(database, sessionid, model?)` | Marks a user-request turn running; updates model only when the next request supplies it. |
| `updateSessionEndTurn(database, sessionid)` | Marks the turn idle and refreshes `lastupdated`. |
| `updateSessionTitle(database, sessionid, title)` | Applies direct user title changes without changing turn lifecycle state. |
| `appendSessionData(database, sessionid, type, contents)` | Appends JSONB history and refreshes the session; first string `user` item becomes title when title is empty. |
| `listSessionData(database, sessionid)` | Returns ordered session history. |
| `NDXModelConfig` | Persisted model/provider configuration for a session. |
| `NDXSessionRow` | Session metadata row contract. |
| `NDXSessionDataRow` | Append-only session history row contract. |

## `ndx/agent/account`

| API | Purpose |
| --- | --- |
| `DEFAULT_NDX_USERID` | Mandatory default account id, `ndev`. |
| `createUser(database, userid)` | Creates an account row. |
| `listUser(database)` | Lists account rows. |
| `getUser(database, userid)` | Reads one account row. |

## `ndx/agent/selfcheck`

| API | Purpose |
| --- | --- |
| `runSelfcheckOnce(database, options)` | Runs one bounded self-check extraction/analysis pass. |
| `listSelfcheck`, `getSelfcheck`, `updateSelfcheckStatus` | Self-check persistence helpers. |
| `listSelfcheckCandidates`, `listSelfcheckCursors`, `listSelfcheckRuns` | Self-check queue, cursor, and run inspection helpers. |

## `ndx/agent/chat`

| API | Purpose |
| --- | --- |
| `ensureRootChatFolder(database, userid)` | Ensures the account root chat folder exists. |
| `createChatFolder`, `listChatFolder`, `deleteChatFolder` | Chat folder persistence helpers. |
| `createChatSession`, `listChatSession`, `deleteChatSession` | Chat session persistence helpers. |
| `runChatSessionTurn(database, session, request, model?, events?)` | Runs a chat turn inside agent authority. |

## `ndx/agent/turnloop`

| API | Purpose |
| --- | --- |
| `runAgentTurn(database, session, request, model?, events?)` | Runs one agent turn against durable session state. |
| `runAgentTurnWithCompactContinuation(...)` | Runs a turn and performs one bounded continuation after compaction. |
| `runAgentTurnWithAfterResponseTriggers(...)` | Runs the current turn, then returns an optional launch handle for post-response queued work scheduled on a later macrotask. |
| `runQueuedAgentTurns(...)` | Claims one queued request for an idle session and returns an optional launch handle for the scheduled turn. |
| `buildTurnMessageParts(database, session)` | Builds developer, user prelude, and history message parts for context usage and request assembly. |
| `requestRuntimeTurnInterrupt(state, reason?)` | Requests model/tool interruption for a running turn state. |

## `ndx/agent/requestQue`

| API | Purpose |
| --- | --- |
| `createNDXSessionRequestQueueRegistry()` | Creates the per-process queue registry used by the socket server. |
| `NDXSessionRequestQueueEditBridge` | Queue list/add/update/delete/clear authority for clients and tools. |
| `NDXSessionRequestQueueConsumerBridge` | Queue claim/release/complete authority for the base `turn.end` hook and root turn-loop launcher. |
| `sessionRequestQueueItemForSocket(item)` | Projects an internal queue item to the shared socket DTO. |

## `ndx/agent/tool`

| API | Purpose |
| --- | --- |
| `listAvailableTools(options?)` | Returns merged project/user/builtin tools, including function tools `askUserQuestion` and `session_history`. |
| `executeToolCalls(toolCalls, options?)` | Executes process and function tools. Function tools run inside agent authority and must preserve durable history ordering. |

## `ndx/agent/hook`

| API | Purpose |
| --- | --- |
| `loadNDXHookRuntime(options?)` | Loads system and project hook plans. |
| `runNDXHooks(runtime, event, context)` | Executes hooks for one documented event. |
| `NDXHookEventName` | Frozen hook event-name union. |

## `ndx/agent/contextusage`

| API | Purpose |
| --- | --- |
| `estimateContextTokens(value)` | Estimates token usage for text or model-visible content. |
| `calculateDetailedContextUsage(messages, contextsize, assistantText?, tools?)` | Calculates usage parts for webclient context display. |

## `ndx/agent/runtime-settings`

| API | Purpose |
| --- | --- |
| `readAgentRuntimeSettings(userHome)` | Reads runtime loop settings and compatibility settings such as `tools.prompt_rewrite.model` for the `[[rewriter]]` marker hook. |

## `ndx/webclient/server`

| API | Purpose |
| --- | --- |
| `loadModelSettings(userHome)` | Reads provider/model settings from `.ndx/settings.json`. |
| `saveModelSettings(userHome, settings)` | Persists provider/model settings back to `.ndx/settings.json`. |
| `normalizeModelPatchSettings(input)` | Normalizes model patch input before persistence. |
| `applyModelPatchSettings(userHome, input)` | Applies model patch data to settings storage. |
