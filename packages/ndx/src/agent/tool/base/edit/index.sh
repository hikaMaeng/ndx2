set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
file_input="${1:-}"
replace_all="${2:-false}"
old_string="${3:-}"
new_string="${4:-}"

if [ -z "${file_input// }" ]; then
  emit_error "file_path is required."
  exit 1
fi

emit_progress "resolving path"
file_path="$(resolve_ndx_path "$file_input" "$project_home")"
require_ndx_path "$file_path" "$file_input"

if [ "$old_string" = "" ]; then
  emit_progress "creating file"
  mkdir -p "$(dirname "$file_path")"
  printf '%s' "$new_string" >"$file_path"
  payload="$(
    printf '{"path":'
    printf '%s' "$file_path" | json_quote
    printf ',"created":true,"replacements":1}'
  )"
  file_dir="$(dirname "$file_path")"
  if [ "$file_dir" = "$project_home" ]; then
    subgroup_title="."
  elif [[ "$file_dir" == "$project_home/"* ]]; then
    subgroup_title="${file_dir#"$project_home/"}"
  else
    subgroup_title="$file_dir"
  fi
  sidebar_item="$(
    printf '{"group":{"id":"changed-files","title":"변경 파일"},"key":'
    printf '%s' "changed-file:$file_path" | json_quote
    printf ',"subgroup":{"id":'
    printf '%s' "folder:$file_dir" | json_quote
    printf ',"title":'
    printf '%s' "$subgroup_title" | json_quote
    printf '}'
    printf ',"title":'
    printf '%s' "$(basename "$file_path")" | json_quote
    printf ',"body":'
    printf '%s' "$file_path" | json_quote
    printf ',"kind":"edit"}'
  )"
  emit_sidebar_item_json "$sidebar_item"
  emit_result_json "$payload"
  exit 0
fi

if [ ! -f "$file_path" ]; then
  emit_error "file does not exist: $file_input"
  exit 1
fi

emit_progress "replacing text"
export OLD_STRING="$old_string"
export NEW_STRING="$new_string"
export REPLACE_ALL="$replace_all"
export EDIT_FILE="$file_path"
set +e
replacements="$(
  perl -0pi -e '
    my $old = $ENV{OLD_STRING};
    my $new = $ENV{NEW_STRING};
    my $count = (() = /\Q$old\E/g);
    if ($count == 0) { die "old_string was not found.\n"; }
    if ($ENV{REPLACE_ALL} ne "true" && $count != 1) {
      die "old_string matched $count times; set replace_all to true to replace all occurrences.\n";
    }
    if ($ENV{REPLACE_ALL} eq "true") {
      s/\Q$old\E/$new/g;
      print STDERR "$count";
    } else {
      s/\Q$old\E/$new/;
      print STDERR "1";
    }
  ' "$EDIT_FILE" 2>&1 >/dev/null
)"
replace_code=$?
set -e

if [ "$replace_code" -ne 0 ] || ! [[ "$replacements" =~ ^[0-9]+$ ]]; then
  emit_error "$replacements"
  exit 1
fi

payload="$(
  printf '{"path":'
  printf '%s' "$file_path" | json_quote
  printf ',"replacements":%s}' "$replacements"
)"
file_dir="$(dirname "$file_path")"
if [ "$file_dir" = "$project_home" ]; then
  subgroup_title="."
elif [[ "$file_dir" == "$project_home/"* ]]; then
  subgroup_title="${file_dir#"$project_home/"}"
else
  subgroup_title="$file_dir"
fi
sidebar_item="$(
  printf '{"group":{"id":"changed-files","title":"변경 파일"},"key":'
  printf '%s' "changed-file:$file_path" | json_quote
  printf ',"subgroup":{"id":'
  printf '%s' "folder:$file_dir" | json_quote
  printf ',"title":'
  printf '%s' "$subgroup_title" | json_quote
  printf '}'
  printf ',"title":'
  printf '%s' "$(basename "$file_path")" | json_quote
  printf ',"body":'
  printf '%s' "$file_path" | json_quote
  printf ',"kind":"edit"}'
)"
emit_sidebar_item_json "$sidebar_item"
emit_result_json "$payload"
