#!/usr/bin/env bash
set -euo pipefail

exec bash .ndx/skills/web-deploy-docker/scripts/deploy.sh "$@"
