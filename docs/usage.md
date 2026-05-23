# Usage

Use `npm run deploy -- apps/admin`, `npm run deploy -- apps/agent`, or
`npm run deploy -- --all` for the baseline deployment path. The deploy script
runs the required Yarn install check, builds the target service, and refreshes
Docker Compose.

App deployment builds and recreates only the requested app services. Compose
dependencies such as `pgvector` are started with `--no-build` and are not rebuilt
as part of `apps/admin` or `apps/agent` deployment.

Current local commands:

| Command | Purpose |
| --- | --- |
| `yarn install --immutable` | Validate Yarn Plug'n'Play dependencies |
| `yarn build` | Run Turbo build tasks |
| `yarn test` | Run Turbo test tasks |
| `yarn lint` | Run TypeScript lint checks |
| `npm run deploy -- apps/admin` | Deploy the admin service through Docker Compose |
| `npm run deploy -- apps/agent` | Deploy the agent service through Docker Compose |
| `npm run deploy -- --all` | Deploy all app services through Docker Compose |

Default local service URLs:

| Service | URL |
| --- | --- |
| Agent web client | `http://127.0.0.1:18082` |
| Agent session health | `http://127.0.0.1:18082/api/session/health` |
| Agent session socket | `ws://127.0.0.1:18082/session` |

Agent runtime logs are JSON Lines written to both console and files under
`/ndx/log` in the agent container. Docker mounts the repository `volume/`
directory at `/ndx` for application containers.

| Surface | File Path |
| --- | --- |
| Web client backend API | `log/web/YYYY/MM/DD.log` |
| Session-specific agent events | `log/session/<sessionid>/YYYYMMDD.log` |
| Agent process events without a session id | `log/agent/YYYY/MM/DD.log` |

## Agent Runtime Volume

Application containers use one host-owned bind mount:

| Host Path | Container Path | Purpose |
| --- | --- | --- |
| `F:/dev/ndx2/volume` | `/ndx` | Runtime root for logs, app data, global `.ndx`, and workspace files. |

Runtime paths under `/ndx` are fixed:

| Container Path | Purpose |
| --- | --- |
| `/ndx/assets` | Runtime web assets, including web-client i18n JSON. |
| `/ndx/log` | Agent and web backend JSONL logs. |
| `/ndx/data` | App-owned local data and database files. |
| `/ndx/.ndx` | Global NDX home data, prompts, skills, plugins, memories, and tools. |
| `/ndx/workspace` | Project workspace root browsed by the web client and used by session tool execution. |

Multimodal chat attachments are stored below the selected project root, not in
PostgreSQL:

`/ndx/workspace/<project>/.ndx/sessions/<sessionid>/<uuid>`

Set model `modalities` in the web model picker or in
`F:/dev/ndx2/volume/.ndx/settings.json` model metadata. Use `["text"]` for
text-only models, add `"image"` for image input, and add `"file"` for file
input. Provider model-list APIs are not authoritative for this flag.

The only matching agent environment variable is:

| Variable | Value | Contract |
| --- | --- | --- |
| `NDX_ROOT` | `F:/dev/ndx2/volume` | Host path that maps to fixed container path `/ndx`. |

Do not configure separate host workspace, user home, container workspace, or log
environment variables. The web client receives `/ndx/workspace` through metadata
and sends relative project paths under that root. The session server maps
Windows, WSL, and container paths under `NDX_ROOT` before resolving project
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

This repository runs PostgreSQL in Compose as a `pgvector` service for session data.

- Start stack: `docker compose up -d --build`
- Check DB service: `docker compose ps pgvector`
- Tail DB logs: `docker compose logs -f pgvector`

### 접속 및 점검

포트가 외부에 열려 있지 않으므로 다음 방식으로만 접속합니다.

- 컨테이너 내부에서 접속:
  `docker exec -it pgvector psql -U ndev -d ndev`

- 앱 코드에서는 Compose 내부 DNS(`pgvector`)를 사용한 연결 문자열을 사용:
  `postgresql://ndev:ndev@pgvector:5432/ndev`

### 데이터 초기화/운영 규칙

* 스토리지 디렉터리는 `./pgvector/data`를 사용한다.
* DB 비밀번호/계정은 기본값 `ndev/ndev`이다.
* 볼륨 데이터는 버전관리 대상이 아니며 `.gitignore`에 등록되어 있다.
* 한국어 형태소 분석기와 검색 확장은 현재 운영 이미지(`pgvector/Dockerfile.pgvector`) 내에서 포함된다.
