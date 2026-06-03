set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
pattern="${1:-}"
path_input="${2:-.}"
glob_pattern="${3:-}"
limit="${4:-100}"

if [ -z "$pattern" ]; then
  emit_error "pattern is required."
  exit 1
fi

emit_progress "resolving search root"
root="$(resolve_ndx_path "$path_input" "$project_home")"
require_ndx_path "$root" "$path_input"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
export GREP_GLOB_PATTERN="$glob_pattern"

emit_progress "searching files"
if [ -f "$root" ]; then
  printf '%s\n' "$root"
else
  find "$root" \
    \( -name .git -o -name node_modules -o -name .yarn \) -prune -o \
    -type f -printf '%p\n'
fi | perl -MFile::Spec -MFile::Basename -ne '
  chomp;
  my $glob = $ENV{GREP_GLOB_PATTERN};
  if ($glob ne "") {
    our $regex;
    if (!$regex) {
      my $escaped = quotemeta($glob);
      $escaped =~ s/\\\*\\\*/.*/g;
      $escaped =~ s/\\\*/[^\/]*/g;
      $regex = qr/^$escaped$/;
    }
    my $rel = File::Spec->abs2rel($_, $ENV{NDX_PROJECT_HOME});
    $rel =~ s#\\#/#g;
    my $base = basename($_);
    next unless $rel =~ $regex || $base =~ $regex;
  }
  print "$_\n";
' |
  xargs -r grep -InH -i -m "$limit" -- "$pattern" >"$tmp" || true

emit_progress "formatting results"
match_count="$(awk -v limit="${limit:-100}" 'NR <= limit { count += 1 } END { print count + 0 }' "$tmp")"
total_count="$(wc -l <"$tmp" | tr -d ' ')"
payload="$(
  printf '{"pattern":'
  printf '%s' "$pattern" | json_quote
  printf ',"root":'
  printf '%s' "$root" | json_quote
  printf ',"matches":['
  awk -F: -v limit="${limit:-100}" '
    function q(s) {
      gsub(/\\/,"\\\\",s); gsub(/"/,"\\\"",s); gsub(/\t/,"\\t",s); gsub(/\r/,"\\r",s);
      return "\"" s "\"";
    }
    NR <= limit {
      line = $0;
      file = $1;
      number = $2;
      sub("^[^:]*:[0-9]+:", "", line);
      if (NR > 1) printf ",";
      printf "{\"path\":%s,\"line\":%d,\"text\":%s}", q(file), number, q(line);
    }
  ' "$tmp"
  printf '],"count":%s,"truncated":' "$match_count"
  if [ "$total_count" -gt "$match_count" ]; then printf 'true'; else printf 'false'; fi
  printf '}'
)"
sidebar_body="$(printf '%s개 매치' "$match_count")"
sidebar_item="$(
  printf '{"group":{"id":"text-searches","title":"텍스트 검색"},"key":'
  printf '%s' "grep-search:$pattern:${NDX_TOOL_CALL_ID:-}" | json_quote
  printf ',"title":'
  printf '%s' "$pattern" | json_quote
  printf ',"body":'
  printf '%s' "$sidebar_body" | json_quote
  printf ',"kind":"grep_search"}'
)"
emit_sidebar_item_json "$sidebar_item"
emit_result_json "$payload"
