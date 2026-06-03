# 설치와 실행

NDX는 웹 서버가 에이전트 세션 서버, 세션 웹 클라이언트, 관리 표면을 함께 제공하는 로컬 우선 코딩 에이전트다. 일반 사용자는 저장소를 직접 빌드하지 않아도 npm 런처로 Docker 기반 런타임을 시작하는 흐름을 기본으로 사용한다.

## 사용자 설치 흐름

| 단계 | 사용자가 하는 일 | 런타임에서 일어나는 일 |
| --- | --- | --- |
| 1 | Docker Desktop 또는 Docker Engine을 준비한다. | 에이전트 컨테이너가 내부 PostgreSQL/pgvector와 웹 서버를 함께 실행할 수 있어야 한다. |
| 2 | `npm install -g @neurondev/ndx2` 또는 `npx ndx2`를 실행한다. | npm 런처가 `~/.ndx2/docker-compose.yml`과 초기화 상태를 만든다. |
| 3 | ndx root volume 경로를 선택한다. | 선택 경로는 컨테이너의 `/ndx`에 바인드되고, 워크스페이스/로그/DB 데이터가 이 하위에 생긴다. |
| 4 | 런처가 GHCR 이미지를 시작한다. | `apps/ndx/docker/Dockerfile`로 만든 agent image가 `ghcr.io/hikamaeng/ndx2-pgvector:<version>` 기반에서 뜬다. |
| 5 | 출력된 Agent URL을 연다. | Express 서버가 Vite 빌드된 웹 클라이언트를 제공하고 `/session` WebSocket을 받는다. |

개발 저장소에서 직접 실행하는 흐름은 다음 명령을 기준으로 한다.

```sh
yarn install --immutable
yarn build
npm run deploy -- apps/ndx
```

## 기본 URL

| 표면 | 기본 경로 |
| --- | --- |
| 웹 클라이언트 | `http://127.0.0.1:18082` |
| 문서 사이트 | `http://127.0.0.1:18082/docs` |
| 관리 사이트 | `http://127.0.0.1:18082/admin` |
| 세션 health | `http://127.0.0.1:18082/api/session/health` |
| 세션 socket | `ws://127.0.0.1:18082/session` |

## 첫 실행 후 확인할 것

1. 왼쪽 상단 문서 아이콘을 눌러 이 문서 사이트가 새 탭에서 열리는지 확인한다.
2. 모델 설정에서 provider URL, model name, context size, modality를 확인한다.
3. 프로젝트 선택 화면에서 `/ndx/workspace` 하위의 실제 작업 폴더를 선택한다.
4. 첫 세션을 만들면 서버는 명시 로그인 정보가 없을 때 `ndev` 계정으로 세션을 생성한다.
5. 세션이 시작되면 모델 요청, 도구 호출, 도구 결과, 최종 응답이 PostgreSQL에 append-only 이력으로 기록된다.

## 실패했을 때 볼 위치

| 증상 | 확인 위치 |
| --- | --- |
| 웹이 열리지 않음 | Docker compose 상태와 `PORT`, host port 매핑 |
| 모델 응답 없음 | 모델 설정 URL/token/model name |
| 세션 복구 이상 | `session`, `sessiondata`, `runtimedata` 테이블 |
| 도구 실행 실패 | `/ndx/.ndx/log/session/<sessionid>/YYYYMMDD.log` |
| PostgreSQL 초기화 실패 | `/ndx/pgvector/pgdata` 권한과 pgvector base image |

NDX의 설치 문서는 단순 사용법으로 끝나면 안 된다. 사용자가 보는 화면, 세션 서버가 소유하는 권한, 컨테이너 내부 데이터 위치가 하나의 실행 흐름으로 연결되어야 한다.
