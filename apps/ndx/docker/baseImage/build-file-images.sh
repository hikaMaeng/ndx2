#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"

version="${NDX2_BASE_IMAGE_VERSION:-$(node -p "require('$repo_root/npm/package.json').version" 2>/dev/null || echo "0.2.3")}"
image_name="${NDX2_BASE_IMAGE_NAME:-ndx2-ndx-base}"
output_dir="${NDX2_BASE_IMAGE_OUTPUT_DIR:-$script_dir/out}"
platforms="${NDX2_BASE_IMAGE_PLATFORMS:-linux/amd64,linux/arm64}"

# see ../../../../docs/npm-release.md#local-base-image-contract
if ! docker buildx inspect ndx2-multiarch >/dev/null 2>&1; then
  docker buildx create --name ndx2-multiarch --driver docker-container --bootstrap >/dev/null
fi
docker buildx use ndx2-multiarch >/dev/null

mkdir -p "$output_dir"

IFS=',' read -r -a platform_list <<< "$platforms"
for platform in "${platform_list[@]}"; do
  platform="${platform//[[:space:]]/}"
  if [[ -z "$platform" ]]; then
    continue
  fi
  if [[ "$platform" != linux/amd64 && "$platform" != linux/arm64 ]]; then
    echo "unsupported base image platform: $platform" >&2
    exit 2
  fi

  arch="${platform#linux/}"
  tag="$image_name:$version-$arch"
  archive="$output_dir/${image_name}-${version}-linux-${arch}.tar"

  docker buildx build \
    --platform "$platform" \
    -f "$script_dir/Dockerfile" \
    -t "$tag" \
    --output "type=docker,dest=$archive" \
    "$script_dir"

  echo "Wrote $archive"
done
