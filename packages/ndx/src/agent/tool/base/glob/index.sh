set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

project_home="$(realpath -m "${NDX_PROJECT_HOME:-$PWD}")"
pattern="${1:-}"
path_input="${2:-.}"
limit="${3:-100}"

if [ -z "$pattern" ]; then
  emit_error "pattern is required."
  exit 1
fi

emit_progress "resolving search root"
root="$(resolve_ndx_path "$path_input" "$project_home")"
require_ndx_path "$root" "$path_input"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
export GLOB_PATTERN="$pattern"

emit_progress "scanning files"
find "$root" \
  \( -name .git -o -name node_modules -o -name .yarn \) -prune -o \
  -type f -printf '%p\n' |
  perl -MFile::Spec -MFile::Basename -ne '
    chomp;
    my $project = $ENV{NDX_PROJECT_HOME};
    my $pattern = $ENV{GLOB_PATTERN};
    our $regex;
    if (!$regex) {
      my $escaped = quotemeta($pattern);
      $escaped =~ s/\\\*\\\*/.*/g;
      $escaped =~ s/\\\*/[^\/]*/g;
      $regex = qr/^$escaped$/;
    }
    my $rel = File::Spec->abs2rel($_, $project);
    $rel =~ s#\\#/#g;
    my $base = basename($_);
    print "$_\n" if $rel =~ $regex || $base =~ $regex;
  ' >"$tmp"

count="$(wc -l <"$tmp" | tr -d ' ')"
emit_progress "formatting results"
payload="$(
  printf '{"pattern":'
  printf '%s' "$pattern" | json_quote
  printf ',"root":'
  printf '%s' "$root" | json_quote
  printf ',"count":%s,"files":[' "$count"
  head -n "${limit:-100}" "$tmp" | awk '
    function q(s) {
      gsub(/\\/,"\\\\",s); gsub(/"/,"\\\"",s); gsub(/\t/,"\\t",s); gsub(/\r/,"\\r",s);
      return "\"" s "\"";
    }
    { if (NR > 1) printf ","; printf "%s", q($0); }
  '
  printf '],"truncated":'
  if [ "$count" -gt "${limit:-100}" ]; then printf 'true'; else printf 'false'; fi
  printf '}'
)"
emit_result_json "$payload"
