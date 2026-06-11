# Runtime Volume 계약

루트 `docs/runtime-volume.md`는 `/ndx` runtime volume의 원본 계약이다. 앱 내 문서는 사용자가 Docker/npm/웹 클라이언트 관점에서 이 구조를 이해하도록 다시 설명한다.

## 단일 volume

NDX application container는 하나의 host-owned bind mount를 사용한다.

| Host | Container |
| --- | --- |
| `F:/dev/ndx2/volume` | `/ndx` |

별도 logs volume, workspace volume, app data volume, web assets mount를 추가하지 않는다. 하나의 root를 유지해야 path mapping, DB data, workspace browsing, runtime i18n override가 같은 기준으로 동작한다.

## 주요 디렉터리

| Container path | 역할 |
| --- | --- |
| `/ndx/.ndx` | global NDX home, prompts, skills, plugins, settings, i18n override, logs. |
| `/ndx/.ndx/log` | web/agent/session JSONL logs. |
| `/ndx/workspace` | project workspace root. |
| `/ndx/pgvector` | PostgreSQL/pgvector data root. |

`volume/`은 Git 관리 대상이 아니다. 사용자의 runtime state와 PostgreSQL data가 들어가므로, scaffold source와 분리되어야 한다.

## NDX_ROOT와 NDX_HOST_ROOT

| 변수 | 의미 |
| --- | --- |
| `NDX_ROOT=/ndx` | container 내부 runtime root. |
| `NDX_HOST_ROOT=F:/dev/ndx2/volume` | 같은 volume의 host-side 경로. |

`NDX_ROOT`는 server code와 tools가 사용하는 경로다. `NDX_HOST_ROOT`는 VS Code link, browser metadata, Windows/WSL path validation을 위해 필요하다. DB 위치를 바꾸는 설정이 아니다.

## PostgreSQL 경계

PostgreSQL은 `/ndx/pgvector/pgdata`를 사용한다. `/ndx/data` 같은 두 번째 app-data root를 만들면 session truth가 분산된다. DB는 agent container 내부에서만 접근하고 외부 host port를 열지 않는다.

## Web assets와 i18n

Express server는 `/assets/i18n` 요청에서 `/ndx/.ndx/i18n` runtime override를 먼저 보고, 없으면 bundled `apps/ndx/assets/i18n`을 사용한다. 이 구조는 번들 재빌드 없이 runtime localization을 바꾸기 위한 예외적인 asset overlay다.

## 설계 이유

NDX는 Docker socket, PostgreSQL, workspace tools, browser metadata가 모두 path를 공유한다. Volume을 여러 개로 쪼개면 path conversion과 ownership이 빠르게 불명확해진다. 단일 `/ndx` root는 운영 단순성과 session recovery를 위한 기본 전제다.
