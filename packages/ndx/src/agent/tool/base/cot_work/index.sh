set -eu

perl <<'PERL'
use strict;
use warnings;
use JSON::PP;

my $json = JSON::PP->new->canonical(1);

sub emit_error {
  my ($message) = @_;
  print $json->encode({ type => "error", success => JSON::PP::false, message => $message }) . "\n";
  exit 0;
}

my $input = eval { $json->decode($ENV{NDX_TOOL_ARGUMENTS} || "{}") };
emit_error("tool arguments must be valid JSON.") if $@ || ref($input) ne "HASH";

my $steps = $input->{steps};
emit_error("steps must be a non-empty array.") if ref($steps) ne "ARRAY" || @$steps == 0;

my %statuses = map { $_ => 1 } qw(pending in_progress completed);
my $in_progress = 0;
my $completed = 0;
my @normalized_steps;
for my $step (@$steps) {
  emit_error("each step must be an object.") if ref($step) ne "HASH";
  emit_error("each step.task must be a non-empty string.") if !defined($step->{task}) || ref($step->{task}) || $step->{task} !~ /\S/;
  emit_error("each step.status must be pending, in_progress, or completed.") if !defined($step->{status}) || ref($step->{status}) || !$statuses{$step->{status}};
  $in_progress += 1 if $step->{status} eq "in_progress";
  $completed += 1 if $step->{status} eq "completed";
  push @normalized_steps, { task => $step->{task}, status => $step->{status} };
}

emit_error("active cot_work plans must have exactly one in_progress step; only a fully completed plan may have none.") if $in_progress != 1 && $completed != @$steps;
emit_error("reason must be a string when provided.") if exists($input->{reason}) && ref($input->{reason});

my $output = { steps => \@normalized_steps };
$output->{reason} = $input->{reason} if exists($input->{reason});

print "[[ndx-agentcall:" . $json->encode({ type => "ndx.agentcall", name => "session.cot_work", input => $output }) . "]]\n";
print $json->encode({ type => "result", success => JSON::PP::true, output => { recorded => JSON::PP::true, steps => scalar(@normalized_steps) } }) . "\n";
PERL
