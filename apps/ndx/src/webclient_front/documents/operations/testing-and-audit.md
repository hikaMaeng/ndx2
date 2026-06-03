# 테스트와 문서 검수

이 문서 사이트의 완료 여부는 감각이 아니라 코드와 현재 저장소 상태로 검수해야 한다. 문서가 "많다"는 사실은 충분하지 않다. 각 문서가 어떤 source file, runtime behavior, test, config를 설명하는지 추적 가능해야 한다.

## 현재 검수 기준

| 검수 항목 | 증거 |
| --- | --- |
| 문서 coverage 감사 | `yarn workspace ndx-app docs:audit` |
| 문서 사이트 빌드 | `yarn workspace ndx-app build:webclient-front` |
| TypeScript import 안정성 | `yarn workspace ndx-app lint` |
| Markdown catalog 연결 | `documents/catalog.ts`가 모든 md를 import |
| 문서 coverage manifest | `documents/coverage.ts`가 source surface와 required document id를 연결 |
| 앱에서 새 탭 진입 | left sidebar header의 `/docs` target link |
| SPA fallback | Express `app.get("/{*path}")`가 webclient index를 반환 |

## 향후 코드 검수기

현재 `docs:audit`는 catalog import, Markdown 존재 여부, H1/최소 분량, `/docs`
라우팅, 새 탭 링크, 검정 배경 문서 테마, coverage source path 존재와 문서 언급 여부,
그리고 `apps/ndx/src`/`packages/ndx/src` 소스 인벤토리 누락 여부를 검사한다.
문서화 완료를 주장하려면 여기에 다음 자동 검수기를 더해야 한다.

| 검수기 | 해야 할 일 |
| --- | --- |
| source coverage scanner | `apps`, `packages`, `pgvector`, `npm`, `docs`, `scripts`, root config를 분류한다. |
| doc manifest checker | catalog의 각 문서가 source coverage category를 하나 이상 가리키는지 확인한다. |
| link checker | Markdown 내부 상대 링크와 asset 링크를 검사한다. |
| route smoke test | `/docs`, `/docs/<section>/<doc>`가 렌더링되는지 브라우저로 확인한다. |
| architecture invariant checker | apps->packages import 방향, webclient->agent import 금지 등을 검사한다. |
| prompt contract tests | context reconstruction 순서가 prefix-cache 계약을 지키는지 확인한다. |

## 완료 판정

문서화 목표가 완료되었다고 말하려면 최소한 다음이 증명되어야 한다.

1. 사용자가 설치부터 첫 바이브코딩 세션까지 문서만 보고 수행할 수 있다.
2. agent session runtime의 authoritative state, model request shape, tool/hook execution 순서가 코드와 함께 설명되어 있다.
3. Docker/pgvector/npm launcher/monorepo boundary가 빠지지 않았다.
4. 모든 public app surface와 package export가 source map에 반영되어 있다.
5. 문서 catalog와 source coverage scanner가 서로 어긋나지 않는다.
6. front build 또는 browser smoke가 `/docs` 렌더링을 검증한다.

현재 문서 세트는 그 방향으로 가는 첫 구조화 단계이며, 전체 완료를 주장하기에는 아직 source coverage scanner와 link checker가 더 필요하다.
