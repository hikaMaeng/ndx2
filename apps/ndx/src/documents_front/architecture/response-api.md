# Responses API 계층

`packages/ndx/src/common/responseapi`는 모델 provider 호출을 agent runtime에서 분리하는 얇은 호환 계층이다. 현재 turn loop는 `requestModelResponse`를 통해 OpenAI Responses API 형태의 `/responses` endpoint를 호출하고, streaming/non-streaming payload를 같은 `ModelResponse` 형태로 정규화한다.

## requestModelResponse

| 단계 | 설명 |
| --- | --- |
| validate | `model.model`과 `model.url`이 비어 있으면 실패한다. |
| endpoint | provider URL의 path 뒤에 `/responses`를 붙인다. |
| structured input | role/content item 배열을 Responses input part로 변환한다. |
| fallback input | provider가 현재 input serialization을 거부하거나 response parser failure를 내면 대체 input serialization을 시도한다. |
| retry | transient status와 일부 network error는 최대 2회 시도한다. |
| stream parse | `text/event-stream`이면 SSE frame을 읽어 text/reasoning/tool_call을 전달한다. |
| payload parse | JSON payload도 `parseResponsesPayload`로 같은 결과로 만든다. |

## attachment 처리

Responses input content part에 `file_path`가 있으면 request 직전에 파일을 읽어 data URL로 변환한다. image part는 `input_image.image_url`, file part는 `input_file.file_data`가 된다. 이 처리는 durable DB 저장이 아니라 one-request payload materialization이다.

## text fallback

일부 provider는 Responses API 형식의 structured array input 또는 text serialization input을 완전히 지원하지 않는다. 400 응답에 `Invalid type for 'input'`이 포함되거나, stream 중 `Failed to parse input at pos 0` 같은 provider response parser failure가 오면 같은 messages를 다른 input serialization으로 다시 보낸다. 이 fallback은 호환성을 위한 장치지만, prompt ordering 문서와 테스트에서 반드시 고려해야 한다. 실패한 serialization은 provider/model별 compatibility cache에 기록해 다음 요청에서 같은 실패 경로를 반복하지 않는다.

## stream event

| event | turn loop에서 하는 일 |
| --- | --- |
| text delta | assistant delta event를 browser에 보낸다. |
| reasoning | assistant reasoning row/event를 기록한다. |
| function_call | tool call 후보로 수집한다. |
| debug | logger에 provider request/parse 상태를 남긴다. |

## 텍스트 tool call 추출

stream content 안에 text 형태 tool marker가 포함되는 경우 `extractTextToolCalls`로 tool call을 추출하고 assistant content에서는 제거한다. 이 경로는 provider 호환성을 높이기 위한 fallback이므로, 도구 호출과 최종 답변을 분리하는 테스트가 필요하다.

## 설계 이유

모델 provider마다 streaming event와 payload shape가 조금씩 다르다. 이 차이를 turn loop에 직접 흩뿌리면 interruption, hook, context usage, tool continuation이 provider별로 갈라진다. NDX는 provider 차이를 `common/responseapi`에서 최대한 흡수하고, agent runtime은 `content`, `toolCalls`, `outputItems`라는 좁은 결과만 다룬다.
