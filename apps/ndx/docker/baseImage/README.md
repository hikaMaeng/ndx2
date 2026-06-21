ndx local base image source and file-image scripts.

| Goal | File |
| --- | --- |
| Build amd64/arm64 file images | [build-file-images.sh](build-file-images.sh) |
| Load the host-platform file image | [load-file-image.sh](load-file-image.sh) |
| Runtime base Dockerfile | [Dockerfile](Dockerfile) |

`apps/ndx/docker/Dockerfile` expects `ndx2-ndx-base:<version>` to exist in the
local Docker image store. `load-file-image.sh` creates or loads that tag from
`out/ndx2-ndx-base-<version>-linux-<arch>.tar`.
