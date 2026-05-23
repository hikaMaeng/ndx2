#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

interface Suite {
  id: string;
  title: string;
  dependencies: Record<string, string>;
  items: Record<string, Test[]>;
}

interface Test {
  id: string;
  title: string;
  test: string;
  assets?: string[];
  steps: Step[];
  passCriteria: string;
}

interface Step {
  id: string;
  instruction: string;
  expected: string;
}

interface Result {
  target: Test;
  steps: Array<{
    target: Step;
    result: boolean;
    descript: string;
    evidence: string[];
  }>;
  result: {
    result: boolean;
    descript: string;
    evidence: string[];
  };
}

interface ReportStep extends Step {
  result: boolean;
  descript: string;
  evidence: string[];
}

interface ReportTest {
  id: string;
  title: string;
  test: string;
  steps: ReportStep[];
}

interface ReportMeta {
  subagents: Array<{
    target: string;
    elapsed: number;
  }>;
  elapsed: number;
  result: boolean;
  detail: string;
  started: string;
}

type Report = {
  "@meta": ReportMeta;
} & Record<string, ReportMeta | ReportTest[]>;

type CategoryStatus = "pending" | "running" | "done";
type RunStatus = "running" | "done";

interface CategoryState {
  workerUuid: string;
  status: CategoryStatus;
  nextIndex: number;
  resultPath: string;
  startedAt?: string;
  finishedAt?: string;
}

interface RunState {
  runUuid: string;
  suitePath: string;
  suite: Suite;
  runDir: string;
  resultPath: string;
  summaryPath: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  categories: Record<string, CategoryState>;
}

interface WorkerLookup {
  runUuid: string;
  category: string;
}

const args = process.argv.slice(2);

