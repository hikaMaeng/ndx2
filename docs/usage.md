# Usage

Use `npm run deploy -- apps/ndx` or `npm run deploy -- --all` for the baseline deployment path. The deploy script
runs the required Yarn install check, builds the target service, and refreshes
Docker Compose.

App deployment builds and recreates only the requested app service. PostgreSQL
runs inside the agent container from the prebuilt pgvector base image.

Current local commands:

| Command | Purpose |
| --- | --- |
| `yarn install --immutable` | Validate Yarn Plug'n'Play dependencies |
| `yarn build` | Run Turbo build tasks |
| `yarn test` | Run Turbo test tasks |
| `yarn lint` | Run TypeScript lint checks |
| `npm run deploy -- apps/ndx` | Deploy the agent service through Docker Compose |
| `npm run deploy -- --all` | Deploy the compose-owned app services |

## npm Docker Launcher

End-user npm installation is separate from the clone-and-build repository flow.
The npm package lives under `npm/` and installs the `ndx2` command:

```sh
npm install @neurondev/ndx2
npx ndx2
```

or, for direct shell access:

```sh
npm install -g @neurondev/ndx2
ndx2
```

The first run checks Docker availability, asks for the ndx root volume path,
writes `~/.ndx2/docker-compose.yml`, records `~/.ndx2/npm-install.json`, starts
the public GHCR agent image, and prints the Agent URL. Later runs reuse the saved
state and only refresh/start the compose stack.

Use `ndx2 uninstall` to remove the npm initialization flag and generated compose
stack. The selected ndx root directory is intentionally left on disk.

The npm release process and GHCR image contract are documented in
`npm-release.md`.

Default local service URLs:

| Service | URL |
| --- | --- |
| Agent web client | `http://127.0.0.1:18082` |
| Agent session health | `http://127.0.0.1:18082/api/session/health` |
| Agent session socket | `ws://127.0.0.1:18082/session` |

Agent runtime logs are JSON Lines written to both console and files under
`/ndx/.ndx/log` in the agent container. Docker mounts the repository `volume/`
directory at `/ndx` for application containers.

| Surface | File Path |
| --- | --- |
| Web client backend API | `.ndx/log/web/YYYY/MM/DD.log` |
| Session-specific agent events | `.ndx/log/session/<sessionid>/YYYYMMDD.log` |
| Agent process events without a session id | `.ndx/log/agent/YYYY/MM/DD.log` |

## Agent Runtime Volume

Application containers use one host-owned bind mount:

| Host Path | Container Path | Purpose |
| --- | --- | --- |
| `F:/dev/ndx2/volume` | `/ndx` | Runtime root for global `.ndx`, workspace files, and the local PostgreSQL host data directory. |

Runtime paths under `/ndx` are fixed:

| Container Path | Purpose |
| --- | --- |
| `/ndx/.ndx` | Global NDX home data, prompts, skills, plugins, memories, tools, runtime i18n overrides, and logs. |
| `/ndx/workspace` | Project workspace root browsed by the web client and used by session tool execution. |
| `/ndx/pgvector` | Local PostgreSQL/pgvector data directory. |

Multimodal chat attachments are stored below the selected project root, not in
PostgreSQL:

`/ndx/workspace/<project>/.ndx/sessions/<sessionid>/<uuid>`

Set model `modalities` in the web model picker or in
`F:/dev/ndx2/volume/.ndx/settings.json` model metadata. Use `["text"]` for
text-only models, add `"image"` for image input, and add `"file"` for file
input. Provider model-list APIs are not authoritative for this flag.

The web client can append `[[rewriter]]` to a session request when the Rewrite
toggle is enabled for that session. The server removes the marker before
storage, rewrites the request, and stores the rewritten prompt as the durable
user row.

The rewriter normally uses the active session model. To dedicate a configured
model to rewriting, set:

```json
{
  "tools": {
    "prompt_rewrite": {
      "model": "qwen3.6-35b-mp"
    }
  }
}
```

The value may be a model key from `models` or a model name. Provider URL, token,
context size, and inference options are resolved from the configured provider
when a matching model is found; otherwise the active session provider is reused.
come from the active session model configuration.

`session_history` uses `sessionsearch` in PostgreSQL/pgvector. To enable vector
ranking, configure an OpenAI-compatible embeddings endpoint in
`F:/dev/ndx2/volume/.ndx/settings.json`:

```json
{
  "embeddings": {
    "provider": "local",
    "model": "text-embedding-3-small",
    "url": "http://127.0.0.1:11434/v1"
  }
}
```

Without this block, new `sessionsearch` rows keep a zero vector and
`session_history` falls back to Korean full-text ranking. The setting affects
only search indexing/query embedding; model inference settings remain separate.

The matching agent environment variables are:

| Variable | Value | Contract |
| --- | --- | --- |
| `NDX_ROOT` | `/ndx` | Fixed container runtime root. |
| `NDX_HOST_ROOT` | `F:/dev/ndx2/volume` | Physical host path that maps to fixed container path `/ndx` and is sent to the web client for VS Code links. |

`NDX_ROOT` is the container-side root used by the server, tools, PostgreSQL, and
workspace browsing. `NDX_HOST_ROOT` is the host-side name for the same directory;
it is used for metadata, VS Code open requests, and Windows/WSL path validation.
It is not a database location setting.

When bootstrapping a fresh Windows-backed PostgreSQL directory, run Compose from
the Windows path context so Docker mounts `F:\dev\ndx2\volume` to `/ndx`.
`/ndx/pgvector/pgdata` then appears as
`F:\dev\ndx2\volume\pgvector\pgdata` and receives PostgreSQL-compatible
ownership metadata.

Do not configure separate host workspace, user home, container workspace, or log
environment variables. The web client receives `NDX_HOST_ROOT/workspace` and
`/ndx/workspace` through metadata and sends relative project paths under that
root. The session server maps Windows, WSL, and container paths under
`NDX_HOST_ROOT` before resolving project
identity in PostgreSQL and before tool execution.

The complete runtime-volume contract is maintained in `runtime-volume.md`.

Product usage assumptions:

* A user may connect without a special login step; the server then uses the mandatory `ndev` account.
* Every session belongs to an account and project id category.
* Multiple clients may connect to the same session and receive downstream events.
* A client with no local history should request history restoration before appending live events.
* Clients append only events whose ids they do not already own.

Implementation work must keep these assumptions visible in API docs, tests, and UI flows as the product moves beyond the scaffold.

## Local Data Store (PostgreSQL/pgvector)

This repository runs PostgreSQL inside the `agent` container for session data.

- Start stack: `docker compose up -d --build`
- Check service: `docker compose ps agent`
- Tail logs: `docker compose logs -f agent`

### 접속 및 점검

포트가 외부에 열려 있지 않으므로 다음 방식으로만 접속합니다.

- 컨테이너 내부에서 접속:
  `docker exec -it agent psql -U ndev -d ndev`

- 앱 코드에서는 같은 컨테이너의 로컬 PostgreSQL을 사용:
  `postgresql://ndev:ndev@127.0.0.1:5432/ndev`

### 데이터 초기화/운영 규칙

* 스토리지 디렉터리는 ndx 루트 볼륨 하위의 `./volume/pgvector`를 사용한다.
* DB 비밀번호/계정은 기본값 `ndev/ndev`이다.
* 볼륨 데이터는 버전관리 대상이 아니며 `.gitignore`에 등록되어 있다.
* 한국어 형태소 분석기와 검색 확장은 현재 운영 이미지(`pgvector/Dockerfile.pgvector`) 내에서 포함된다.
