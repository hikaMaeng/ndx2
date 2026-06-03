# Composer, 첨부, 스킬 멘션

Composer는 `apps/ndx/src/webclient_front/session/components/ChatComposer.tsx`에 있다. 사용자는 여기서 요청 text, 파일/이미지 attachment, `$skill` mention, model 선택, send/interrupt를 조작한다.

## 입력 방식

| 입력 | 동작 |
| --- | --- |
| Enter | IME 조합/Shift/Ctrl/Alt/Meta가 없으면 form submit. |
| Shift+Enter | 줄바꿈 유지. |
| paste files | clipboard file이 있으면 attachment로 추가. |
| paperclip | file input으로 여러 파일 추가. |
| `$` 입력 | skill list refresh를 요청하고 suggestion을 표시. |

Composer는 `react-mentions-ts`를 사용해 `$skill` mention을 표시한다. 실제 markup은 `[[NDX_SKILL___id__]]` 형태로 들어가고, 화면에는 `$<skill>`로 보인다.

## attachment 표시

| attachment 종류 | UI |
| --- | --- |
| image preview 가능 | 80x80 preview tile, click preview dialog. |
| 일반 file | filename, size, remove button. |

Preview dialog는 검정 overlay에 이미지를 보여준다. Composer는 attachment bytes를 직접 PostgreSQL에 넣지 않는다. Browser가 socket request에 bytes를 싣고 보내면 session server가 프로젝트 하위 `.ndx/sessions/<sessionid>/`에 저장하고 DB에는 reference만 남긴다.

## send와 interrupt

Composer submit button은 agent가 idle이면 send icon이고, running이면 stop icon이다. running 중 submit은 새 user turn을 시작하는 것이 아니라 interrupt 요청으로 해석된다. `interruptPending`이거나 request submit이 이미 pending이면 버튼은 disabled/busy 상태가 된다.

## model label과 context usage

Composer 하단에는 현재 selected model label과 `ContextUsageRing`이 있다. Context usage는 browser가 계산하지 않고 turn loop event에서 받은 값을 표시한다. 이 값은 model messages와 tool schemas까지 포함한 runtime 기준 usage다.

## 스킬 사용 주의

스킬 mention은 prompt에 "이 스킬을 참고하라"는 신호를 주는 사용자 입력이다. mention이 file write 권한을 새로 만들거나 chat mode의 tool allowlist를 우회하지 않는다. 스킬은 advisory instruction이고, tool 권한은 session runtime policy가 결정한다.
