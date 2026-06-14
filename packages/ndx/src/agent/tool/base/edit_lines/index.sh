set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
file_input="${1:-}"
start_line="${2:-}"
end_line="${3:-}"
expected_text="${4:-}"

if [ -z "${file_input// }" ]; then
  emit_error "file_path is required."
  exit 1
fi

case "$start_line" in
  ''|*[!0-9]*) emit_error "start_line must be a positive integer."; exit 1 ;;
esac
case "$end_line" in
  ''|*[!0-9]*) emit_error "end_line must be a positive integer."; exit 1 ;;
esac
if [ "$start_line" -lt 1 ]; then
  emit_error "start_line must be a positive integer."
  exit 1
fi
if [ "$end_line" -lt "$start_line" ]; then
  emit_error "end_line must be greater than or equal to start_line."
  exit 1
fi

replacement_file="$(mktemp)"
trap 'rm -f "$replacement_file" "${tmp_file:-}"' EXIT
cat >"$replacement_file"

emit_progress "resolving path"
file_path="$(resolve_ndx_path "$file_input" "$project_home")"
require_ndx_path "$file_path" "$file_input"

if [ ! -f "$file_path" ]; then
  emit_error "file does not exist: $file_input"
  exit 1
fi

tmp_file="$(mktemp)"
emit_progress "replacing lines"
export EDIT_LINES_FILE="$file_path"
export EDIT_LINES_TMP="$tmp_file"
export EDIT_LINES_REPLACEMENT_FILE="$replacement_file"
export EDIT_LINES_EXPECTED="$expected_text"
export EDIT_LINES_START="$start_line"
export EDIT_LINES_END="$end_line"

set +e
edit_summary="$(
  perl -e '
    use strict;
    use warnings;
    use JSON::PP qw(decode_json);

    my $file = $ENV{EDIT_LINES_FILE};
    my $tmp = $ENV{EDIT_LINES_TMP};
    my $replacement_file = $ENV{EDIT_LINES_REPLACEMENT_FILE};
    my $start = int($ENV{EDIT_LINES_START});
    my $end = int($ENV{EDIT_LINES_END});
    my $expected = $ENV{EDIT_LINES_EXPECTED};
    my $tool_args = eval { decode_json($ENV{NDX_TOOL_ARGUMENTS} // "{}") } || {};
    my $has_expected = ref($tool_args) eq "HASH" && exists $tool_args->{expected_text};

    open my $in, "<", $file or die "failed to read file: $!\n";
    local $/;
    my $content = <$in>;
    close $in;
    $content = "" unless defined $content;

    my $had_trailing_newline = $content =~ /\n\z/;
    my @lines = length($content) ? split(/\n/, $content, -1) : ();
    pop @lines if $had_trailing_newline;
    die "line range exceeds file length: $start-$end of " . scalar(@lines) . "\n" if $end > @lines;

    my $current = join("\n", @lines[($start - 1)..($end - 1)]);
    if ($has_expected && $current ne $expected) {
      die "expected_text did not match current line range.\n";
    }

    open my $replacement_in, "<", $replacement_file or die "failed to read replacement: $!\n";
    local $/;
    my $replacement = <$replacement_in>;
    close $replacement_in;
    $replacement = "" unless defined $replacement;

    my @replacement_lines = length($replacement) ? split(/\n/, $replacement, -1) : ();
    pop @replacement_lines if length($replacement) && $replacement =~ /\n\z/;
    splice @lines, $start - 1, $end - $start + 1, @replacement_lines;

    open my $out, ">", $tmp or die "failed to write temp file: $!\n";
    print {$out} join("\n", @lines);
    print {$out} "\n" if $had_trailing_newline && @lines;
    close $out;

    print(($end - $start + 1) . ":" . scalar(@replacement_lines));
  ' 2>&1
)"
edit_code=$?
set -e

if [ "$edit_code" -ne 0 ] || ! [[ "$edit_summary" =~ ^[0-9]+:[0-9]+$ ]]; then
  emit_error "$edit_summary"
  exit 1
fi

cat "$tmp_file" >"$file_path"
replaced_lines="${edit_summary%%:*}"
inserted_lines="${edit_summary#*:}"
payload="$(
  printf '{"path":'
  printf '%s' "$file_path" | json_quote
  printf ',"start_line":%s,"end_line":%s,"replaced_lines":%s,"inserted_lines":%s}' "$start_line" "$end_line" "$replaced_lines" "$inserted_lines"
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
  printf ',"kind":"edit_lines"}'
)"
emit_sidebar_item_json "$sidebar_item"
emit_result_json "$payload"
