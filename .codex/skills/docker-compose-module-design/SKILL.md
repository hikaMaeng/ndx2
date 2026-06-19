---
name: docker-compose-module-design
description: Enforce the repository Docker contract: Docker-first runtime, one root docker-compose.yml, module-owned Docker assets, apps service-module to container mapping, isolated networking, Docker socket passthrough for container-spawning services, a standard npm deploy entrypoint, and runtime-only Dockerfiles that copy prebuilt local dist artifacts instead of building the project. Use when defining compose services, Dockerfiles, networks, volumes, env_file wiring, deploy scripts, Docker socket access, or container ownership.
---

# Docker Compose Module Design

Enforce orchestration-only compose. Enforce non-build Dockerfiles. Enforce one deploy entrypoint.

## Ownership

* Primary runtime: Docker.
* Root `docker-compose.yml`: only orchestration entrypoint.
* Container ownership boundary: `apps/*` or `packages/*`.
* If an app service module owns a service, compose sees that module as one container.
* Any container-owning module requires `docker/` as the single module-owned Docker root.
* `apps/<service>/docker/` must contain all Docker-related files for that service, including `.env*`, `Dockerfile`, and any compose-local assets.
* `apps/<service>/docker/volumes/` must contain all service-specific volume mount content, with subfolders as needed.

## Compose

* Root compose integrates module containers only.
* Do not run containers outside root compose flow.
* Root compose should depend on module-owned `apps/<service>/docker/` assets, not duplicate service-local Docker files at repo root.
* Use `env_file`, named volumes, explicit networks.
* Default network: isolated internal.
* Cross-project connectivity: external `linker` only.
* Keep build context minimal.
* If a container may create or control Docker containers, mount the host Docker
  socket in that service:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

This uses the Windows/WSL-level parent Docker daemon instead of creating nested
Docker-in-Docker container layers. Require this mount for compose services that
run agents, tools, CI workers, build workers, or any process likely to invoke
Docker from inside the container. Do not add a Docker daemon inside the image to
solve this problem.

## Deploy Entry

* Prefer one standard entrypoint: `npm run deploy`.
* `npm run deploy` must finish local build first, then refresh the target stack through compose.
* Treat the server produced by `npm run deploy` as the only valid test target by default.
* Prefer invoking `npm run deploy` over instructing separate manual build and compose commands.
* A Docker deploy request means local build plus Compose refresh. Do not skip the
  local build unless the user explicitly asks for container restart only.

## Dockerfile

* Dockerfile is not a project build script.
* Do not install project dependencies, run Turbo, Yarn build, Vite build, TS compile, or equivalent project-build logic.
* OS packages and global image-owned tools such as Docker CLI, Yarn, Chromium, or Playwright may be baked into the image when the service runtime contract requires them.
* Copy already-built local artifacts, especially `dist/`, plus minimal runtime files only.
* If `dist/` is absent, build elsewhere first; never build inside the Dockerfile.
* Runtime start only.

## Output

Return service/container ownership, deploy entrypoint, copied artifacts, compose wiring, rule violations, required fixes.

## Load

If checking, read `references/checklist.md`.
