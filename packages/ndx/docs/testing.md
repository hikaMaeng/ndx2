# Testing

Use package-local tests for domain invariants and state transitions. The
load-bearing invariants are listed in
[constraints.md](constraints.md#blast-radius); cover those first
(append-only `sessiondata` ordering, settings forward-compat, path mapping).

Keep app tests focused on HTTP, framework lifecycle, asset serving, and
integration boundaries.

This package renders no UI, so no browser locator contract applies. The
`apps/ndx` UI records approved test ids and landmarks in its own docs.
