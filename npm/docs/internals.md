# Internals

`bin/ndx2.js` resolves the image tag from `npm/package.json`.

The generated compose file binds the selected ndx root to `/ndx` and stores
PostgreSQL data under `<ndx-root>/pgvector`.

GitHub Actions publish GHCR images before npm publication. The npm publish
workflow expects the repository secret `NPM_TOKEN`.
