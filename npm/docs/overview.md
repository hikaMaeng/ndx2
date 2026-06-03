# Overview

`@neurondev/ndx2` installs the `ndx2` command for end-user Docker launch.

It is not the source build workflow. It writes npm-owned state under `~/.ndx2`,
generates a compose file from `templates/docker-compose.yml`, and starts public
GHCR images for the package version.
