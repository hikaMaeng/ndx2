# 아키텍처 리뷰 01 — 폴더 전제 분석 & 변화율 매핑

> 누적 분석 문서. 이어지는 세션은 이 파일을 먼저 읽고 더 깊게 보강한다.
> 작성 기준 브랜치: `codex/package-reorg-pushable` / 기준일: 2026-06-19

## 0. 분석 렌즈

이 프로젝트는 **코딩 에이전트**다. 따라서 코드의 "변화율(rate of change)"은
일반 웹앱과 다른 축을 가진다. 좋은 구조의 판정 기준을 세 가지로 고정한다.

1. **변화율 동조 배치** — 같은 속도로 바뀌는 것은 같은 폴더, 다른 속도로 바뀌는
   것은 다른 폴더. 고변화 축이 저변화 코어를 건드리지 않고 추가되어야 한다.
2. **단방향 의존** — `apps → packages`, `front → common`, feature → core 한 방향.
   역방향·횡방향 의존이 0이어야 확장이 국소화된다.
3. **파일 수준 단일책임** — "한 파일 = 한 책임"이 export 경계(package exports)까지
   일관되게 내려와야 한다.

## 1. 실측 폴더 전제

```
F:\dev\ndx2
├─ apps/ndx              # 단일 배포 단위(Express + Vite). compose service=ndx, pkg=ndx-app
│  ├─ src/server         # 프로세스/HTTP/static/소켓 attach
│  │  ├─ agent           # 세션 소켓 transport fan-out
│  │  └─ web/webclient   # webclient REST 라우트 wiring
│  ├─ src/webclient_front    # React 조립(shadcn/Tailwind/Radix)
│  └─ src/documents_front    # /docs 별도 Vite 사이트
└─ packages/ndx          # 프레임워크 중립 도메인 (pkg name=ndx, v0.2.3)
   └─ src
      ├─ common          # 36 파일 — protocol/responseapi/settings/server-path/log/...
      ├─ agent           # 런타임 권위(turnloop/hook/tool/context/session/chat/compact/...)
      └─ webclient       # common/server/front 3분할
```

규모(테스트 제외 핵심): turnloop 35, tool 31, hook 21, session 21, context 17,
common 36, webclient 73.

### 1.1 문서화 성숙도 — 강점
- `docs/code-placement.md`가 **결정 테이블 + 하드 경계 + 배치 체크리스트**를
  갖춘 살아있는 ADR로 동작. 신규 코드 배치 판단의 단일 근거.
- `AGENTS.md`에 prefix-cache 계약, turn-loop 비침투 계약, hook surface freeze 등
  **변화율 통제 규약**이 명문화. 이게 이 레포 구조 품질의 핵심 자산.
- turnloop가 lifecycle phase(before/iteration/model-call/tool-call/after)로
  쪼개져 있고, finalMessages가 `messages/`(정책) + `rows/`(투영)으로 1차 분해.

## 2. 변화율 축 매핑 (코딩 에이전트 관점)

| # | 변화 축 | 빈도 | 현재 배치 | 격리 평가 |
|---|--------|------|----------|----------|
| A | 신규 tool 추가 | ★★★ 매우 높음 | `agent/tool/base/<tool>` | ✅ 폴더 단위 완전 격리. registry/types/toolCall 코어 안정 |
| B | 프롬프트/컨텍스트 세그먼트 | ★★★ | `agent/context/<segment>` | ✅ 세그먼트별 폴더. 단 `index.ts`가 조립 순서 보유 |
| C | provider/model 추가 | ★★★ (외부발) | `common/responseapi` (request.ts+responses.ts 2파일) | ⚠️ **per-provider 어댑터 seam 부재**. 단일 Responses-API 형태 가정 |
| D | hook 추가 | ★ (동결됨) | `agent/hook` + `hook/base/<h>` | ✅ governance로 변화율 의도적 동결 |
| E | session 스키마 진화 | ★★ | `agent/session` | ⚠️ SQL 상수가 배럴로 app까지 누출 |
| F | turn lifecycle 변경 | ☆ (안정 목표) | `agent/turnloop` | ✅ 비침투 계약으로 보호 |
| G | webclient UI | ★★★ | `apps/.../webclient_front` + `pkg webclient/front` | ✅ 조립/도메인 분리 |
| H | wire protocol | ★★ (coupling점) | `common/protocol/<area>` | ✅ 단일 계약, reducer가 UI투영 흡수 |

## 3. 핵심 발견 (우선순위순)

### F-1. `agent/index.ts` 단일 배럴 — 최대 결합/변화율 문제 ★최우선
- `packages/ndx/package.json`의 agent export는 **`./agent` 단 하나**.
  대조적으로 common은 5개(`/common`,`/log`,`/responseapi`,`/protocol`,`/server-path`),
  webclient는 6개 sub-path로 잘게 쪼개져 있다. **agent 도메인만 비대칭으로 미분할.**
