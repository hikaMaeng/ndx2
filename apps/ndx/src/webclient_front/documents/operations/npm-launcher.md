# npm 런처

`npm` 폴더는 최종 사용자가 저장소를 clone/build하지 않고 NDX를 시작하기 위한 패키지를 제공한다. CLI entrypoint는 `npm/bin/ndx2.js`이고, template compose는 `npm/templates/docker-compose.yml`이다.

## 명령

| 명령 | 동작 |
| --- | --- |
| `ndx2` | 초기화가 없으면 묻고, 있으면 Docker stack을 시작한다. |
| `ndx2 start` | `ndx2`와 같다. |
| `ndx2 uninstall` | npm 초기화 상태와 compose stack을 제거한다. root volume은 보존한다. |
| `ndx2 --version` | npm package version을 출력한다. |
| `ndx2 --help` | 사용법을 출력한다. |

## 초기화 상태

| 파일 | 역할 |
| --- | --- |
| `~/.ndx2/npm-install.json` | 선택한 root volume, agent port, compose path, version을 저장한다. |
| `~/.ndx2/docker-compose.yml` | GHCR agent image를 실행할 compose 파일. |

첫 실행은 Docker availability를 검사하고, root volume path를 질문하고, `18082`부터 `18999` 사이에서 비어 있는 host port를 찾는다. 이후 실행은 저장된 상태를 읽고 `docker compose -f ~/.ndx2/docker-compose.yml up -d`만 수행한다.

## compose template

Template compose는 `ghcr.io/hikamaeng/ndx2-agent:__IMAGE_TAG__`를 사용한다. 선택한 root volume은 `/ndx`에 bind mount되고, Docker socket도 agent container로 전달된다. 이 런처는 개발 저장소의 `docker-compose.yml`과 달리 npm 사용자용 standalone stack을 만든다.

## 설치 실패 지점

| 실패 | 메시지/원인 |
| --- | --- |
| Docker 없음 | `docker --version` 실패. |
| daemon 미실행 | `docker info` 실패. |
| Compose v2 없음 | `docker compose version` 실패. |
| port 없음 | `18082-18999` 범위에서 free port를 찾지 못함. |
| compose up 실패 | GHCR image pull, volume permission, Docker socket 문제. |

## 설계 이유

NDX는 pgvector, Chromium, Docker CLI, Playwright runtime, Node runtime을 포함하는 복합 런타임이다. 사용자가 로컬 Node/Yarn/Turbo 빌드 체인을 모두 맞추게 하는 대신, npm 런처는 Docker stack을 만들고 browser URL만 알려준다. 이 방식은 개발자용 저장소 흐름과 최종 사용자 설치 흐름을 분리한다.
