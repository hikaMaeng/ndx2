set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
file_input="${1:-}"
offset="${2:-0}"
limit="${3:-}"

if [ -z "${file_input// }" ]; then
  emit_error "path is required."
  exit 1
fi

emit_progress "resolving path"
file_path="$(resolve_ndx_path "$file_input" "$project_home")"
require_ndx_path "$file_path" "$file_input"

if [ ! -f "$file_path" ]; then
  emit_error "file does not exist: $file_input"
  exit 1
fi

emit_progress "reading file"
file_title="$(basename "$file_path")"
sidebar_item="$(
  printf '{"group":{"id":"file-references","title":"파일참조"},"key":'
  printf '%s' "file-reference:$file_path" | json_quote
  printf ',"title":'
  printf '%s' "$file_title" | json_quote
  printf ',"body":'
  printf '%s' "$file_path" | json_quote
  printf ',"kind":"file_reference"}'
)"
emit_sidebar_item_json "$sidebar_item"
line_count="$(awk 'END { print NR + 0 }' "$file_path")"
content_file="$(mktemp)"
trap 'rm -f "$content_file"' EXIT

awk -v offset="${offset:-0}" -v limit="$limit" '
  BEGIN { start = offset + 1; max = limit + 0; printed = 0; }
  NR >= start && (limit == "" || printed < max) {
    if (printed > 0) printf "\n";
    printf "%s", $0;
    printed += 1;
  }
' "$file_path" >"$content_file"

returned_line_count="$(awk 'END { print NR + 0 }' "$content_file")"
truncated=false
if [ -n "$limit" ] && [ $(( ${offset:-0} + ${limit:-0} )) -lt "$line_count" ]; then
  truncated=true
fi

payload="$(
  printf '{"path":'
  printf '%s' "$file_path" | json_quote
  printf ',"offset":%s,"line_count":%s,"returned_line_count":%s,"truncated":%s,"content":' "${offset:-0}" "$line_count" "$returned_line_count" "$truncated"
  json_quote <"$content_file"
  printf '}'
)"
emit_result_json "$payload"
