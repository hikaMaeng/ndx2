# API

Public exports:

| Export | Purpose |
| --- | --- |
| `ndx` | Common domain entrypoint. |
| `ndx/common` | Runtime-neutral common entrypoint. |
| `ndx/admin/common` | Admin runtime-neutral domain entrypoint. |
| `ndx/admin/server` | Admin server-only domain entrypoint. |
| `ndx/admin/front` | Admin front-only domain entrypoint. |
| `ndx/common` | Agent runtime-neutral domain entrypoint. |
| `ndx/agent` | Agent server-only domain entrypoint. |
| `ndx/agent/cli` | Agent CLI client domain entrypoint. |
| `ndx/webclient/common` | Agent web client domain entrypoint. |
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
| `initServer(options?)` | Seeds server-owned `.ndx` assets and initializes account/session DB schemas when a database is requested. Runtime callers use the returned initialized database handle. |
| `NDXDatabase` | Minimal query/close interface accepted by init and schema functions. |
| `buildContext(sessionMetadata)` | Builds the single developer context string and single user context string for an agent turn from the session model config, cwd, homes, and environment metadata. |
| `resolveModelInstruction(model)` | Resolves the static model instruction, trimming `:` suffixes from the right before falling back to the default prompt. |
| `initSessionDatabase(database)` | Runs explicit `session` and `sessiondata` table/index SQL. |
| `createSession(database, input)` | Inserts session metadata with UUIDv7-shaped id, empty title, default `none` mode, and idle state. |
| `getSession(database, sessionid)` | Reads one session metadata row. |
| `listSession(database, userid, projectname)` | Lists sessions for one owner and workspace project name, newest `lastupdated` first. |
| `updateSessionStartTurn(database, sessionid, model?)` | Marks a user-request turn running; updates model only when the next request supplies it. |
| `updateSessionEndTurn(database, sessionid)` | Marks the turn idle and refreshes `lastupdated`. |
| `updateSessionTitle(database, sessionid, title)` | Applies direct user title changes without changing turn lifecycle state. |
| `appendSessionData(database, sessionid, type, contents)` | Appends JSONB history and refreshes the session; first string `user` item becomes title when title is empty. |
| `listSessionData(database, sessionid)` | Returns ordered session history. |
| `readAgentRuntimeSettings(userHome)` | Reads runtime loop settings and tool-specific settings such as `tools.prompt_rewrite.model`. |
| `listAvailableTools(options?)` | Returns merged project/user/builtin tools, including function tools `askUserQuestion`, `prompt_rewrite`, and `session_history`. |
| `executeToolCalls(toolCalls, options?)` | Executes process and function tools. `prompt_rewrite` requires active `model` and may reuse existing base file/web tools plus `session_history` during its compact rewrite loop. |
| `SessionMetadata` | Input contract for context construction; `model` is the persisted `NDXModelConfig`, including `contextsize` for skills budget calculation. |
| `BuiltContext` | `{ developer, user }` context output contract. |
