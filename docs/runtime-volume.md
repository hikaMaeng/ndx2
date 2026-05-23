# Runtime Volume

All application containers use one repository-local runtime volume.

| Host Path | Container Path | Env |
| --- | --- | --- |
| `F:/dev/ndx2/volume` | `/ndx` | `NDX_ROOT=F:/dev/ndx2/volume` |

Do not add separate host mounts for logs, app data, workspace, user home, or
web assets. `docker-compose.yml` mounts `./volume` to `/ndx` for application
services and exposes only `NDX_ROOT` for host-to-container path mapping.

## Directory Contract

| Container Path | Host Path | Owner | Contract |
| --- | --- | --- | --- |
| `/ndx` | `volume/` | Compose | Single application runtime root. |
| `/ndx/assets` | `volume/assets` | Agent app | Runtime web assets. Express serves this before bundled fallback assets. |
| `/ndx/assets/i18n` | `volume/assets/i18n` | Agent web client | Locale JSON served at `/assets/i18n/*.json`. |
| `/ndx/data` | `volume/data` | Apps | App-owned local data that is not PostgreSQL session truth. |
| `/ndx/log` | `volume/log` | Apps | JSONL runtime logs. Web backend logs use `log/web/YYYY/MM/DD.log`; session-specific agent logs use `log/session/<sessionid>/YYYYMMDD.log`; agent process events without a session id use `log/agent/YYYY/MM/DD.log`. |
| `/ndx/.ndx` | `volume/.ndx` | Agent server | Global NDX home: prompts, skills, plugins, memories, system tools, and user policy files. |
| `/ndx/workspace` | `volume/workspace` | User/project data | Project workspace root browsed by the web client and used for session execution. |

`volume/` is local runtime state and is ignored by Git.

The `agent` service also mounts `/var/run/docker.sock` so session tools can run
Docker Compose against workspace projects. This socket is a control channel to
the host Docker daemon, not application state, and does not change the `/ndx`
runtime root contract.

## Environment

`NDX_ROOT` is the only volume-related environment variable in Compose.

Rejected old settings:

| Old Setting | Replacement |
| --- | --- |
| `NDX_HOST_WORKSPACE` | `NDX_ROOT` plus `/workspace` relative subdirectory. |
| `NDX_HOME` | `NDX_ROOT` plus `/.ndx` relative subdirectory. |
| `NDX_CONTAINER_WORKSPACE` | Fixed `/ndx/workspace`. |
| `NDX_CONTAINER_USER_HOME` | Fixed `/ndx`. |
| `NDX_LOG_ROOT` in Compose | App code uses fixed `/ndx/log`. |
| `./apps/agent/assets:/app/assets` | Runtime assets live under `volume/assets`; image assets are fallback only. |
| `agent_data:/app/data` or `admin_data:/app/data` | App data lives under `volume/data`. |

## Path Mapping

`packages/ndx/src/server/common/pathMapping.ts` owns host/container path
normalization.

Rules:

* Host paths under `NDX_ROOT` map to `/ndx`.
* WSL paths under `/mnt/f/dev/ndx2/volume` map to `/ndx`.
* Container paths under `/ndx` are already canonical.
* Project paths must resolve below `/ndx/workspace`.
* Built-in filesystem tools run inside the agent container. Relative paths
  resolve from the selected project root, while container absolute paths may
  address any file under the `/ndx` virtual root, including `/ndx/.ndx` and
  `/ndx/workspace`.
* The web client receives the display root as `NDX_ROOT/workspace`; directory
  browsing still uses server-relative paths that resolve below `/ndx/workspace`.
* Global home lookups use user home `/ndx`, so `.ndx` resolves to `/ndx/.ndx`.
* Windows paths outside `NDX_ROOT` are rejected by server volume mapping.

## Initialization

`initServer` seeds server-owned `.ndx` defaults under `/ndx/.ndx` when files are
missing. The current seeded category is:

| Source | Target |
| --- | --- |
| `packages/ndx/src/agent/server/init/assets/system/modelprompt` | `/ndx/.ndx/system/modelprompt` |

The seed operation does not overwrite existing files. Existing user data remains
authoritative.

## Migrated Local State

The previous Windows user home `C:/Users/hika0/.ndx` has been copied into
`volume/.ndx`. Current migration state:

| Source | Target |
| --- | --- |
| `C:/Users/hika0/.ndx` | `volume/.ndx` |
| `apps/agent/assets` | `volume/assets` |

The copied `.ndx` includes user policy files, settings, skills, system tools,
and existing system state. Future runtime reads should use `/ndx/.ndx`, not the
old Windows path.

## Web Assets

The agent Express server serves `/assets` in this order:

1. `/ndx/assets`
2. bundled image assets copied from `apps/agent/assets`

This keeps runtime i18n edits outside the TypeScript bundle while preserving a
fallback for fresh containers.

## Database Boundary

PostgreSQL session truth remains the Compose `pgvector` service. `/ndx/data` is
reserved for app-local files and must not become a second authoritative session
store.
