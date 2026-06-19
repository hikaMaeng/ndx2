#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

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

read -r -p "GHCR username [$owner]: " username
username="${username:-$owner}"

printf "GHCR token with package write permission: "
IFS= read -r -s token
printf "\n"

if [[ -z "$token" ]]; then
  echo "GHCR token is required." >&2
  exit 2
fi

if ! docker buildx inspect ndx2-multiarch >/dev/null 2>&1; then
  docker buildx create --name ndx2-multiarch --driver docker-container --bootstrap >/dev/null
fi
docker buildx use ndx2-multiarch >/dev/null

printf '%s' "$token" | docker login ghcr.io -u "$username" --password-stdin

image="ghcr.io/$owner/ndx2-pgvector:$version"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f "$script_dir/Dockerfile.pgvector" \
  -t "$image" \
  --push \
  "$script_dir"

docker buildx imagetools inspect "$image" >/dev/null

echo "Published $image"
