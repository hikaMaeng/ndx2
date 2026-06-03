# Checklist

* TS stable; Turbo + Yarn Plug'n'Play workspace present
* task `inputs` / `outputs` explicit; remote-cache strategy documented
* root `package.json` declares `packageManager: "yarn@..."`
* root `.yarnrc.yml` sets `nodeLinker: pnp` and `enableGlobalCache: true`
* no workspace `node_modules` dependency path is required
* no `pnpm` commands, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `npm install` dependency workflow
* `yarn.lock` committed and immutable
* no one-line private helper that only renames an expression, method call, regex, normalization, or filename sanitization
* no file-local helper called once unless it isolates parsing, validation, persistence, network IO, a nontrivial algorithm, or a real domain invariant
* no nested helper decomposition without concrete duplication, a second caller, or a meaningful boundary
* no class used as a namespace or without identity, mutable lifecycle, polymorphism, or resource ownership
* classify target: `apps/` or `packages/`
* apps may depend on packages; packages never depend on apps
* reject app->package boundary violations
* workspace-name imports only
* one service per app module
* require `src/server` + `src/front`
* require exactly one paired `packages/<service>_domain` per `apps/<service>`
* reject additional domain-related packages for the same app
* domain package has `src/common`, `src/server`, and `src/front`
* domain logic and invariants live in the paired domain package, not in app lifecycle wiring
* non-domain packages remain cohesive and standalone unless a durable shared abstraction requires a dependency
* Vite-built front, Express-served prod front
* FE independently buildable
* final container target = server runtime
* exact versions only
* framework deps in package `peerDependencies`
* `main`/`module`/`types` -> `dist/`
* tsconfig path == package name
* standard deploy script = `npm run deploy`
* deploy wraps local build + compose refresh
* no hardcoded port; env range `10000-59999`
* `.env` + `.env.example` present
* env validated before use
