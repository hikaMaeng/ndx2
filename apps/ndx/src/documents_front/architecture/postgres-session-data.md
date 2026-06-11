# PostgreSQL 세션 데이터

NDX의 session state는 PostgreSQL이 권위 상태다. 메모리는 현재 turn을 실행하기 위해 임시로 조립한 상태일 뿐이다.

## 주요 테이블

| 테이블 | 역할 |
| --- | --- |
| `project` | 실행 target과 normalized physical path의 durable identity. |
| `session` | 계정, 프로젝트, 모델 설정, 실행 상태, runtime coordination. |
| `sessiondata` | user, assistant, tool call, tool result 등 append-only history. |
| `sessionsearch` | user/final assistant row의 검색 projection과 vector/FTS index. |
| `chatfolder` | project와 분리된 chat folder. |
| `chatsession` | folder에 속한 chat session metadata. |
| `chatsessiondata` | project coding session과 별도인 chat history. |

## sessiondata 원칙

`sessiondata`는 모델 컨텍스트 재구성의 핵심이다. row order가 곧 모델이 보는 history order다.

| 원칙 | 설명 |
| --- | --- |
| append-only | running turn 중 기존 history를 재작성하지 않는다. |
| JSON payload | `contents`는 kind discriminator를 가진 object다. |
| 모델 가시성 분리 | client runtime coordination은 별도 event로 다루고 필요할 때만 model-visible row가 된다. |
| 첨부 reference | DB는 파일 bytes 대신 path/name/mime/size reference를 저장한다. |

## sessionsearch

`sessionsearch`는 `sessiondata`의 일부 row에서 만든 검색 projection이다.

| row 종류 | 저장 여부 |
| --- | --- |
| user request | 저장 |
| final assistant answer | 저장 |
| reasoning delta | 저장하지 않음 |
| tool result JSON 전체 | 저장하지 않음 |
| attachment bytes | 저장하지 않음 |

Korean full-text search는 pgvector image 안의 `textsearch_ko`를 사용한다. embeddings 설정이 없으면 vector는 zero vector로 남고 FTS ranking으로 검색한다.

## 왜 별도 live-session store를 두지 않는가

별도의 authoritative memory store를 만들면 다음 문제가 생긴다.

| 문제 | 결과 |
| --- | --- |
| process crash | running state와 durable state가 어긋난다. |
| multi-client | 어떤 client가 최신인지 판단하기 어렵다. |
| prompt reconstruction | DB row와 memory event의 순서가 섞인다. |
| audit | tool call/result와 final response 증거가 분리된다. |

따라서 session server는 매 모델 요청 전에 PostgreSQL row에서 context를 다시 만든다. 이 비용은 prefix-cache와 crash recovery를 위해 필요한 비용이다.
