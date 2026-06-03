# Testing

Run static package checks from the repository root:

```sh
npm --prefix npm run check
node --check npm/bin/ndx2.js
```

Run package contents verification from `npm/`:

```sh
npm pack --dry-run
```
