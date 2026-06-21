# Account 제거 계약

NDX는 더 이상 제품 account/user 개념을 갖지 않는다. 루트 `docs/accounts.md`는 이 제거 계약을 소유한다.

## 현재 상태

`ndev`는 PostgreSQL/container credential 또는 개발 기본값으로만 남는다. 세션 row, 채팅 row, 웹 클라이언트 프로젝트 row는 사용자 소유권을 저장하지 않는다.

## 금지

| 규칙 | 계약 |
| --- | --- |
| account selection socket | `account.selection.required`, `account.select`, `account.selected`를 다시 추가하지 않는다. |
| product user table | `users.userid` 기반 소유권을 다시 만들지 않는다. |
| session ownership | `session.userid`, `chatsession.userid`, `chatfolder.userid`를 다시 추가하지 않는다. |
| webclient project user | 프로젝트별 selected user를 저장하지 않는다. |

사용자/계정 기능을 다시 도입하려면 별도 product decision, 데이터 삭제 semantics, session authorization 모델, migration plan을 먼저 문서화해야 한다.
