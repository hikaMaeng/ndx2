set -euo pipefail
. "$NDX_TOOL_DIRECTORY/../_lib/protocol.sh"
trap cancelled TERM INT

name="${1:-}"
skill_list="${2:-[]}"
if [ "$#" -ge 3 ]; then
  loaded_skill="$3"
else
  loaded_skill='{"names":[],"paths":[]}'
fi

if [ -z "${name// }" ]; then
  emit_error "name is required."
  exit 1
fi

emit_progress "selecting skill"
perl -MJSON::PP -Mutf8 -e '
  use strict;
  use warnings;

  my ($requested, $skill_json, $loaded_json) = @ARGV;
  my $json = JSON::PP->new->utf8->canonical;
  my $skills = eval { $json->decode($skill_json) } || [];
  my $loaded = eval { $json->decode($loaded_json) } || {};

  sub normalize {
    my ($value) = @_;
    $value = lc($value // "");
    $value =~ s/[^[:alnum:]]//g;
    return $value;
  }

  sub distance {
    my ($left, $right) = @_;
    return length($right) if length($left) == 0;
    return length($left) if length($right) == 0;
    my @prev = 0..length($right);
    for my $i (0..length($left)-1) {
      my @cur = ($i + 1);
      for my $j (0..length($right)-1) {
        my $cost = substr($left, $i, 1) eq substr($right, $j, 1) ? 0 : 1;
        my $replace = $prev[$j] + $cost;
        my $insert = $cur[$j] + 1;
        my $delete = $prev[$j + 1] + 1;
        $cur[$j + 1] = ($replace < $insert ? ($replace < $delete ? $replace : $delete) : ($insert < $delete ? $insert : $delete));
      }
      @prev = @cur;
    }
    return $prev[length($right)];
  }

  my $skill;
  for my $candidate (@$skills) {
    if (($candidate->{name} // "") eq $requested) {
      $skill = $candidate;
      last;
    }
  }

  my $normalized = normalize($requested);
  if (!$skill) {
    for my $candidate (@$skills) {
      if (normalize($candidate->{name}) eq $normalized) {
        $skill = $candidate;
        last;
      }
    }
  }

  if (!$skill) {
    my $best;
    my $best_distance;
    for my $candidate (@$skills) {
      my $candidate_distance = distance($normalized, normalize($candidate->{name}));
      if (!defined($best_distance) || $candidate_distance < $best_distance) {
        $best = $candidate;
        $best_distance = $candidate_distance;
      }
    }
    my $max_len = length($normalized) > length($best->{name} // "") ? length($normalized) : length($best->{name} // "");
    my $limit = int($max_len * 0.25);
    $limit = 2 if $limit < 2;
    $skill = $best if defined($best_distance) && $best_distance <= $limit;
  }

  if (!$skill) {
    print $json->encode({ type => "error", success => JSON::PP::false, message => "Skill is not available: " . ($requested || "missing skill name") }) . "\n";
    exit 1;
  }

  my $loaded_name_values = ref($loaded->{names}) eq "ARRAY" ? $loaded->{names} : [];
  my $loaded_path_values = ref($loaded->{paths}) eq "ARRAY" ? $loaded->{paths} : [];
  my %loaded_names = map { (normalize($_), 1) } @$loaded_name_values;
  my %loaded_paths = map { ($_, 1) } @$loaded_path_values;
  if ($loaded_names{normalize($skill->{name})} || $loaded_paths{$skill->{path}}) {
    print $json->encode({ type => "result", success => JSON::PP::true, output => "Skill already loaded in the current session context: $skill->{name} ($skill->{path})" }) . "\n";
    exit 0;
  }

  open my $fh, "<:encoding(UTF-8)", $skill->{path} or do {
    print $json->encode({ type => "error", success => JSON::PP::false, message => "Skill file cannot be read: $skill->{path}" }) . "\n";
    exit 1;
  };
  print $json->encode({
    type => "progress",
    message => "\${SIDEBAR_ITEM} " . $skill->{name},
    data => {
      sidebarItem => {
        group => { id => "skills", title => "스킬" },
        key => "skill:" . $skill->{name} . ":" . $skill->{path},
        title => $skill->{name},
        body => $skill->{path},
        kind => "skill"
      }
    }
  }) . "\n";
  local $/;
  my $body = <$fh>;
  close $fh;
  my $output = "<skill>\n<name>$skill->{name}</name>\n<path>$skill->{path}</path>\n$body\n</skill>";
  print $json->encode({ type => "result", success => JSON::PP::true, output => $output }) . "\n";
' "$name" "$skill_list" "$loaded_skill"
