# 서버 경로 매핑

서버 경로 매핑은 `packages/ndx/src/common/server-path`가 소유한다. 목적은 Windows host path, WSL path, container path가 섞이는 환경에서도 session server가 항상 `/ndx` 기준 container path로 실행 대상을 정규화하는 것이다.

## 기본 경로

| 상수 | 값 | 의미 |
| --- | --- | --- |
| `NDX_CONTAINER_ROOT` | `/ndx` | container runtime root. |
| `NDX_CONTAINER_WORKSPACE` | `/ndx/workspace` | project workspace root. |
| `NDX_CONTAINER_USER_HOME` | `/ndx` | agent user home. |
| `NDX_CONTAINER_NDX_HOME` | `/ndx/.ndx` | global NDX home. |
| `NDX_CONTAINER_LOG_ROOT` | `/ndx/.ndx/log` | JSONL log root. |

## 환경 변수

| 변수 | 역할 |
| --- | --- |
| `NDX_ROOT` | container root 또는 configured root fallback. |
| `NDX_HOST_ROOT` | host에서 같은 volume을 가리키는 경로. |
| `NDX_CONTAINER_ROOT` | container root override. |
| `NDX_CONTAINER_WORKSPACE` | workspace override. |
| `NDX_CONTAINER_USER_HOME` | user home override. |
| `NDX_CONTAINER_NDX_HOME` | `.ndx` home override. |

## 변환 함수

| 함수 | 계약 |
| --- | --- |
| `toServerContainerPath` | host/container/WSL path를 container root 하위 path로 변환. |
| `toServerProjectPath` | relative path면 workspace 하위 project path로 해석. |
| `toServerWorkspacePath` | workspace 밖이면 error. |
| `toServerWorkspaceDescendantPath` | workspace root 자체는 project로 거절. |
| `toHostWorkspacePath` | container workspace path를 host workspace path로 변환. |
| `serverPathRelativeToWorkspace` | workspace 기준 relative path 반환. |

## Windows와 WSL

`toServerContainerPath`는 `F:/...` 같은 Windows drive path와 `/mnt/f/...` 같은 WSL path를 모두 host root 안쪽인지 검사한다. Windows path가 configured volume 밖이면 error를 던진다. 이 검증은 browser가 보낸 host path가 container에서 전혀 다른 위치로 해석되는 문제를 막는다.

## 설계 이유

NDX는 Windows host, WSL 개발 환경, Linux container가 동시에 등장한다. path mapping을 각 route나 tool에서 임의 처리하면 project identity와 tool cwd가 달라진다. 따라서 경로 변환은 common package의 작은 domain API로 고정하고, server/webclient/session code는 이 API를 통해서만 project path를 확정해야 한다.
