---
name: web-deploy-docker
description: Explicit-only Docker deploy. Run scripts/deploy.sh directly; do not search for skills, inspect trees, or use subagents.
---

# Web Deploy Docker

## Immediate Action

* One service: `bash scripts/deploy.sh <service-or-app-path>`
* All services, only when explicitly requested: `bash scripts/deploy.sh --all`

After reading this file, the next tool call must be that deploy command when
`scripts/deploy.sh` exists.

Do not search for this skill, inspect `.ndx`, list files, read package files,
read Docker/Compose files, or pre-check app structure before running the
command. The script accepts both `dashboard` and `apps/dashboard`, performs the
local build, refreshes Docker Compose when needed, and prints all evidence.

## Input

* Required: service name or `apps/<service>`, unless the user explicitly asks
  to deploy all services.
* If the service name is missing, ask for only the service name. Do not infer it
  from a single app unless the user asked for an automatic/default deploy.
* Do not ask for target directory. Use the current repository root.

## Hard Rules

* Do not build inside Docker. The deploy entrypoint must perform local build
  first, then Docker Compose refresh. Dockerfile must copy `apps/<service>/dist`
  or equivalent prebuilt runtime artifacts only.
* Do not use a subagent unless the user explicitly asks.
* Do not run separate install, build, test, browser, `docker compose ps`, port,
  curl, or commit steps unless `deploy-report-begin` is missing or the command
  fails.
* Do not run a separate `yarn install` after a deploy failure only because the
  log mentions Yarn Plug'n'Play, missing cache packages, Turbo, telemetry, git
  ownership, Docker buildx, or health retries. The deploy script owns those
  scaffold recovery paths and must print the final evidence.
* Do not edit files unless the deploy command fails because of a concrete
  scaffold defect.

## Output

The script prints a `deploy-report-begin` / `deploy-report-end` block. Final
answer must copy that block's `결과`, `시간`, `검증`, and `변경` lines, with only
minimal Korean wording around them. Do not end with generic follow-up
suggestions. If the deploy command fails, report `deploy-total status=failed`
and the last relevant failure block. If a failed command still printed a deploy
report block, do not infer or attempt another recovery step unless the user
explicitly asks for debugging or fixing the scaffold.
