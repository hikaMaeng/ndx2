# ndx/agent/server/context behavior after initNDX

- suite: ndx-agent-server-context
- runned: 2026-05-11T16:48:22.108Z
- dependencies: ndx 0.1.0, node node --test with tsx, agenttest filesystem runner

## Results

### model_prompt

- PASS model-exact-file: Exact model prompt file is selected
  - PASS run-focused-node-test: Focused node:test 'model instruction resolves exact model names from file-backed prompt' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "model instruction resolves exact model names from file-backed prompt"
    - evidence:   duration_ms: 0.713353
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4511.440529
- PASS model-colon-fallback: Colon-suffixed model names fall back rightward
  - PASS run-focused-node-test: Focused node:test 'model instruction strips colon suffixes from the right' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "model instruction strips colon suffixes from the right"
    - evidence:   duration_ms: 0.548357
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4981.098802
- PASS model-default-file: Default user prompt is selected when model prompt is absent
  - PASS run-focused-node-test: Focused node:test 'model instruction falls back to default prompt file' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "model instruction falls back to default prompt file"
    - evidence:   duration_ms: 0.67525
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6137.198005
- PASS model-bundled-default: Bundled default prompt is available before user init
  - PASS run-focused-node-test: Focused node:test 'model instruction falls back to bundled default prompt when .ndx is absent' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "model instruction falls back to bundled default prompt when .ndx is absent"
    - evidence:   duration_ms: 0.710477
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5405.415946
- PASS initndx-default-context: initNDX seeded default prompt enters buildContext
  - PASS run-focused-node-test: Focused node:test 'buildContext uses initNDX seeded default model prompt' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "buildContext uses initNDX seeded default model prompt"
    - evidence:   duration_ms: 0.623414
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5210.19127
- PASS initndx-model-specific-context: Model-specific prompt under initialized .ndx overrides default
  - PASS run-focused-node-test: Focused node:test 'buildContext prefers model-specific prompt files under initialized .ndx' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "buildContext prefers model-specific prompt files under initialized .ndx"
    - evidence:   duration_ms: 0.555666
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4747.356136
- PASS model-slash-sanitized: Model prompt filenames sanitize slash characters
  - PASS run-focused-node-test: Focused node:test 'model instruction sanitizes slash characters before reading model prompt files' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "model instruction sanitizes slash characters before reading model prompt files"
    - evidence:   duration_ms: 0.759643
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5263.61173

### agents_cascade

- PASS home-and-project-agents: Home and project AGENTS instructions are included in order
  - PASS run-focused-node-test: Focused node:test 'user instructions include user and project AGENTS files in order' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "user instructions include user and project AGENTS files in order"
    - evidence:   duration_ms: 0.716739
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5128.653834
- PASS project-to-cwd-cascade: Project AGENTS cascade reaches cwd ancestors
  - PASS run-focused-node-test: Focused node:test 'user instructions cascade from project root to cwd descendants' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "user instructions cascade from project root to cwd descendants"
    - evidence:   duration_ms: 0.612684
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4953.155299
- PASS project-cwd-no-duplicate: Project AGENTS is not duplicated when cwd equals projectHome
  - PASS run-focused-node-test: Focused node:test 'user instructions do not duplicate project AGENTS when cwd equals projectHome' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "user instructions do not duplicate project AGENTS when cwd equals projectHome"
    - evidence:   duration_ms: 0.939635
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4934.17242
- PASS outside-cwd-agents-ignored: cwd outside projectHome does not leak unrelated AGENTS
  - PASS run-focused-node-test: Focused node:test 'user instructions ignore cwd AGENTS outside declared projectHome' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "user instructions ignore cwd AGENTS outside declared projectHome"
    - evidence:   duration_ms: 0.623535
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4491.680314

### context_shape

- PASS developer-system-prompt: User-home system prompt is rendered as developer instructions
  - PASS run-focused-node-test: Focused node:test 'developer instructions read user home .ndx system prompt when present' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "developer instructions read user home .ndx system prompt when present"
    - evidence:   duration_ms: 0.684238
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4784.865826
- PASS developer-system-prompt-absent: Missing user-home system prompt is omitted
  - PASS run-focused-node-test: Focused node:test 'developer instructions are omitted when system prompt is absent' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "developer instructions are omitted when system prompt is absent"
    - evidence:   duration_ms: 0.599279
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4851.747599
- PASS context-output-shape: buildContext returns developer and user strings with environment metadata
  - PASS run-focused-node-test: Focused node:test 'buildContext returns one developer string and one user string' exited 0.
    - evidence: cwd=/mnt/f/dev/ndx2/packages/ndx
    - evidence: command=yarn "exec" "node" "--import" "tsx" "--test" "src/**/*.test.ts" "--test-name-pattern" "buildContext returns one developer string and one user string"
    - evidence:   duration_ms: 0.767123
  type: 'test'
  ...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4986.820038

