# Docker와 pgvector

NDX agent image는 PostgreSQL/pgvector runtime을 포함한다. 별도 PostgreSQL service나 host port를 노출하지 않는다.

## Compose 계약

| 항목 | 값 |
| --- | --- |
| compose project | `ndx2` |
| service | `ndx` |
| container | `ndx` |
| web host port | `${NDX_WEB_HOST_PORT:-18082}:18080` |
| container runtime root | `/ndx` |
| host volume | `./volume:/ndx` |
| docker socket | `/var/run/docker.sock:/var/run/docker.sock` |

## PostgreSQL 기본값

| 변수 | 값 |
| --- | --- |
| `POSTGRES_USER` | `ndev` |
| `POSTGRES_PASSWORD` | `ndev` |
| `POSTGRES_DB` | `ndev` |
| `PGDATA` | `/ndx/pgvector/pgdata` |
| `NDX_DATABASE_URL` | `postgresql://ndev:ndev@127.0.0.1:5432/ndev` |

외부 host port가 없으므로 DB 점검은 컨테이너 내부에서 한다.

```sh
docker exec -it ndx psql -U ndev -d ndev
```

## pgvector base image

`pgvector/Dockerfile.pgvector`는 `pgvector/pgvector:pg17`에서 시작해 다음을 추가한다.

| 구성 | 이유 |
| --- | --- |
| `mecab-ko` | Korean morphology 분석. |
| `mecab-ko-dic` | Korean dictionary. |
| `textsearch_ko` | PostgreSQL Korean full-text search config. |
| `pgvector` | vector search column과 embedding ranking. |

느린 base image는 `pgvector/publish-ghcr.sh`로 GHCR에 배포하고, agent runtime image는 `ghcr.io/hikamaeng/ndx2-pgvector:<version>`을 base로 사용한다.

## 운영 판단

PostgreSQL을 agent container 내부에 둔 이유는 설치/업데이트/권한을 단순화하고, session server와 DB의 deployment unit을 맞추기 위해서다. 대신 DB host port를 노출하지 않으므로 운영 점검 명령은 문서와 스크립트에서 명확히 제공되어야 한다.
