#!/usr/bin/env bash
set -euo pipefail

exec bash .codex/skills/web-deploy-docker/scripts/deploy.sh "$@"
