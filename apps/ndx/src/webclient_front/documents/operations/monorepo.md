# 모노레포 운영

NDX 저장소는 Yarn 4 Plug'n'Play와 Turbo를 사용한다. package manager migration은 프로젝트 정책 변경 없이는 허용되지 않는다.

## 루트 계약

| 파일 | 계약 |
| --- | --- |
| `package.json` | `packageManager: "yarn@..."`, workspaces, build/test/lint/deploy scripts. |
| `.yarnrc.yml` | `nodeLinker: pnp`, `enableGlobalCache: true`. |
| `yarn.lock` | immutable install 기준. |
| `turbo.json` | task inputs/outputs 명시. |
| `tsconfig.json` | workspace package-name paths만 사용. |
| `docker-compose.yml` | `apps/ndx/docker/Dockerfile` 기반 service. |

## 코드 배치

| 코드 성격 | 위치 |
| --- | --- |
| Express lifecycle/static serving/socket attach | `apps/ndx/src/server` |
| Webclient React composition | `apps/ndx/src/webclient_front` |
| Admin React composition | `apps/ndx/src/admin_front` |
| Agent execution/session/tool/hook/context | `packages/ndx/src/agent` |
| Protocol/resource/server path | `packages/ndx/src/common` |
| Webclient DTO/front/server helpers | `packages/ndx/src/webclient` |
| Durable decision docs | `docs` |

## import 규칙

| 규칙 | 이유 |
| --- | --- |
| packages에서 apps import 금지 | domain이 app wiring에 의존하면 배포/테스트 경계가 깨진다. |
| cross-package relative import 금지 | workspace export 계약을 우회하지 않는다. |
| webclient front에서 `ndx/agent` import 금지 | 브라우저가 agent authority를 갖지 않는다. |
| app은 package export로 import | runtime resolution이 tsconfig alias에만 의존하지 않는다. |

## 의존성 변경

의존성을 바꿀 때는 Yarn 명령을 사용하고 `yarn.lock`을 함께 갱신한다. `pnpm-lock.yaml`, `pnpm-workspace.yaml`, workspace `node_modules`를 정책 없이 추가하면 안 된다.
