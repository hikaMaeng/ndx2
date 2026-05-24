ndx2는 TypeScript 기반 웹 서비스 중심 코딩 에이전트 프로젝트입니다.

# ndx2

이 저장소는 특정 기존 에이전트 구현을 옮기는 프로젝트가 아닙니다. Turbo 모노레포, Express 서버, React 웹 클라이언트, PostgreSQL 기반 세션 저장소를 중심으로 새로운 에이전트 런타임과 운영 화면을 구현합니다.

## 핵심 방향

- TypeScript + Turbo 모노레포
- Express 기반 웹 서버와 Vite React 프론트엔드
- `apps/admin` 관리 서비스와 `apps/agent` 에이전트 세션 서비스
- `packages/ndx` 공유 제품 계약 및 도메인 코드
- PostgreSQL/pgvector를 세션 데이터의 source of truth로 사용
- 기본 계정이 명시되지 않은 경우 `ndev` 계정 사용

## 저장소 구조

```text
apps/
  admin/   # administration service
  agent/   # agent session service and web client
packages/
  ndx/     # shared common/admin/agent contracts
docs/      # durable project contracts and architecture notes
pgvector/  # local PostgreSQL image with pgvector and Korean text search tooling
scripts/   # deployment and scaffold support scripts
```

## 요구 사항

- Node.js with Corepack
- Yarn 4 Plug'n'Play
- Docker and Docker Compose

## 설치

```bash
git clone <repository-url>
cd ndx2
corepack enable
yarn install --immutable
```

## 로컬 실행

전체 Compose 스택을 직접 올릴 수 있습니다.

```bash
docker compose up -d --build
```

또는 서비스별 배포 스크립트를 사용할 수 있습니다.

```bash
npm run deploy -- apps/admin
npm run deploy -- apps/agent
npm run deploy -- --all
```

기본 로컬 URL:

| Surface | URL |
| --- | --- |
| Admin service | `http://127.0.0.1:18081` |
| Agent web client | `http://127.0.0.1:18082` |
| Agent session health | `http://127.0.0.1:18082/api/session/health` |
| Agent session socket | `ws://127.0.0.1:18082/session` |

PostgreSQL은 Compose 내부 서비스 `pgvector`로 실행되며 외부 호스트 포트를 열지 않습니다. 컨테이너 내부 점검은 다음 명령을 사용합니다.

```bash
docker exec -it pgvector psql -U ndev -d ndev
```

## 개발 명령

| Command | Purpose |
| --- | --- |
| `yarn install --immutable` | Validate Yarn Plug'n'Play dependencies |
| `yarn build` | Run Turbo build tasks |
| `yarn test` | Run Turbo test tasks |
| `yarn lint` | Run TypeScript lint checks |
| `npm run deploy -- apps/admin` | Deploy the admin service through Docker Compose |
| `npm run deploy -- apps/agent` | Deploy the agent service through Docker Compose |
| `npm run deploy -- --all` | Deploy all app services through Docker Compose |

## 문서

| Goal | File |
| --- | --- |
| Understand purpose | [docs/overview.md](docs/overview.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| API reference | [docs/api.md](docs/api.md) |
| Usage | [docs/usage.md](docs/usage.md) |
| Constraints | [docs/constraints.md](docs/constraints.md) |
| Internals | [docs/internals.md](docs/internals.md) |
| Testing | [docs/testing.md](docs/testing.md) |

| Subject | Path |
| --- | --- |
| Previous project README | [PROJECT.md](PROJECT.md) |
| License posture | [docs/licensing.md](docs/licensing.md) |
| Account model | [docs/accounts.md](docs/accounts.md) |
| Session model | [docs/sessions.md](docs/sessions.md) |
| Session data source | [docs/session-data.md](docs/session-data.md) |
| Runtime volume | [docs/runtime-volume.md](docs/runtime-volume.md) |
| Interrupts and queued work | [docs/runtime-control.md](docs/runtime-control.md) |
| Code placement | [docs/code-placement.md](docs/code-placement.md) |

## 라이선스

이 저장소 자체의 라이선스는 아직 결정되지 않았습니다.

외부 코드, 문서, 설정, 설계를 복사하거나 각색하는 경우 해당 라이선스 고지와 출처를 보존해야 합니다. 자세한 규칙은 [docs/licensing.md](docs/licensing.md)를 확인하세요.
