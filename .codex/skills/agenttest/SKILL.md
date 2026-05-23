---
name: agenttest
description: Use when creating or running Codex-executed, filesystem-backed agent tests from JSON suites plus proof assets. Supports category-parallel subagents, one-test-at-a-time execution, result submission, status polling, and final report generation without calling an external LLM API.
---

# Agenttest

Use this skill when the user asks for AI-friendly tests, Codex-executed tests,
agent test suites, category-parallel test execution, or a stateful test runner.

## Model

Agenttest is not a unit test framework. It is the default testing policy. It is
a filesystem-backed coordinator:

- JSON suite files define small, binary-pass/fail test items before
  implementation starts.
- Suite-specific proof assets provide fixtures, probes, harnesses, scripts, and
  expected-output files needed to execute those test items.
- `scripts/agenttest.ts` owns validation, state, next-test selection, result
  acceptance, status, and final reports.
- Codex executes only the current test returned by the runner.
- Category-level subagents may run in parallel when categories are independent.
- The runner never calls an LLM API.
- Final judgment is based on strict JSON reports, then a Markdown summary.

## Storage

Use `test`, not `tests`.

Suite files must be stored as:

```text
test/YYYYMMDD/HHMMSS_suite-name.json
```

When a suite needs fixtures, harnesses, shell scripts, expected outputs, or
other files to make its tests executable, store them beside the JSON in a
directory with the same stem:

```text
test/YYYYMMDD/HHMMSS_suite-name/
test/YYYYMMDD/HHMMSS_suite-name/<test-id>_<resource-name>
```

Examples:

```text
test/20260512/014021_ndx-agent-server-context/model-exact-file_probe.ts
test/20260512/014021_ndx-agent-server-context/model-exact-file_expected.txt
```

For each suite, the runner creates sibling artifacts:

```text
test/YYYYMMDD/HHMMSS_run/
test/YYYYMMDD/HHMMSS_report.json
test/YYYYMMDD/HHMMSS_summary.md
```

The `_report.json` file is the authoritative report. It contains `@meta` plus
category-keyed executed test results; it does not repeat the suite, dependency,
or `items` wrapper. The `_summary.md` file is only a human-readable summary
derived from the JSON report.

## Suite Shape

Each suite is JSON:

```json
{
  "id": "suite-id",
  "title": "Suite title",
  "dependencies": { "ndx": "0.1.35" },
  "items": {
    "category": [
      {
        "id": "test-id",
        "title": "Short title",
        "test": "Detailed context and behavior under test.",
        "assets": [
          "test-id_probe.ts",
          "test-id_expected.txt"
        ],
        "steps": [
          {
            "id": "step-id",
            "instruction": "Concrete action to perform.",
            "expected": "Observable pass condition."
          }
        ],
        "passCriteria": "Binary final pass condition."
      }
    ]
  }
}
```

Rules:

- Keep every test narrow. Prefer many small tests over one broad scenario.
- Every step must have an observable expected result.
- Every test must be decidable as success or failure only.
- Every test must identify the real proof path: fixture setup, code or command
  execution, and assertion over the observed output.
- Add an `assets` array when the test requires generated files. Asset paths are
  direct filenames inside the suite asset directory and must start with
  `<test-id>_`.
- Do not write vague checks such as "verify overall behavior".
- Do not use "run the focused unit test by name" as the only proof unless this
  suite also creates or references the exact test source or harness that makes
  the named assertion.
- Include version dependencies that matter for the suite.

## Proof-First Authoring

Write suites from the evidence backward:

1. State the smallest falsifiable behavior in `test`.
2. Choose the witness that would prove it: a unique fixture string, a generated
   file tree, an API response, a CLI output, a browser locator, a database row,
   or another concrete observation.
3. Create any missing proof assets under the suite asset directory.
4. Write steps in arrange, act, assert order. Each step must be runnable by
   Codex without inventing hidden files or commands.
5. Make `expected` describe the exact observation, not the intent.
6. Make `passCriteria` binary and tied to the final observed artifact.

For unit-level tests, a valid plan usually runs a tiny harness that imports the
target function, builds temporary fixtures, invokes the function, and asserts
the returned value. For integration and acceptance tests, a valid plan starts
the real process or service, drives it through its public boundary, and records
logs, HTTP responses, database rows, screenshots, or DOM locators as evidence.

Prefer unique sentinel values over generic strings so false positives are hard.
For example, a model-prompt test should create a temporary
`.ndx/system/modelprompt/abc.md` containing a sentinel such as
`MODEL_EXACT_FILE_SENTINEL_014021`, invoke the real context builder through a
TypeScript probe, and assert that the built context contains that sentinel and
does not contain the fallback prompt.