try {
  main();
} catch (error) {
  printJson({
    kind: "error",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

function main(): void {
  const command = args[0];
  if (command === "validate") {
    validateCommand();
    return;
  }
  if (command === "start") {
    startCommand();
    return;
  }
  if (command === "next") {
    nextCommand();
    return;
  }
  if (command === "submit") {
    submitCommand();
    return;
  }
  if (command === "status") {
    statusCommand();
    return;
  }
  if (command === "finalize") {
    finalizeCommand();
    return;
  }
  throw new Error(
    "usage: agenttest <validate|start|next|submit|status|finalize> ...",
  );
}

function validateCommand(): void {
  const suitePath = resolve(requiredArg(1, "suite path"));
  const suite = readSuite(suitePath);
  printJson({
    kind: "suite-valid",
    suitePath,
    assetDir: suiteAssetDir(suitePath),
    suite: { id: suite.id, title: suite.title },
    categories: Object.fromEntries(
      Object.entries(suite.items).map(([category, tests]) => [
        category,
        tests.length,
      ]),
    ),
  });
}

function startCommand(): void {
  const suitePath = resolve(requiredArg(1, "suite path"));
  const suite = readSuite(suitePath);
  const paths = suiteSiblingPaths(suitePath);
  const runUuid = `run-${randomUUID()}`;
  mkdirSync(join(paths.runDir, "workers"), { recursive: true });
  mkdirSync(join(paths.runDir, "categories"), { recursive: true });

  const now = new Date().toISOString();
  const categories: Record<string, CategoryState> = {};
  const workers = Object.keys(suite.items).map((category) => {
    const workerUuid = `worker-${randomUUID()}`;
    const resultPath = join(paths.runDir, "categories", `${category}.json`);
    writeJsonAtomic(resultPath, []);
    writeJsonAtomic(join(paths.runDir, "workers", `${workerUuid}.json`), {
      runUuid,
      category,
    } satisfies WorkerLookup);
    categories[category] = {
      workerUuid,
      status: "pending",
      nextIndex: 0,
      resultPath,
    };
    return { category, workerUuid };
  });

  const state: RunState = {
    runUuid,
    suitePath,
    suite,
    runDir: paths.runDir,
    resultPath: paths.resultPath,
    summaryPath: paths.summaryPath,
    status: "running",
    createdAt: now,
    updatedAt: now,
    categories,
  };
  writeRunState(state);
  writeLatest(suitePath, runUuid, paths.runDir);
  printJson({
    kind: "spawn-category-workers",
    runUuid,
    runDir: paths.runDir,
    assetDir: paths.assetDir,
    resultPath: paths.resultPath,
    summaryPath: paths.summaryPath,
    workers,
  });
}

function nextCommand(): void {
  const workerUuid = requiredArg(1, "worker UUID");
  const { state, categoryName } = loadByWorker(workerUuid);
  const category = state.categories[categoryName];
  if (category === undefined) {
    throw new Error(`worker category is missing: ${categoryName}`);
  }
  const tests = state.suite.items[categoryName] ?? [];
  const index = category.nextIndex;
  if (category.nextIndex >= tests.length) {
    markCategoryDone(state, categoryName);
    printJson({
      kind: "category-done",
      runUuid: state.runUuid,
      workerUuid,
      category: categoryName,
    });
    return;
  }
  if (category.status === "pending") {
    category.status = "running";
    category.startedAt = new Date().toISOString();
    state.updatedAt = category.startedAt;
    writeRunState(state);
  }
  printJson({
    kind: "next-test",
    runUuid: state.runUuid,
    workerUuid,
    category: categoryName,
    index,
    total: tests.length,
    isLastInCategory: index === tests.length - 1,
    remainingAfterThis: tests.length - index - 1,
    dependencies: state.suite.dependencies,
    assetDir: suiteAssetDir(state.suitePath),
    test: tests[index],
  });
}

function submitCommand(): void {
  const workerUuid = requiredArg(1, "worker UUID");
  const resultPath = resolve(requiredArg(2, "result JSON path"));
  const submitted = parseResult(readJson(resultPath), "submitted result");
  const { state, categoryName } = loadByWorker(workerUuid);
  const category = state.categories[categoryName];
  if (category === undefined) {
    throw new Error(`worker category is missing: ${categoryName}`);
  }
  const target = state.suite.items[categoryName]?.[category.nextIndex];
  if (target === undefined) {
    throw new Error(`category already complete: ${categoryName}`);
  }
  validateResult(target, submitted);
  const existing = parseResults(readJson(category.resultPath), categoryName);
  if (existing.some((result) => result.target.id === submitted.target.id)) {
    throw new Error(`duplicate result for test: ${submitted.target.id}`);
  }
  existing.push(submitted);
  writeJsonAtomic(category.resultPath, existing);
  category.nextIndex += 1;
  const now = new Date().toISOString();
  if (category.nextIndex >= (state.suite.items[categoryName]?.length ?? 0)) {
    category.status = "done";
    category.finishedAt = now;
  }
  state.status = allCategoriesDone(state) ? "done" : "running";
  state.updatedAt = now;
  writeRunState(state);
  printJson({
    kind: "submit-accepted",
    runUuid: state.runUuid,
    workerUuid,
    category: categoryName,
    nextIndex: category.nextIndex,
    total: state.suite.items[categoryName]?.length ?? 0,
    remaining: Math.max(
      0,
      (state.suite.items[categoryName]?.length ?? 0) - category.nextIndex,
    ),
    categoryComplete: category.status === "done",
    runComplete: state.status === "done",
    categoryStatus: category.status,
    runStatus: state.status,
  });
}

function statusCommand(): void {
  const runUuid = requiredArg(1, "run UUID");
  const state = readRunState(resolveRunDir(runUuid));
  const categories = Object.entries(state.categories).map(
    ([category, categoryState]) => ({
      category,
      workerUuid: categoryState.workerUuid,
      status: categoryState.status,
      done: categoryState.nextIndex,
      total: state.suite.items[category]?.length ?? 0,
    }),
  );
  printJson({
    kind: "run-status",
    runUuid,
    status: state.status,
    resultPath: state.resultPath,
    summaryPath: state.summaryPath,
    categories,
    summary: {
      totalCategories: categories.length,
      doneCategories: categories.filter((item) => item.status === "done")
        .length,
      runningCategories: categories.filter((item) => item.status === "running")
        .length,
      pendingCategories: categories.filter((item) => item.status === "pending")
        .length,
    },
  });
}

function finalizeCommand(): void {
  const runUuid = requiredArg(1, "run UUID");
  const state = readRunState(resolveRunDir(runUuid));
  if (!allCategoriesDone(state)) {
    throw new Error(`run is not complete: ${runUuid}`);
  }
  const result: Record<string, Result[]> = {};
  for (const [category, categoryState] of Object.entries(state.categories)) {
    result[category] = parseResults(readJson(categoryState.resultPath), category);
  }
  const report = renderReport(state, result);
  writeJsonAtomic(state.resultPath, report);
  writeFileAtomic(state.summaryPath, renderSummary(state, report));
  printJson({
    kind: "final-report",
    runUuid,
    resultPath: state.resultPath,
    summaryPath: state.summaryPath,
    failed: Object.values(result)
      .flat()
      .filter((item) => item.result.result === false).length,
  });
}

function renderReport(state: RunState, results: Record<string, Result[]>): Report {
  const startedAt = Date.parse(state.createdAt);
  const finishedAt = Date.now();
  const categoryResults = Object.values(results).flat();
  const passed = categoryResults.filter((item) =>
    item.steps.every((step) => step.result),
  ).length;
  const failed = categoryResults.length - passed;
  const report: Report = {
    "@meta": {
      subagents: Object.entries(state.categories).map(([category, categoryState]) => ({
        target: category,
        elapsed: elapsedMs(categoryState.startedAt, categoryState.finishedAt),
      })),
      elapsed: Number.isNaN(startedAt) ? 0 : Math.max(0, finishedAt - startedAt),
      result: failed === 0,
      detail: `${passed} passed / ${failed} failed`,
      started: state.createdAt,
    },
  };
  for (const [category, categoryResults] of Object.entries(results)) {
    report[category] = categoryResults.map((item) => ({
      id: item.target.id,
      title: item.target.title,
      test: item.target.test,
      steps: item.target.steps.map((step) => {
        const stepResult = item.steps.find((result) => result.target.id === step.id);
        if (stepResult === undefined) {
          throw new Error(`missing step result while rendering: ${item.target.id}:${step.id}`);
        }
        return {
          id: step.id,
          instruction: step.instruction,
          expected: step.expected,
          result: stepResult.result,
          descript: stepResult.descript,
          evidence: stepResult.evidence,
        };
      }),
    }));
  }
  return report;
}

function elapsedMs(startedAt: string | undefined, finishedAt: string | undefined): number {
  if (startedAt === undefined) {
    return 0;
  }
  const start = Date.parse(startedAt);
  const finish = finishedAt === undefined ? Date.now() : Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(finish)) {
    return 0;
  }
  return Math.max(0, finish - start);
}

function readSuite(path: string): Suite {
  validateSuitePath(path);
  const suite = parseSuite(readJson(path));
  validateSuite(suite, path);
  return suite;
}

function validateSuitePath(path: string): void {
  const normalized = path.replaceAll("\\", "/");
  if (!/\/test\/\d{8}\/\d{6}_[a-z0-9._-]+\.json$/i.test(normalized)) {
    throw new Error(
      "suite path must be test/YYYYMMDD/HHMMSS_suite-name.json",
    );
  }
  if (normalized.endsWith(".result.json")) {
    throw new Error("suite path must not be a result file");
  }
}

function suiteSiblingPaths(suitePath: string): {
  runDir: string;
  assetDir: string;
  resultPath: string;
  summaryPath: string;
} {
  const dir = dirname(suitePath);
  const file = basename(suitePath);
  const match = file.match(/^(\d{6})_[a-z0-9._-]+\.json$/i);
  if (match === null) {
    throw new Error(
      "suite filename must be HHMMSS_suite-name.json inside test/YYYYMMDD",
    );
  }
  const prefix = match[1];
  return {
    runDir: join(dir, `${prefix}_run`),
    assetDir: suiteAssetDir(suitePath),
    resultPath: join(dir, `${prefix}_report.json`),
    summaryPath: join(dir, `${prefix}_summary.md`),
  };
}

function suiteAssetDir(suitePath: string): string {
  return join(dirname(suitePath), basename(suitePath, ".json"));
}

function parseSuite(value: unknown): Suite {
  const object = asObject(value, "suite");
  return {
    id: requiredString(object, "id"),
    title: requiredString(object, "title"),
    dependencies: parseStringMap(object.dependencies, "dependencies"),
    items: parseItems(object.items),
  };
}

function parseItems(value: unknown): Record<string, Test[]> {
  const object = asObject(value, "items");
  const items: Record<string, Test[]> = {};
  for (const [category, rawTests] of Object.entries(object)) {
    if (!Array.isArray(rawTests)) {
      throw new Error(`items.${category} must be an array`);
    }
    items[category] = rawTests.map((test, index) =>
      parseTest(test, `items.${category}[${index}]`),
    );
  }
  return items;
}

function parseTest(value: unknown, label: string): Test {
  const object = asObject(value, label);
  const parsed: Test = {
    id: requiredString(object, "id"),
    title: requiredString(object, "title"),
    test: requiredString(object, "test"),
    assets: parseOptionalAssets(object.assets, `${label}.assets`),
    steps: parseSteps(object.steps, `${label}.steps`),
    passCriteria: requiredString(object, "passCriteria"),
  };
  if (parsed.assets === undefined) {
    delete parsed.assets;
  }
  return parsed;
}

function parseOptionalAssets(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  const seen = new Set<string>();
  return value.map((asset, index) => {
    if (typeof asset !== "string" || asset.trim() === "") {
      throw new Error(`${label}[${index}] must be a non-empty string`);
    }
    if (seen.has(asset)) {
      throw new Error(`${label}[${index}] is duplicated: ${asset}`);
    }
    seen.add(asset);
    return asset;
  });
}

function parseSteps(value: unknown, label: string): Step[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value.map((step, index) => {
    const object = asObject(step, `${label}[${index}]`);
    return {
      id: requiredString(object, "id"),
      instruction: requiredString(object, "instruction"),
      expected: requiredString(object, "expected"),
    };
  });
}

function validateSuite(suite: Suite, suitePath: string): void {
  if (Object.keys(suite.items).length === 0) {
    throw new Error("suite must contain at least one category");
  }
  const testIds = new Set<string>();
  const assetDir = suiteAssetDir(suitePath);
  for (const [category, tests] of Object.entries(suite.items)) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(category)) {
      throw new Error(`invalid category id: ${category}`);
    }
    if (tests.length === 0) {
      throw new Error(`category has no tests: ${category}`);
    }
    for (const test of tests) {
      if (testIds.has(test.id)) {
        throw new Error(`duplicate test id: ${test.id}`);
      }
      testIds.add(test.id);
      if (test.steps.length === 0) {
        throw new Error(`test has no steps: ${test.id}`);
      }
      if (tooVague(test.test) || tooVague(test.passCriteria)) {
        throw new Error(`test is too vague: ${test.id}`);
      }
      validateTestAssets(test, assetDir);
      const stepIds = new Set<string>();
      for (const step of test.steps) {
        if (stepIds.has(step.id)) {
          throw new Error(`duplicate step id: ${test.id}:${step.id}`);
        }
        stepIds.add(step.id);
        if (tooVague(step.instruction) || tooVague(step.expected)) {
          throw new Error(`step is too vague: ${test.id}:${step.id}`);
        }
      }
    }
  }
}

