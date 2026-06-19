# pgvector 이미지 배포

`pgvector/publish-ghcr.sh`는 느리게 빌드되는 PostgreSQL/pgvector base image를 GHCR에 publish하는 운영 스크립트다. Agent runtime image는 이 base image를 사용해 매번 mecab-ko와 textsearch_ko를 새로 빌드하지 않는다.

## 입력값

| prompt | 기본값 |
| --- | --- |
| GHCR owner | git origin owner 또는 `hikamaeng` |
| Image tag | `npm/package.json` version 또는 `0.2.3` |
| GHCR username | owner |
| GHCR token | 필수, package write 권한 필요 |

Token은 prompt로 읽고 저장하지 않는다. 비어 있으면 exit code 2로 종료한다.

## buildx

스크립트는 `ndx2-multiarch` builder가 없으면 생성하고, `docker buildx use ndx2-multiarch`를 실행한다. 이후 다음 platform으로 push한다.

| platform | 이유 |
| --- | --- |
| `linux/amd64` | 일반 x86_64 Linux/Windows Docker Desktop. |
| `linux/arm64` | Apple Silicon과 ARM server. |

## image name

최종 image는 다음 형식이다.

```text
ghcr.io/<owner>/ndx2-pgvector:<version>
```

배포 후 `docker buildx imagetools inspect`로 manifest가 조회되는지 확인한다.

## Dockerfile과의 관계

`pgvector/Dockerfile.pgvector`는 `pgvector/pgvector:pg17`에서 시작해 mecab-ko, mecab-ko-dic, `textsearch_ko`를 설치한다. `apps/ndx/docker/Dockerfile`은 `ARG NDX2_PGVECTOR_TAG`로 이 base image tag를 선택한다.

## 설계 이유

Korean morphology와 PostgreSQL extension build는 느리고 실패 지점이 많다. 이를 agent runtime image build마다 반복하면 npm 사용자와 배포 pipeline이 불안정해진다. 느린 DB base image를 별도 GHCR artifact로 분리하면 agent image는 Node/Chromium/Docker CLI와 app dist를 얹는 빠른 단계에 집중할 수 있다.
