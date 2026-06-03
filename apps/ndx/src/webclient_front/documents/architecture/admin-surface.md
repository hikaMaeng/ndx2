# Admin 표면

Admin 표면은 현재 `apps/ndx/src/admin_front`와 `packages/ndx/src/admin`에 작은 baseline으로 존재한다. 이 표면은 앞으로 account, session, operation 관리를 담당할 수 있지만, agent loop나 tool execution authority를 소유하지 않는다.

## 현재 구현

| 경로 | 역할 |
| --- | --- |
| `apps/ndx/src/admin_front/main.tsx` | admin React shell. |
| `apps/ndx/src/admin_front/components/ui` | shadcn/ui 기반 button/card. |
| `packages/ndx/src/admin/common` | admin common domain marker. |
| `packages/ndx/src/admin/front` | admin front domain marker. |
| `packages/ndx/src/admin/server` | admin server domain marker. |
| `apps/ndx/src/server/web/admin` | admin API route registration 위치. |

현재 admin UI는 health link와 runtime ready card를 제공하는 baseline이다. 이것은 product workflow가 완성됐다는 의미가 아니라, admin surface가 별도 route와 build target을 갖고 있음을 보여주는 scaffold다.

## route

Express server는 `/admin`에 admin front 정적 파일을 제공하고, `/admin/{*path}`는 admin index로 fallback한다. Webclient와 admin은 같은 Express process에서 제공되지만 build output과 route prefix가 다르다.

## future boundary

Admin이 account deletion, session inspection, provider management, runtime logs 같은 기능을 갖게 되더라도 다음 경계는 유지해야 한다.

| 금지 | 이유 |
| --- | --- |
| admin front가 `ndx/agent`를 직접 import | browser가 agent authority를 갖지 않는다. |
| admin route가 독자적인 turn loop 실행 | session server authority가 분리된다. |
| admin state가 PostgreSQL session truth를 대체 | recovery/audit/source of truth가 깨진다. |

Admin은 operational control surface이고, agent runtime은 package domain과 session server가 계속 소유한다.
