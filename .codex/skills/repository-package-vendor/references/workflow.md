# Workflow

* summarize requested capability
* search source repositories directly for package candidates
* inspect repository files, tags, releases, and package manifests if needed
* prefer reuse / extension over reimplementation
* vendor under `packages/`
* align with workspace rules
* keep Yarn Plug'n'Play dependency policy intact: Yarn commands only, root `packageManager: "yarn@..."`, no `pnpm-lock.yaml`, no `pnpm-workspace.yaml`, no `npm install` dependency workflow
* apply derived version only when instructed
