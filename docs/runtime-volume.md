# Runtime Volume

All application containers use one repository-local runtime volume.

| Host Path | Container Path | Env |
| --- | --- | --- |
| `F:/dev/ndx2/volume` | `/ndx` | `NDX_HOST_ROOT=F:/dev/ndx2/volume`, `NDX_ROOT=/ndx` |

Do not add separate host mounts for logs, app data, workspace, user home, or
web assets. `docker-compose.yml` mounts `./volume` to `/ndx` for application
services and exposes `NDX_HOST_ROOT` for host-to-container path mapping.

## Directory Contract

| Container Path | Host Path | Owner | Contract |
| --- | --- | --- | --- |
| `/ndx` | `volume/` | Compose | Single application runtime root. |
| `/ndx/.ndx` | `volume/.ndx` | Agent server | Global NDX home: prompts, skills, plugins, memories, system tools, and user policy files. |
| `/ndx/.ndx/i18n` | `volume/.ndx/i18n` | Agent web client | Runtime locale JSON overrides served at `/assets/i18n/*.json` before bundled fallbacks. |
| `/ndx/.ndx/log` | `volume/.ndx/log` | Apps | JSONL runtime logs. Web backend logs use `.ndx/log/web/YYYY/MM/DD.log`; session-specific agent logs use `.ndx/log/session/<sessionid>/YYYYMMDD.log`; agent process events without a session id use `.ndx/log/agent/YYYY/MM/DD.log`. |
| `/ndx/workspace` | `volume/workspace` | User/project data | Project workspace root browsed by the web client and used for session execution. |
| `/ndx/pgvector` | `volume/pgvector` | PostgreSQL | Local PostgreSQL/pgvector data directory. |

The only top-level directories expected under `volume/` are `.ndx`, `pgvector`,
and `workspace`.

`volume/` is local runtime state and is ignored by Git.

The `agent` service also mounts `/var/run/docker.sock` so session tools can run
Docker Compose against workspace projects. This socket is a control channel to
the host Docker daemon, not application state, and does not change the `/ndx`
runtime root contract.

## Environment

Compose uses two root values:

| Setting | Value | Purpose |
| --- | --- | --- |
| `NDX_ROOT` | `/ndx` | Container runtime root used by server code and tools. |
| `NDX_HOST_ROOT` | Physical host path such as `F:/dev/ndx2/volume` | Browser-facing host path used for VS Code links and host-to-container path mapping. |

`NDX_ROOT` is the only path application code should use for container-side file
access. It anchors the fixed runtime directories: `/ndx/.ndx`,
`/ndx/workspace`, and `/ndx/pgvector`.

`NDX_HOST_ROOT` must describe the same physical directory from the host side. It
is not a PostgreSQL setting and does not change where container code reads or
writes files. The server uses it to:

* publish `hostRoot` and `hostWorkspaceRoot` through web metadata;
* convert `/ndx/workspace/...` paths back to host paths for VS Code open
  requests;
* accept Windows paths such as `F:/dev/ndx2/volume/workspace/...` and WSL paths
  such as `/mnt/f/dev/ndx2/volume/workspace/...` as the same workspace;
* reject Windows paths outside the configured runtime volume before project
  identity or tool execution.

For local Windows-backed storage, run Compose from Windows path context when
creating a fresh PostgreSQL data directory. Docker then mounts
`F:\dev\ndx2\volume` to `/ndx`, and PostgreSQL can initialize
`volume/pgvector/pgdata` with the required ownership metadata. Starting a fresh
cluster through a WSL `/mnt/f/...` bind can leave the data directory with
generic WSL ownership and make `initdb` fail while fixing permissions.

Rejected old settings:

| Old Setting | Replacement |
| --- | --- |
| `NDX_HOST_WORKSPACE` | `NDX_ROOT` plus `/workspace` relative subdirectory. |
| `NDX_HOME` | `NDX_ROOT` plus `/.ndx` relative subdirectory. |
| `NDX_CONTAINER_WORKSPACE` | Fixed `/ndx/workspace`. |
| `NDX_CONTAINER_USER_HOME` | Fixed `/ndx`. |
| `NDX_LOG_ROOT` in Compose | App code uses fixed `/ndx/.ndx/log`. |
| `./apps/ndx/assets:/app/assets` | Runtime i18n overrides live under `volume/.ndx/i18n`; image assets are bundled fallback only. |
| `agent_data:/app/data` | No separate app-data volume. PostgreSQL data lives under `volume/pgvector`; NDX app state lives under `volume/.ndx`. |

## Path Mapping

`packages/ndx/src/common/server-path/pathMapping.ts` owns host/container path
normalization.

Rules:

* Host paths under `NDX_HOST_ROOT` map to `/ndx`.
* WSL paths under `/mnt/f/dev/ndx2/volume` map to `/ndx`.
* Container paths under `/ndx` are already canonical.
* Project paths must resolve below `/ndx/workspace`.
* Built-in filesystem tools run inside the agent container. Relative paths
  resolve from the selected project root, while container absolute paths may
  address any file under the `/ndx` virtual root, including `/ndx/.ndx` and
  `/ndx/workspace`.
* The web client receives the display root as `NDX_HOST_ROOT/workspace`; directory
  browsing still uses server-relative paths that resolve below `/ndx/workspace`.
* Global home lookups use user home `/ndx`, so `.ndx` resolves to `/ndx/.ndx`.
* Windows paths outside `NDX_HOST_ROOT` are rejected by server volume mapping.

## Initialization

`initServer` seeds server-owned `.ndx` defaults under `/ndx/.ndx` when files are
missing. The current seeded category is:

| Source | Target |
| --- | --- |
| `packages/ndx/src/agent/init/assets/system/modelprompt` | `/ndx/.ndx/system/modelprompt` |

The seed operation does not overwrite existing files. Existing user data remains
authoritative.

## Migrated Local State

The previous Windows user home `C:/Users/hika0/.ndx` has been copied into
`volume/.ndx`. Current migration state:

| Source | Target |
| --- | --- |
| `C:/Users/hika0/.ndx` | `volume/.ndx` |

The copied `.ndx` includes user policy files, settings, skills, system tools,
and existing system state. Future runtime reads should use `/ndx/.ndx`, not the
old Windows path.

## Web Assets

The agent Express server serves `/assets` in this order:

1. `/ndx/.ndx/i18n` for `/assets/i18n/*.json`
2. bundled image assets copied from `apps/ndx/assets`

This keeps runtime i18n edits outside the TypeScript bundle while preserving a
fallback for fresh containers.

## Database Boundary

PostgreSQL session truth runs inside the agent container under `/ndx/pgvector`.
Do not create `/ndx/data` as a second app-data or session-truth location.
