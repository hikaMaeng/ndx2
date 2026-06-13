json_quote() {
  perl -0pe 'BEGIN { print "\"" } s/\\/\\\\/g; s/"/\\"/g; s/\x08/\\b/g; s/\f/\\f/g; s/\n/\\n/g; s/\r/\\r/g; s/\t/\\t/g; s/([\x00-\x07\x0B\x0E-\x1F])/sprintf("\\u%04x", ord($1))/eg; END { print "\"" }'
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

emit_error_with_append_message() {
  local message="$1"
  local appended_text="$2"
  printf '{"type":"error","success":false,"message":'
  printf '%s' "$message" | json_quote
  printf ',"effects":[{"type":"append_user_message","text":'
  printf '%s' "$appended_text" | json_quote
  printf '}]}\n'
}

cancelled() {
  emit_error "cancelled"
  exit 130
}

ndx_virtual_root() {
  realpath -m "${NDX_USER_HOME:-${NDX_PROJECT_HOME:-$PWD}}"
}

resolve_ndx_path() {
  local input="$1"
  local base="${2:-${NDX_PROJECT_HOME:-$PWD}}"
  case "$input" in
    /*) realpath -m "$input" ;;
    *) realpath -m "$base/$input" ;;
  esac
}

require_ndx_path() {
  local resolved_path="$1"
  local original_input="$2"
  local root
  root="$(ndx_virtual_root)"
  case "$resolved_path" in
    "$root"|"$root"/*) ;;
    *)
      local project_home correction
      project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
      correction="Path correction for this session:
The rejected path was $original_input.
This session's project root is $project_home.
This session's NDX virtual root is $root.
Use project-relative paths for project files; do not prefix them with /.
Absolute file-tool paths must stay under $root, and project absolute paths should start with $project_home."

      case "$original_input" in
        /tmp|/tmp/*)
          correction="$correction
Do not pass /tmp paths to file tools. For temporary files, create and use /tmp inside a single bash command, or use a project-local path such as .ndx/tmp/..."
          ;;
        /*)
          local stripped_input project_name workspace_prefix project_relative candidate_absolute
          stripped_input="${original_input#/}"
          project_name="${project_home##*/}"
          workspace_prefix="workspace/$project_name"
          project_relative="$stripped_input"
          while true; do
            case "$project_relative" in
              "$workspace_prefix") project_relative="." ;;
              "$workspace_prefix"/*) project_relative="${project_relative#"$workspace_prefix/"}" ;;
              *) break ;;
            esac
            [ "$project_relative" != "$workspace_prefix" ] || continue
          done
          if [ -n "$project_relative" ]; then
            if [ "$project_relative" = "." ]; then
              candidate_absolute="$project_home"
            else
              candidate_absolute="$(realpath -m "$project_home/$project_relative")"
            fi
            correction="$correction
For this project path, call the tool with:
$project_relative
or:
$candidate_absolute"
            if [ "$project_relative" != "$stripped_input" ]; then
              correction="$correction
Do not use $original_input or $stripped_input in this session."
            fi
          fi
          ;;
      esac

      emit_error_with_append_message "path escapes NDX virtual root: $original_input" "$correction"
      exit 1
      ;;
  esac
}
