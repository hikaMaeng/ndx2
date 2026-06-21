# 세션 스키마와 검색

세션 스키마는 `packages/ndx/src/agent/session/schema.ts`가 SQL 문자열로 소유한다. 이 파일은 `session`, `sessiondata`, `sessionsearch` 테이블과 index, Korean full-text search helper, pgvector embedding index를 초기화한다.

## session

| 컬럼 | 계약 |
| --- | --- |
| `sessionid` | UUID primary key. |
| `title` | 사용자 표시 제목. |
| `mode` | `none` 또는 `light`. |
| `projectname` | `/ndx/workspace` 바로 아래 프로젝트 폴더명. |
| `model` | openai-compatible model config JSON. |
| `isrunning` | 현재 turn 실행 여부. |
| `turnphase` | interrupt/checkpoint phase. |
| `interruptrequested` | durable interrupt request flag. |
| `runtimedata` | inline attachment ids 같은 runtime coordination JSON. |

`session`은 UI 표시용 row가 아니라 agent runtime coordination row다. 따라서 title, lastupdated 같은 metadata와 turnphase, interrupt flag 같은 실행 상태가 함께 존재한다.

## sessiondata

`sessiondata`는 ordered append-only history다. `dataid bigserial`이 append order key이고, `contents jsonb`는 `kind` discriminator가 있는 object여야 한다. context reconstruction은 이 table을 source of truth로 삼는다.

## sessionsearch

`sessionsearch`는 `sessiondata`의 검색 projection이다. 모든 row가 들어가지 않고, 현재는 user request와 final assistant answer만 projection한다.

| 컬럼 | 계약 |
| --- | --- |
| `dataid` | 원본 `sessiondata.dataid`. |
| `text` | 검색용 plain text. |
| `fts` | `textsearch_ko`가 있으면 Korean regconfig, 없으면 `simple`. |
| `embedding` | `vector(4096)`, 없으면 zero vector. |
| `hnsw` | `vector(256)`, `embedding`의 앞 256차원을 잘라 저장하는 HNSW 검색 필드. |
| `tokenlength` | tsvector position 기반 token count. |

## 검색 모드

`packages/ndx/src/agent/session/sessionSearch.ts`의 `searchSessionHistory`는 세 가지 모드를 가진다.

| mode | 조건 |
| --- | --- |
| `list` | query가 없을 때 최신 row를 반환. |
| `vector` | embeddings 설정과 query embedding 생성이 모두 성공할 때. |
| `fts` | query가 있지만 embeddings가 없거나 실패했을 때. |

Vector 검색은 similarity, FTS rank, lexical substring score를 함께
사용한다. 4096차원 `embedding`은 원본 보존 필드이고, HNSW cosine index와
similarity 계산은 별도 256차원 `hnsw` 필드에만 적용한다. zero vector row는
similarity 계산에서 제외한다. FTS-only 검색도
`websearch_to_tsquery(ndx_sessionsearch_regconfig(), query)`에 lexical
substring score를 더해 코드 식별자 prefix 검색을 보완한다.

## embedding worker

새 projection row가 들어오면 embedding 설정이 있는 경우 detached Node worker가 실행된다. worker는 `NDX_DATABASE_URL`, `NDX_SESSIONSEARCH_DATAID`, `NDX_SESSIONSEARCH_TEXT`, `NDX_SESSIONSEARCH_EMBEDDINGS`를 받아 `embedding` column과 `hnsw` column을 함께 갱신한다. `embedding`은 4096차원으로 맞추고 `hnsw`는 그 앞 256차원만 사용한다. turn loop는 이 worker를 기다리지 않는다. 검색 품질은 나중에 좋아질 수 있지만, user-facing turn latency는 embedding endpoint에 묶이지 않는다.
