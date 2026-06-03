json_quote() {
  perl -0pe 'BEGIN { print "\"" } s/\\/\\\\/g; s/"/\\"/g; s/\n/\\n/g; s/\r/\\r/g; s/\t/\\t/g; END { print "\"" }'
}

emit_progress() {
  printf '{"type":"progress","message":'
  printf '%s' "$1" | json_quote
  printf '}\n'
}

emit_debug() {
  printf '{"type":"debug","message":'
  printf '%s' "$1" | json_quote
  printf '}\n'
}

emit_agentcall() {
  printf '[[ndx-agentcall:%s]]\n' "$1"
}

emit_sidebar_item_json() {
  local payload
  payload="$(printf '{"type":"ndx.agentcall","name":"session.sidebar_item","input":%s}' "$1")"
  emit_agentcall "$payload"
}

emit_result_json() {
  printf '{"type":"result","success":true,"output":%s}\n' "$1"
}

emit_result_text() {
  printf '{"type":"result","success":true,"output":'
  printf '%s' "$1" | json_quote
  printf '}\n'
}

emit_error() {
  printf '{"type":"error","success":false,"message":'
  printf '%s' "$1" | json_quote
  printf '}\n'
}

cancelled() {
  emit_error "cancelled"
  exit 130
}

ndx_virtual_root() {
  realpath -m "${NDX_USER_HOME:-${NDX_PROJECT_HOME:-$PWD}}"
}

resolve_ndx_path() {
  input="$1"
  base="${2:-${NDX_PROJECT_HOME:-$PWD}}"
  case "$input" in
    /*) realpath -m "$input" ;;
    *) realpath -m "$base/$input" ;;
  esac
}

require_ndx_path() {
  resolved_path="$1"
  original_input="$2"
  root="$(ndx_virtual_root)"
  case "$resolved_path" in
    "$root"|"$root"/*) ;;
    *)
      emit_error "path escapes NDX virtual root: $original_input"
      exit 1
      ;;
  esac
}
