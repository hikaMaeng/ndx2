#!/usr/bin/env sh
set -eu

echo "headless-browser-env"

if [ -n "${NDX_ROOT:-}" ]; then
  echo "runtime: ndx-container NDX_ROOT=$NDX_ROOT"
else
  echo "runtime: host-or-non-ndx-container"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node: missing"
  exit 1
fi

echo "node: $(node --version) ($(command -v node))"

status=0

if ! node - <<'NODE'
const { createRequire } = require("node:module");
const candidates = [];

try {
  candidates.push({ source: "workspace", path: require.resolve("playwright") });
} catch {}

try {
  const globalRequire = createRequire("/usr/local/lib/node_modules/playwright/package.json");
  candidates.push({ source: "global", path: globalRequire.resolve("playwright") });
} catch {}

if (candidates.length === 0) {
  console.log("playwright: missing");
  process.exitCode = 1;
} else {
  for (const candidate of candidates) {
    console.log(`playwright: ${candidate.source} ${candidate.path}`);
  }
}
NODE
then
  status=1
fi

browser="${NDX_HEADLESS_BROWSER_EXECUTABLE:-}"
if [ -n "$browser" ]; then
  if [ -x "$browser" ]; then
    echo "chromium: env $browser"
  else
    echo "chromium: env path is not executable: $browser"
    exit 1
  fi
  exit "$status"
fi

found=""
for candidate in chromium chromium-browser google-chrome google-chrome-stable /usr/bin/chromium /usr/bin/chromium-browser; do
  if command -v "$candidate" >/dev/null 2>&1; then
    found="$(command -v "$candidate")"
    break
  fi
  if [ -x "$candidate" ]; then
    found="$candidate"
    break
  fi
done

if [ -z "$found" ]; then
  echo "chromium: missing"
  if [ -z "${NDX_ROOT:-}" ]; then
    echo "note: this check ran outside the ndx app container; Dockerfile-installed browser packages are not visible here"
  fi
  exit 1
fi

echo "chromium: $found"
if [ "$status" -ne 0 ] && [ -z "${NDX_ROOT:-}" ]; then
  echo "note: this check ran outside the ndx app container; Dockerfile-installed Node packages are not visible here"
fi
exit "$status"
