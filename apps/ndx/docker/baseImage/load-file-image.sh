#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"

version="${NDX2_BASE_IMAGE_VERSION:-$(node -p "require('$repo_root/npm/package.json').version" 2>/dev/null || echo "0.2.3")}"
image_name="${NDX2_BASE_IMAGE_NAME:-ndx2-ndx-base}"
output_dir="${NDX2_BASE_IMAGE_OUTPUT_DIR:-$script_dir/out}"
target_tag="${NDX2_BASE_IMAGE_TAG:-$image_name:$version}"

# see ../../../../docs/npm-release.md#local-base-image-contract
server_arch="$(docker version --format '{{.Server.Arch}}' 2>/dev/null || uname -m)"
case "$server_arch" in
  amd64|x86_64)
    arch="amd64"
    ;;
  arm64|aarch64)
    arch="arm64"
    ;;
  *)
    echo "unsupported Docker server architecture for ndx base image: $server_arch" >&2
    exit 2
    ;;
esac

loaded_arch="$(docker image inspect "$target_tag" --format '{{.Architecture}}' 2>/dev/null || true)"
if [[ "$loaded_arch" == "$arch" ]]; then
  echo "$target_tag"
  exit 0
fi

archive="$output_dir/${image_name}-${version}-linux-${arch}.tar"
if [[ ! -f "$archive" ]]; then
  NDX2_BASE_IMAGE_PLATFORMS="linux/$arch" "$script_dir/build-file-images.sh"
fi

docker load -i "$archive" >/dev/null
docker tag "$image_name:$version-$arch" "$target_tag"
echo "$target_tag"
