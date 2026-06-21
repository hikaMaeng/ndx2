# Base image 파일 산출물

로컬 개발용 app image는 registry base를 직접 pull하지 않는다. 느린
PostgreSQL/pgvector/Node/tooling layer는 `apps/ndx/docker/baseImage`가
소유하고, Docker archive 파일로 저장한 뒤 app Dockerfile 빌드 전에 local
image store로 load한다.

## 소유 파일

| 경로 | 계약 |
| --- | --- |
| `apps/ndx/docker/baseImage/Dockerfile` | PostgreSQL/pgvector, mecab-ko, textsearch_ko, Node, Docker CLI, Chromium, Playwright runtime을 굽는 원천. |
| `apps/ndx/docker/baseImage/build-file-images.sh` | `linux/amd64`, `linux/arm64` Docker archive를 생성한다. |
| `apps/ndx/docker/baseImage/load-file-image.sh` | Docker server arch를 감지하고 해당 archive를 `ndx2-ndx-base:<version>`으로 load/tag한다. |
| `apps/ndx/docker/Dockerfile` | loaded local base tag에서 시작해 prebuilt app artifact만 복사한다. |

## 파일 이미지

| Archive | Platform | 사용처 |
| --- | --- | --- |
| `apps/ndx/docker/baseImage/out/ndx2-ndx-base-<version>-linux-amd64.tar` | `linux/amd64` | x64 Docker host. |
| `apps/ndx/docker/baseImage/out/ndx2-ndx-base-<version>-linux-arm64.tar` | `linux/arm64` | Apple Silicon / ARM Docker host. |

`out/`은 git에 커밋하지 않는다. 파일 이미지는 느린 base build cache이므로
소스가 아니라 산출물이다.

## 빌드/로드 명령

```sh
bash apps/ndx/docker/baseImage/build-file-images.sh
bash apps/ndx/docker/baseImage/load-file-image.sh
```

`scripts/deploy.sh`는 app image를 빌드하기 전에 loader를 실행한다. Archive가
없으면 loader가 현재 Docker server platform 하나만 생성한다.

## npm과의 차이

`npm/Dockerfile`은 local archive를 사용하지 않는다. npm 배포는
`ghcr.io/hikamaeng/ndx2-agent:<version>` 단일 final image를 multi-arch로
빌드하고, npm 사용자는 이 이미지 하나만 pull한다.
