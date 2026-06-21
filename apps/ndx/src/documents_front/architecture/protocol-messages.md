# Protocol 메시지

NDX protocol은 `packages/ndx/src/common/protocol`에 정의된다. 이 package는 browser, server route, session socket, agent runtime이 공유하는 message name과 validator를 제공한다. Protocol 문서는 UI 이벤트 이름이 아니라 durable transport contract를 설명해야 한다.

## identity와 project

| 메시지/상수 | 역할 |
| --- | --- |
| `NDX_CLIENT_ID_QUERY_PARAM` | WebSocket query의 `clientid` 이름. |
| `isNDXClientId` | UUID-shaped client id만 허용. |

제품 계정/사용자 선택 flow는 없다. `clientid`는 브라우저 reconnect와 표시 상태를 위한 식별자일 뿐 세션 소유자가 아니다.

## project negotiation

Project negotiation은 browser가 `/ndx/workspace` 바로 아래 프로젝트 폴더명인 `projectName`을 서버에 알려주는 단계다. 서버는 해당 폴더가 실제 workspace 직계 자식 디렉터리인지 확인하고, 세션의 프로젝트 정체성도 같은 폴더명으로 저장한다.

## session socket messages

| 메시지 | 방향 | 설명 |
| --- | --- | --- |
| `session.create` | client -> server | project/model 정보를 바탕으로 새 session 생성. |
| `session.attach` | client -> server | 기존 session을 현재 socket grant에 등록. |
| `session.input` | client -> server | user prompt와 attachment를 active session에 전송. |
| `session.interrupt` | client -> server | running turn interrupt 요청. |
| `session.event` | server -> client | turn loop event fan-out. |
| `session.history.summary` | client -> server | session history summary 요청. |
| `session.turn.detail` | client -> server | 특정 turn detail 요청. |
| `session.iteration.detail` | client -> server | 특정 iteration detail 요청. |

`turn.model.progress`는 model request가 아직 최종 결과를 내지 않은 동안
`session.event` 안에 담겨 전달된다. 이 이벤트는 socket-only 진행 알림이며
durable sessiondata row가 아니다.

## client request messages

`askUserQuestion`은 socket protocol 위에서 browser interaction을 수행한다.

| 메시지 | 설명 |
| --- | --- |
| `session.client.request` | server가 connected clients에 질문 표시 요청. |
| `session.client.response` | client가 answer payload를 반환. |
| `session.client.request.closed` | answered, cancelled, interrupted 등으로 dialog 종료. |

Client response validator는 answers map과 attachment shape를 검사한다. 임의 extra field가 들어간 answer는 protocol test에서 거부된다.

## turn card와 cot work

Protocol에는 UI가 turn detail을 안정적으로 렌더링하기 위한 turn card item과 cot work contents validator도 있다. `cot_work` elapsed field는 `mm:ss` 형식이어야 하며, test가 이 형식을 검증한다.

## 설계 이유

Protocol validator는 browser와 server가 같은 message shape를 공유하게 하는 최소 방어선이다. Prompt instruction으로만 protocol을 설명하면 runtime이 잘못된 message를 받아들일 수 있다. 따라서 message type string, validator, tests가 함께 존재해야 한다.
