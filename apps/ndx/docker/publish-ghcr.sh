#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"

default_owner="hikamaeng"
if command -v git >/dev/null 2>&1; then
  remote_url="$(git -C "$repo_root" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote_url" =~ github.com[:/]([^/]+)/[^/]+(\.git)?$ ]]; then
    default_owner="${BASH_REMATCH[1],,}"
  fi
fi

default_version="$(node -p "require('$repo_root/npm/package.json').version" 2>/dev/null || echo "0.2.3")"

read -r -p "GHCR owner [$default_owner]: " owner
owner="${owner:-$default_owner}"
owner="${owner,,}"

read -r -p "Image tag [$default_version]: " version
version="${version:-$default_version}"

username="${GHCR_USERNAME:-}"
if [[ -z "$username" ]]; then
  read -r -p "GHCR username [$owner]: " username
  username="${username:-$owner}"
fi

if ! docker buildx inspect ndx2-multiarch >/dev/null 2>&1; then
  docker buildx create --name ndx2-multiarch --driver docker-container --bootstrap >/dev/null
fi
docker buildx use ndx2-multiarch >/dev/null

has_ghcr_auth="$(
  node -e "const fs=require('fs'); const p=process.env.HOME+'/.docker/config.json'; if(!fs.existsSync(p)) process.exit(1); const j=JSON.parse(fs.readFileSync(p,'utf8')); process.exit(j.auths && j.auths['ghcr.io'] ? 0 : 1)" \
    >/dev/null 2>&1 && echo yes || echo no
)"

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$username" --password-stdin
elif [[ "$has_ghcr_auth" != "yes" ]]; then
  printf "GHCR token with package write permission: "
  IFS= read -r -s token
  printf "\n"

  if [[ -z "$token" ]]; then
    echo "GHCR token is required unless docker is already logged in to ghcr.io." >&2
    exit 2
  fi

  printf '%s' "$token" | docker login ghcr.io -u "$username" --password-stdin
fi

agent_image="ghcr.io/$owner/ndx2-agent:$version"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f "$repo_root/npm/Dockerfile" \
  -t "$agent_image" \
  --push \
  "$repo_root"

docker buildx imagetools inspect "$agent_image" >/dev/null

echo "Published $agent_image"