function validateTestAssets(test: Test, assetDir: string): void {
  for (const asset of test.assets ?? []) {
    if (basename(asset) !== asset || asset.includes("\\") || asset.includes("..")) {
      throw new Error(`test asset must be a direct file name: ${test.id}:${asset}`);
    }
    if (!asset.startsWith(`${test.id}_`)) {
      throw new Error(`test asset must start with "${test.id}_": ${asset}`);
    }
    if (!existsSync(join(assetDir, asset))) {
      throw new Error(`test asset file is missing: ${join(assetDir, asset)}`);
    }
  }
}

function tooVague(value: string): boolean {
  const lowered = value.toLowerCase();
  return [
    "overall",
    "generally",
    "as appropriate",
    "정상 동작",
    "전체적으로",
    "적절히",
    "포괄",
  ].some((word) => lowered.includes(word));
}

function parseResults(value: unknown, label: string): Result[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} result file must be an array`);
  }
  return value.map((item, index) => parseResult(item, `${label}[${index}]`));
}

function parseResult(value: unknown, label: string): Result {
  const object = asObject(value, label);
  const final = asObject(object.result, `${label}.result`);
  const target = parseTest(object.target, `${label}.target`);
  const rawSteps = object.steps;
  if (!Array.isArray(rawSteps)) {
    throw new Error(`${label}.steps must be an array`);
  }
  return {
    target,
    steps: rawSteps.map((step, index) => {
      const stepObject = asObject(step, `${label}.steps[${index}]`);
      return {
        target: parseStep(stepObject.target, `${label}.steps[${index}].target`),
        result: requiredBoolean(stepObject, "result"),
        descript: requiredString(stepObject, "descript"),
        evidence: requiredStringArray(stepObject, "evidence"),
      };
    }),
    result: {
      result: requiredBoolean(final, "result"),
      descript: requiredString(final, "descript"),
      evidence: requiredStringArray(final, "evidence"),
    },
  };
}

function parseStep(value: unknown, label: string): Step {
  const object = asObject(value, label);
  return {
    id: requiredString(object, "id"),
    instruction: requiredString(object, "instruction"),
    expected: requiredString(object, "expected"),
  };
}

function validateResult(test: Test, result: Result): void {
  if (result.target.id !== test.id) {
    throw new Error(`expected result for ${test.id}, got ${result.target.id}`);
  }
  if (JSON.stringify(result.target) !== JSON.stringify(test)) {
    throw new Error(`result target does not exactly match test: ${test.id}`);
  }
  if (result.steps.length !== test.steps.length) {
    throw new Error(`step result count mismatch: ${test.id}`);
  }
  for (const step of test.steps) {
    const stepResult = result.steps.find((item) => item.target.id === step.id);
    if (stepResult === undefined) {
      throw new Error(`missing step result: ${test.id}:${step.id}`);
    }
    if (JSON.stringify(stepResult.target) !== JSON.stringify(step)) {
      throw new Error(`step target does not exactly match: ${test.id}:${step.id}`);
    }
    if (stepResult.descript.trim().length < 12) {
      throw new Error(`step description too short: ${test.id}:${step.id}`);
    }
    if (stepResult.evidence.length === 0) {
      throw new Error(`step evidence is empty: ${test.id}:${step.id}`);
    }
  }
  if (result.result.descript.trim().length < 12) {
    throw new Error(`final result description too short: ${test.id}`);
  }
  if (result.result.evidence.length === 0) {
    throw new Error(`final result evidence is empty: ${test.id}`);
  }
}

function markCategoryDone(state: RunState, categoryName: string): void {
  const category = state.categories[categoryName];
  if (category === undefined || category.status === "done") {
    return;
  }
  category.status = "done";
  category.finishedAt = new Date().toISOString();
  state.status = allCategoriesDone(state) ? "done" : "running";
  state.updatedAt = category.finishedAt;
  writeRunState(state);
}

function allCategoriesDone(state: RunState): boolean {
  return Object.values(state.categories).every(
    (category) => category.status === "done",
  );
}

function loadByWorker(workerUuid: string): {
  state: RunState;
  categoryName: string;
} {
  const runUuid = optionValue("--run") ?? latestRunUuid();
  const runDir = resolveRunDir(runUuid);
  const lookup = parseWorkerLookup(
    readJson(join(runDir, "workers", `${workerUuid}.json`)),
  );
  return {
    state: readRunState(runDir),
    categoryName: lookup.category,
  };
}

function latestRunUuid(): string {
  const testRoot = resolve(optionValue("--test-root") ?? "test");
  const latestPath = join(testRoot, "latest.json");
  if (!existsSync(latestPath)) {
    throw new Error("latest run is not available; pass --run <runUuid>");
  }
  return requiredString(asObject(readJson(latestPath), "latest"), "runUuid");
}

function resolveRunDir(runUuid: string): string {
  const explicit = optionValue("--run-dir");
  if (explicit !== undefined) {
    return resolve(explicit);
  }
  const testRoot = resolve(optionValue("--test-root") ?? "test");
  const latestPath = join(testRoot, "latest.json");
  if (existsSync(latestPath)) {
    const latest = asObject(readJson(latestPath), "latest");
    if (latest.runUuid === runUuid) {
      return requiredString(latest, "runDir");
    }
  }
  for (const dateDir of readdirSync(testRoot, { withFileTypes: true })) {
    if (!dateDir.isDirectory() || !/^\d{8}$/.test(dateDir.name)) {
      continue;
    }
    const base = join(testRoot, dateDir.name);
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith("_run")) {
        continue;
      }
      const runDir = join(base, entry.name);
      const statePath = join(runDir, "run.json");
      if (!existsSync(statePath)) {
        continue;
      }
      const state = asObject(readJson(statePath), "run state");
      if (state.runUuid === runUuid) {
        return runDir;
      }
    }
  }
  throw new Error(`run not found: ${runUuid}`);
}

function parseWorkerLookup(value: unknown): WorkerLookup {
  const object = asObject(value, "worker lookup");
  return {
    runUuid: requiredString(object, "runUuid"),
    category: requiredString(object, "category"),
  };
}

function readRunState(runDir: string): RunState {
  const object = asObject(readJson(join(runDir, "run.json")), "run state");
  return {
    runUuid: requiredString(object, "runUuid"),
    suitePath: requiredString(object, "suitePath"),
    suite: parseSuite(object.suite),
    runDir: requiredString(object, "runDir"),
    resultPath: requiredString(object, "resultPath"),
    summaryPath: requiredString(object, "summaryPath"),
    status: parseRunStatus(object.status),
    createdAt: requiredString(object, "createdAt"),
    updatedAt: requiredString(object, "updatedAt"),
    categories: parseCategories(object.categories),
  };
}

function parseCategories(value: unknown): Record<string, CategoryState> {
  const object = asObject(value, "categories");
  const categories: Record<string, CategoryState> = {};
  for (const [category, raw] of Object.entries(object)) {
    const item = asObject(raw, `categories.${category}`);
    categories[category] = {
      workerUuid: requiredString(item, "workerUuid"),
      status: parseCategoryStatus(item.status),
      nextIndex: requiredNumber(item, "nextIndex"),
      resultPath: requiredString(item, "resultPath"),
      startedAt: optionalString(item.startedAt),
      finishedAt: optionalString(item.finishedAt),
    };
  }
  return categories;
}

function writeRunState(state: RunState): void {
  writeJsonAtomic(join(state.runDir, "run.json"), state);
}

function writeLatest(suitePath: string, runUuid: string, runDir: string): void {
  const testIndex = suitePath.replaceAll("\\", "/").lastIndexOf("/test/");
  const testRoot =
    testIndex === -1 ? resolve("test") : suitePath.slice(0, testIndex + 5);
  writeJsonAtomic(join(testRoot, "latest.json"), {
    runUuid,
    runDir,
    suitePath,
  });
}

function renderSummary(state: RunState, report: Report): string {
  const lines = [
    `# ${state.suite.title}`,
    "",
    `- suite: ${state.suite.id}`,
    `- runned: ${new Date().toISOString()}`,
    `- dependencies: ${Object.entries(state.suite.dependencies)
      .map(([name, version]) => `${name} ${version}`)
      .join(", ")}`,
    "",
    "## Results",
    "",
  ];
  for (const [category, results] of Object.entries(report)) {
    if (category === "@meta") {
      continue;
    }
    if (!Array.isArray(results)) {
      continue;
    }
    lines.push(`### ${category}`, "");
    for (const result of results) {
      const passed = result.steps.every((step) => step.result);
      lines.push(
        `- ${passed ? "PASS" : "FAIL"} ${result.id}: ${result.title}`,
      );
      for (const step of result.steps) {
        lines.push(`  - ${step.result ? "PASS" : "FAIL"} ${step.id}: ${step.descript}`);
        for (const evidence of step.evidence) {
          lines.push(`    - evidence: ${evidence}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path: string, value: unknown): void {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFileAtomic(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(tmp, value);
  renameSync(tmp, path);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function optionValue(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`missing value for ${name}`);
  }
  return value;
}

function requiredArg(index: number, label: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`missing ${label}`);
  }
  return value;
}

function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function requiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredNumber(object: JsonObject, key: string): number {
  const value = object[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return value;
}

function requiredBoolean(object: JsonObject, key: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function requiredStringArray(object: JsonObject, key: string): string[] {
  const value = object[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be a string array`);
  }
  const strings = value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${key}[${index}] must be a non-empty string`);
    }
    return item;
  });
  if (strings.length === 0) {
    throw new Error(`${key} must not be empty`);
  }
  return strings;
}

function parseStringMap(value: unknown, label: string): Record<string, string> {
  const object = asObject(value, label);
  const parsed: Record<string, string> = {};
  for (const [key, raw] of Object.entries(object)) {
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error(`${label}.${key} must be a non-empty string`);
    }
    parsed[key] = raw;
  }
  return parsed;
}

function parseCategoryStatus(value: unknown): CategoryStatus {
  if (value === "pending" || value === "running" || value === "done") {
    return value;
  }
  throw new Error(`invalid category status: ${String(value)}`);
}

function parseRunStatus(value: unknown): RunStatus {
  if (value === "running" || value === "done") {
    return value;
  }
  throw new Error(`invalid run status: ${String(value)}`);
}
