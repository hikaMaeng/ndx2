# 모델과 Provider 설정

모델 설정 UI는 `apps/ndx/src/webclient_front/session/modals/ModelDialog.tsx`와 `useModelDialogController.tsx`가 담당한다. 설정은 browser UI에서 조작하지만, 저장과 조회는 webclient server API와 package helper가 담당한다.

## provider

Provider는 title, URL, token을 가진다. 현재 model config는 OpenAI-compatible endpoint를 기준으로 한다. Provider 추가 시 URL은 필수이고 token은 optional이다.

| 작업 | UI |
| --- | --- |
| provider 추가 | title, URL, token 입력 form. |
| provider sync | refresh icon으로 provider model list 동기화. |
| provider 삭제 | trash icon. |

Sync는 먼저 server-side `syncWebProviderModels`를 시도하고, 실패하면 browser에서 provider model list를 읽는 fallback을 사용한다. 실패한 provider에는 red alert indicator를 표시한다.

## model row

Model은 provider 하위에 존재하며 다음 값을 가진다.

| 값 | 설명 |
| --- | --- |
| `model` | provider model name. |
| `contextsize` | context window size. 기본 입력값은 `100000`. |
| `modalities` | `text`, `image`, `file`. |
| `temperature` | optional inference parameter. |
| `topP` | optional inference parameter. |
| `topK` | optional inference parameter. |
| `minP` | optional inference parameter. |

Modality는 단순 표시가 아니라 attachment validation에 쓰인다. 예를 들어 image input을 지원하지 않는 model에 image attachment를 보내면 session server가 거절해야 한다.

## active session restore

Active session을 열면 `useModelDialogController`는 session row의 model config를 selected model state로 복원한다. Provider bundle에서 같은 URL/token 또는 model name을 찾아 provider title을 채우고, session row에 저장된 inference parameter를 우선한다.

## 설계 이유

Model provider 설정은 UI 편의 기능처럼 보이지만 session execution에 직접 영향을 준다. 따라서 browser local state만으로 유지하지 않고 server-side settings store와 session row model config를 통해 durable하게 다룬다. Provider API가 modality를 정확히 알려주지 않으므로, NDX는 user-managed modality metadata를 명시적으로 저장한다.
