set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
command_text="${1:-}"
workdir_input="${2:-.}"
timeout_ms="${3:-60000}"
max_output_tokens="${4:-12000}"

if [ -z "${command_text// }" ]; then
  emit_error "command is required."
  exit 1
fi

emit_progress "resolving workdir"
workdir="$(resolve_ndx_path "$workdir_input" "$project_home")"
require_ndx_path "$workdir" "$workdir_input"

if [ ! -d "$workdir" ]; then
  emit_error "workdir does not exist: $workdir_input"
  exit 1
fi

timeout_seconds=$(( (${timeout_ms:-60000} + 999) / 1000 ))
max_bytes=$(( (${max_output_tokens:-12000} > 256 ? ${max_output_tokens:-12000} : 256) * 4 ))
stdout_file="$(mktemp)"
stderr_file="$(mktemp)"
trap 'rm -f "$stdout_file" "$stderr_file"' EXIT

emit_progress "running command"
set +e
(
  cd "$workdir" || exit 1
  timeout "$timeout_seconds" bash -lc "$command_text"
) >"$stdout_file" 2>"$stderr_file"
code=$?
set -e

output="$({
  if [ -s "$stdout_file" ]; then
    printf 'stdout:\n'
    cat "$stdout_file"
    printf '\n'
  fi
  if [ -s "$stderr_file" ]; then
    printf 'stderr:\n'
    cat "$stderr_file"
    printf '\n'
  fi
  printf 'exit_code: %s' "$code"
} | head -c "$max_bytes")"

if [ "$code" -ne 0 ]; then
  emit_error "$output"
  exit 1
fi
emit_result_text "$output"