- `agent/index.ts`(123줄)는 session SQL 상수(`SESSIONDATA_TABLE_SQL` 등),
  account, chat, hook, tool, turnloop를 **flat 재export**. 신규 기능마다 이 파일이
  바뀐다 → 배럴 자체가 고변화 파일이 되고, app transport가 DB SQL 내부까지 import 가능.
- app은 `ndx/agent`를 19곳에서 import → 무엇을 쓰는지 export 경계가 강제하지 못함.
- **처방**: `./agent/session`, `./agent/tool`, `./agent/hook`, `./agent/turnloop`,
  `./agent/context`로 sub-path export 분리. SQL 상수처럼 init 전용 내부는 배럴에서
  제외(별도 `./agent/schema` 또는 init 내부 한정). webclient가 이미 보여준 패턴을
  agent에 대칭 적용하면 변화율 격리가 export 레벨에서 강제된다.

### F-2. provider 어댑터 seam 부재 ★높음
- 변화축 C(provider/model)는 코딩 에이전트에서 **외부 요인으로 가장 자주** 바뀌는데,
  `common/responseapi`는 request/responses 2파일뿐. 멀티 프로바이더/모델군이 늘면
  여기에 분기가 누적될 위험. AGENTS.md도 "provider-specific adapters"를 언급하나
  실폴더에는 어댑터 디렉터리가 없음.
- **처방**: 지금 단일 형태라도 `responseapi/provider/<name>` seam을 미리 비워두고,
  request.ts는 provider 선택+공통 직렬화만 보유하도록 경계 명문화(코드는 나중,
  계약은 지금). turn-loop 비침투 계약과 짝을 이루는 "provider 비침투" 한 줄을
  code-placement에 추가 권장.

### F-3. `AGENTS.md` ↔ 실구조 드리프트 ★중간(온보딩 위험)
- `AGENTS.md`는 `apps/admin`, `apps/agent`, `packages/ndx/src/admin/*`,
  `src/agent/cli`, `src/agent/web`를 "현재 배치"로 기술하나 **실제로는 없음**
  (`apps/ndx` 단일, `packages/ndx/src/{agent,common,webclient}`).
- 반면 `docs/code-placement.md`·`docs/architecture.md`는 실구조와 일치.
- 신규 에이전트/사람이 onboarding 시 AGENTS.md를 신뢰하면 잘못된 폴더를 만든다.
- **처방**: AGENTS.md "Current app/package placement" 절을 code-placement와 동기화.
  메모리 [[ndx-docsite-audit]]가 만든 audit.mjs를 AGENTS.md 인라인 경로까지 확장하면
  이 드리프트도 기계적으로 잡힌다.

### F-4. `context/index.ts` 조립 순서 = 잠재 prefix-cache 결합점 ★관찰
- 컨텍스트 세그먼트는 폴더로 잘 격리되나, 조립 순서는 `index.ts`에 집중.
  prefix-cache 계약상 "stable prelude 순서"가 곧 정확성이므로, 세그먼트 추가 시
  순서 회귀가 곧 캐시 파괴. 순서를 데이터(배열 상수)로 분리하고 회귀 테스트로
  고정하는지 다음 세션에서 검증 필요.

## 4. 종합 판정

구조는 이미 **상위권**이다. tool/context/hook/webclient의 변화율 격리와
turn-loop 비침투·prefix-cache 계약은 코딩 에이전트로서 정확히 맞는 설계다.
남은 약점은 **agent 도메인의 export 비대칭(F-1)** 과 **provider seam 공백(F-2)**,
그리고 **AGENTS.md 드리프트(F-3)** 셋으로 수렴한다. 셋 다 "코어 재작성"이 아니라
"경계 명문화 + export 분할"이라는 저위험 교정으로 해결된다.

## 5. 다음 세션 TODO (누적 심화)
- [ ] `context/index.ts` 조립 순서가 데이터/테스트로 고정됐는지 확인 (F-4)
- [ ] `tool/registry.ts`·`tool/types.ts` 코어가 신규 tool 추가 시 무변경인지 검증
- [ ] `turnloop/tool-call/index.ts`(368줄) 비대화 여부 — lifecycle vs 기능정책 혼입 점검
- [ ] `common/protocol` 이벤트 추가 시 reducer `Record<NDXTurnEventName>` 강제가 유지되는지
- [ ] webclient/front/session/model 의 단방향(React/DOM 미import) 실측 grep
- [ ] F-1 sub-path export 분할의 실제 import 영향 범위 산정
