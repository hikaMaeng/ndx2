set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
file_input="${1:-}"

if [ -z "${file_input// }" ]; then
  emit_error "file_path is required."
  exit 1
fi

emit_progress "resolving path"
file_path="$(resolve_ndx_path "$file_input" "$project_home")"
require_ndx_path "$file_path" "$file_input"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat >"$tmp"
emit_progress "writing file"
mkdir -p "$(dirname "$file_path")"
cat "$tmp" >"$file_path"
bytes="$(wc -c <"$tmp" | tr -d ' ')"

payload="$(
  printf '{"path":'
  printf '%s' "$file_path" | json_quote
  printf ',"bytes":%s}' "$bytes"
)"
emit_result_json "$payload"
