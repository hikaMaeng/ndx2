# 내장 Basetools 레퍼런스

내장 process-backed tool은 `packages/ndx/src/agent/tool/base` 아래의 `tool.json`과 실행 스크립트로 정의된다. Registry는 이 tool들을 builtin source로 읽고 model tool schema에 노출한다. Docker runtime에서는 같은 tree가 `/app/dist/server/base`에 있어야 한다.

## 파일과 shell 도구

| 도구 | 필수 입력 | 용도 | 주의 |
| --- | --- | --- | --- |
| `bash` | `command` | shell command 실행 | 파일 읽기/검색/편집은 전용 도구를 우선한다. |
| `read_file` | `path` | 텍스트 파일 일부 또는 전체 읽기 | `offset`, `limit`으로 범위를 줄일 수 있다. |
| `grep_search` | `pattern` | 정규식 텍스트 검색 | `glob`, `limit`으로 결과 폭을 제한한다. |
| `glob` | `pattern` | 파일 path 검색 | 기본 limit은 100이다. |
| `edit` | `file_path`, `old_string`, `new_string` | 정확한 문자열 치환 | `replace_all`이 아니면 old string은 정확히 한 번만 매치되어야 한다. |
| `write_file` | `file_path`, `content` | 전체 파일 쓰기 | parent directory를 만든다. |

모든 path 입력은 project root 상대 경로 또는 NDX virtual root 하위 container absolute path여야 한다. Windows host path를 직접 전달하는 대신 server path mapping을 통해 container path가 정리되어야 한다.

## 작업/시각/웹 도구

| 도구 | 필수 입력 | 용도 | 제한 |
| --- | --- | --- | --- |
| `cot_work` | `steps` | 3단계 이상 작업의 절차 계획/진행 추적 | 매 호출마다 전체 step list를 보내야 한다. |
| `getImage` | `path` | 로컬 이미지 파일 검사 | 이미 current message에 첨부된 이미지는 다시 열지 않는다. |
| `loadSkill` | `name` | available skill의 전체 instruction 로딩 | skill list에 있는 이름만 사용한다. |
| `web_fetch` | `url` | public HTTP(S) URL fetch | private/auth/local/credentialed URL은 지원하지 않는다. |
| `web_search` | `query` | public web 검색 | DuckDuckGo는 설정 없이 동작하고, 다른 provider는 settings가 필요하다. |

## cot_work 규칙

`cot_work` schema는 단순 todo list가 아니다. step은 `pending -> in_progress -> completed` 순서로 전환해야 하고, 정확히 하나의 step만 `in_progress`일 수 있다. 작업 중 scope가 바뀌면 `reason`을 포함해 전체 계획을 갱신해야 한다.

## web_search 설정

`web_search`는 `allowed_domains`, `blocked_domains`, `limit`을 지원한다. 기본 limit은 10이고 최대 15다. Public web 검색 도구이므로 인증된 사내 문서나 localhost 검증에는 맞지 않는다.

## tool selection 원칙

| 상황 | 우선 도구 |
| --- | --- |
| 파일 목록이 필요함 | `glob` |
| 텍스트 위치를 찾아야 함 | `grep_search` |
| 특정 파일 일부를 읽어야 함 | `read_file` |
| 간단한 파일 치환 | `edit` |
| 새 파일 전체 작성 | `write_file` |
| test/build 실행 | `bash` |
| skill body 필요 | `loadSkill` |

도구는 많지만 목적은 겹치지 않아야 한다. 읽기/검색/편집은 narrow tool을 쓰고, shell은 command execution 경계로 남겨야 결과가 더 예측 가능하다.
