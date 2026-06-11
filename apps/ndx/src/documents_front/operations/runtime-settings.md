# 런타임 설정

Agent runtime settings는 `packages/ndx/src/agent/runtime-settings/index.ts`가 `/ndx/.ndx/settings.json`에서 읽는다. 파일이 없으면 기본값을 사용한다. 잘못된 값은 가능한 범위에서 무시하고 기본값으로 돌아간다.

## 기본값

| 설정 | 기본값 | 설명 |
| --- | --- | --- |
| `runtime.maxModelIterations` | `500` | coding session turn의 최대 model/tool 반복 수. |
| `runtime.loopDetectionInterval` | `50` | tool result 수집 후 loop detection hook 실행 간격. |
| `embeddings` | 없음 | session_history vector search와 sessionsearch embedding worker 설정. |
| `tools.prompt_rewrite.model` | 없음 | `[[rewriter]]` marker hook 내부 요청의 model key/name override. |

## 예시

```json
{
  "runtime": {
    "maxModelIterations": 500,
    "loopDetectionInterval": 50
  },
  "embeddings": {
    "provider": "local",
    "model": "text-embedding-3-small",
    "url": "http://127.0.0.1:11434/v1"
  },
  "tools": {
    "prompt_rewrite": {
      "model": "qwen3.6-35b-mp"
    }
  }
}
```

## embeddings

`embeddings.provider`와 `embeddings.model`이 모두 non-empty string일 때만 설정으로 인정한다. `url`과 `token`은 선택이다. 이 설정은 model inference 설정이 아니라 `sessionsearch` indexing/query embedding용이다.

## loop detection

`loopDetectionInterval`은 integer면 그대로 읽는다. `0` 또는 음수는 loop detection을 끄는 값으로 사용된다. `maxModelIterations`는 positive integer만 허용하고, 아니면 기본값 500으로 돌아간다.

## 설계 이유

런타임 설정은 session row나 browser local state에 숨기지 않는다. `/ndx/.ndx/settings.json`은 컨테이너 volume에 있는 운영 설정이고, agent runtime이 직접 읽는다. 이렇게 해야 Docker 배포, npm 설치, local compose 환경에서 같은 설정 파일을 공유할 수 있다.
