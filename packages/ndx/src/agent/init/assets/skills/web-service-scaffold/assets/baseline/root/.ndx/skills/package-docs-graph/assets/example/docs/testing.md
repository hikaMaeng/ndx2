# Testing

* Unit: `src/common` resolvers and `Session` turn ordering are the load-bearing
  invariants (see [constraints.md](constraints.md#blast-radius)); cover those
  first.
* Run: `pnpm --filter ndx test`.

This package renders no UI, so no browser locator contract applies. A UI package
records approved test ids and landmarks here and in `constraints.md` per the
`headless-browser-markup` skill.
