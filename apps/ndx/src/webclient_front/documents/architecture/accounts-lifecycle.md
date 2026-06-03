# Account 생명주기

Account 계약은 루트 `docs/accounts.md`와 `packages/ndx/src/agent/account`가 소유한다. 웹 클라이언트와 session socket은 account를 선택하고 표시할 수 있지만, account identity와 deletion semantics는 agent server domain이 결정한다.

## 기본 account

NDX는 명시적인 login/account selection flow가 없을 때 반드시 `ndev`를 사용한다. `initServer`는 account table을 만들고 `ndev`가 없으면 seed한다. 이 기본값은 개발 편의를 위한 임시 문자열이 아니라 product contract다.

## account name

| 규칙 | 계약 |
| --- | --- |
| 문자 | Unicode whitespace를 제외한 모든 Unicode 문자. |
| 길이 | 최대 200자. |
| storage | `users.userid` primary key. |
| rename | 허용하지 않음. |
| password | optional, 생성 기본값은 없음. |

Account name은 표시 이름이 아니라 identity다. 표시 이름 기능이 나중에 생기면 account id와 별도 필드여야 한다.

## deletion cascade

Account 삭제는 단순 user row 삭제가 아니다. 해당 account가 소유한 session category, session metadata, context event, tool log, resume marker, downstream history가 함께 제거되어야 한다. 이 정책은 사용자 데이터 삭제 semantics와 PostgreSQL source-of-truth 계약을 동시에 지킨다.

## browser와 socket에서의 의미

Session socket은 연결 초기 단계에서 account selection을 요구할 수 있다. Browser client가 명시 account를 선택하지 않으면 default account가 사용된다. 이후 session attach, session input, client request response는 해당 account/session grant를 기준으로 검증된다.

## 설계 이유

NDX는 개인 로컬 에이전트로 시작하지만, session server 구조는 multi-account를 전제로 한다. 기본 계정이 없으면 첫 실행 사용성이 깨지고, account identity가 mutable이면 session ownership과 deletion cascade가 불명확해진다. 그래서 `ndev` default와 immutable userid를 동시에 유지한다.