## Asset Rules

- The suite asset directory is derived from the JSON path. For
  `test/20260512/014021_suite.json`, use `test/20260512/014021_suite/`.
- Test-specific assets must be named `<test-id>_<resource-name>`, for example
  `model-exact-file_probe.ts` or `context-output-shape_run.sh`.
- Keep generated harnesses small and direct. They may use TypeScript, shell, SQL,
  fixtures, expected-output text, or browser scripts when that is the shortest
  honest proof.
- Prefer one self-contained harness per test when tests need different
  fixtures. Use a shared asset only when it is read-only and the step names the
  shared dependency explicitly.
- Steps must reference asset paths relative to the suite asset directory or show
  the full command that uses them.
- Evidence must include the executed command and the concrete observed output,
  file path, response field, locator state, row value, or assertion message.

## Commands

Compile the runner when needed:

```bash
yarn workspace ndx exec tsc ../../.codex/skills/agenttest/scripts/agenttest.ts --target ES2022 --module NodeNext --moduleResolution NodeNext --outDir ../../.codex/skills/agenttest/dist
```

Run the compiled CLI:

```bash
node .codex/skills/agenttest/dist/agenttest.js validate test/YYYYMMDD/HHMMSS_suite-name.json
node .codex/skills/agenttest/dist/agenttest.js start test/YYYYMMDD/HHMMSS_suite-name.json
node .codex/skills/agenttest/dist/agenttest.js next <workerUuid>
node .codex/skills/agenttest/dist/agenttest.js submit <workerUuid> <result.json>
node .codex/skills/agenttest/dist/agenttest.js status <runUuid>
node .codex/skills/agenttest/dist/agenttest.js finalize <runUuid>
```

## Execution Workflow

1. Run `validate <suite.json>` before starting. Validation checks suite shape
   and declared asset existence.
2. Start with `start <suite.json>`.
3. If the response says `spawn-category-workers`, spawn one subagent per worker
   when parallel execution is useful.
4. Give each subagent only its category, worker UUID, run directory, asset
   directory, and the instruction to loop over `next` and `submit`.
5. Each executor must run only the single test returned by `next`.
6. Treat `next.isLastInCategory` and `next.remainingAfterThis` as runner-owned
   progress facts; do not infer category completion from memory.
7. Execute the proof steps exactly enough to produce real evidence. Do not mark
   a step passed from source-code reading alone when the step calls for runtime
   behavior.
8. Write a result JSON with `target`, `steps`, and final `result`.
9. Submit the result before asking for the next test.
10. Use the `submit` response's `categoryComplete`, `runComplete`, and
   `remaining` fields as strict state-machine output.
11. Continue until `next` returns `category-done`.
12. Poll `status` from the main Codex session.
13. Run `finalize` only after every category is done.
14. Read the final report and decide follow-up work from concrete failures.

## Result Shape

```json
{
  "target": {
    "id": "test-id",
    "title": "Short title",
    "test": "Detailed context and behavior under test.",
    "assets": ["test-id_probe.ts"],
    "steps": [
      {
        "id": "step-id",
        "instruction": "Concrete action to perform.",
        "expected": "Observable pass condition."
      }
    ],
    "passCriteria": "Binary final pass condition."
  },
  "steps": [
    {
      "target": {
        "id": "step-id",
        "instruction": "Concrete action to perform.",
        "expected": "Observable pass condition."
      },
      "result": true,
      "descript": "Judgment for the step result.",
      "evidence": [
        "Actual command, file path, observed output, API response, browser locator, or other concrete observation."
      ]
    }
  ],
  "result": {
    "result": true,
    "descript": "Final binary assessment.",
    "evidence": [
      "Concrete observations that justify the final result."
    ]
  }
}
```

Final report shape:

```json
{
  "@meta": {
    "subagents": [
      { "target": "category", "elapsed": 1234 }
    ],
    "elapsed": 2345,
    "result": true,
    "detail": "1 passed / 0 failed",
    "started": "2026-05-06T00:00:00.000Z"
  },
  "category": [
    {
      "id": "test-id",
      "title": "Short title",
      "test": "Detailed context and behavior under test.",
      "steps": [
        {
          "id": "step-id",
          "instruction": "Concrete action to perform.",
          "expected": "Observable pass condition.",
          "result": true,
          "descript": "Judgment for this step.",
          "evidence": ["Concrete observations that justify the step result."]
        }
      ]
    }
  ]
}
```

The runner rejects results for the wrong test, missing steps, duplicate
conflicting submissions, missing evidence, or non-boolean outcomes.
