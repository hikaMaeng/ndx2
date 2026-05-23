import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { initServer } from "../../packages/ndx/src/agent/server/init/index.js";
import { buildContext, resolveModelInstruction } from "../../packages/ndx/src/agent/server/context/index.js";

type ProbeResult = {
  caseId: string;
  result: true;
  fixture: Record<string, string>;
  observed: Record<string, unknown>;
};

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const sampleBase = path.join(repoRoot, "test", "sampleproject");

async function resetCase(caseId: string): Promise<{
  caseRoot: string;
  userHome: string;
  projectHome: string;
}> {
  const caseRoot = path.join(sampleBase, caseId);
  await fs.rm(caseRoot, { recursive: true, force: true });
  const userHome = path.join(caseRoot, "home");
  const projectHome = path.join(caseRoot, "project");
  await fs.mkdir(userHome, { recursive: true });
  await fs.mkdir(projectHome, { recursive: true });
  return { caseRoot, userHome, projectHome };
}

async function writeText(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

function modelInstructionBody(developer: string): string {
  const match = developer.match(/<model_instruction>\n([\s\S]*?)\n<\/model_instruction>/);
  assert.ok(match, "developer context must contain model_instruction");
  return match[1];
}

function orderedIndexes(text: string, needles: string[]): number[] {
  return needles.map((needle) => {
    const index = text.indexOf(needle);
    assert.notEqual(index, -1, `missing text: ${needle}`);
    return index;
  });
}

async function modelExactFile(): Promise<ProbeResult> {
  const caseId = "model-exact-file";
  const { userHome, projectHome } = await resetCase(caseId);
  const promptPath = path.join(userHome, ".ndx", "system", "modelprompt", "abc.md");
  await writeText(promptPath, "MODEL_EXACT_ABC_PROMPT\n");

  const metadata = { model: "abc", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const resolved = await resolveModelInstruction("abc", userHome);
  const body = modelInstructionBody(context.developer);

  assert.equal(resolved, "MODEL_EXACT_ABC_PROMPT\n");
  assert.equal(body, "MODEL_EXACT_ABC_PROMPT");

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, promptPath },
    observed: {
      sessionMetadata: metadata,
      resolvedPrompt: resolved,
      developerModelInstruction: body,
    },
  };
}

async function modelColonFallback(): Promise<ProbeResult> {
  const caseId = "model-colon-fallback";
  const { userHome, projectHome } = await resetCase(caseId);
  const promptPath = path.join(userHome, ".ndx", "system", "modelprompt", "abc.md");
  await writeText(promptPath, "MODEL_COLON_BASE_PROMPT\n");

  const metadata = { model: "abc:provider:local", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const resolved = await resolveModelInstruction(metadata.model, userHome);
  const body = modelInstructionBody(context.developer);

  assert.equal(resolved, "MODEL_COLON_BASE_PROMPT\n");
  assert.equal(body, "MODEL_COLON_BASE_PROMPT");

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, promptPath },
    observed: {
      sessionMetadata: metadata,
      resolvedPrompt: resolved,
      developerModelInstruction: body,
    },
  };
}

async function modelDefaultFile(): Promise<ProbeResult> {
  const caseId = "model-default-file";
  const { userHome, projectHome } = await resetCase(caseId);
  const promptPath = path.join(userHome, ".ndx", "system", "modelprompt", "default.md");
  await writeText(promptPath, "MODEL_DEFAULT_PROMPT\n");

  const metadata = { model: "missing-model", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const resolved = await resolveModelInstruction(metadata.model, userHome);
  const body = modelInstructionBody(context.developer);

  assert.equal(resolved, "MODEL_DEFAULT_PROMPT\n");
  assert.equal(body, "MODEL_DEFAULT_PROMPT");

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, promptPath },
    observed: {
      sessionMetadata: metadata,
      resolvedPrompt: resolved,
      developerModelInstruction: body,
    },
  };
}

async function modelBundledDefault(): Promise<ProbeResult> {
  const caseId = "model-bundled-default";
  const { userHome, projectHome } = await resetCase(caseId);

  const metadata = { model: "missing-model", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const resolved = await resolveModelInstruction(metadata.model, userHome);
  const body = modelInstructionBody(context.developer);

  assert.match(resolved, /You are NDX/);
  assert.match(body, /You are NDX/);

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome },
    observed: {
      sessionMetadata: metadata,
      resolvedPromptStart: resolved.slice(0, 120),
      developerModelInstructionStart: body.slice(0, 120),
    },
  };
}

async function initDefaultContext(): Promise<ProbeResult> {
  const caseId = "initndx-default-context";
  const { userHome, projectHome } = await resetCase(caseId);
  await initServer({ userHome, projectHome });
  const promptPath = path.join(userHome, ".ndx", "system", "modelprompt", "default.md");
  const seededPrompt = await fs.readFile(promptPath, "utf8");

  const metadata = { model: "unknown-after-init", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const body = modelInstructionBody(context.developer);

  assert.match(seededPrompt, /You are NDX/);
  assert.equal(body, seededPrompt.trim());

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, promptPath },
    observed: {
      sessionMetadata: metadata,
      seededPromptStart: seededPrompt.slice(0, 120),
      developerModelInstructionStart: body.slice(0, 120),
      exactTrimmedMatch: body === seededPrompt.trim(),
    },
  };
}

async function initModelSpecificContext(): Promise<ProbeResult> {
  const caseId = "initndx-model-specific-context";
  const { userHome, projectHome } = await resetCase(caseId);
  await initServer({ userHome, projectHome });
  const promptPath = path.join(userHome, ".ndx", "system", "modelprompt", "abc.md");
  await writeText(promptPath, "MODEL_SPECIFIC_AFTER_INIT\n");

  const metadata = { model: "abc", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const body = modelInstructionBody(context.developer);

  assert.equal(body, "MODEL_SPECIFIC_AFTER_INIT");
  assert.doesNotMatch(context.developer, /You are NDX/);

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, promptPath },
    observed: {
      sessionMetadata: metadata,
      developerModelInstruction: body,
      containsBundledDefaultIdentity: context.developer.includes("You are NDX"),
    },
  };
}

async function modelSlashSanitized(): Promise<ProbeResult> {
  const caseId = "model-slash-sanitized";
  const { userHome, projectHome } = await resetCase(caseId);
  const promptPath = path.join(userHome, ".ndx", "system", "modelprompt", "local_abc.md");
  await writeText(promptPath, "MODEL_SLASH_SANITIZED_PROMPT\n");

  const metadata = { model: "local/abc", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const resolved = await resolveModelInstruction(metadata.model, userHome);
  const body = modelInstructionBody(context.developer);

  assert.equal(resolved, "MODEL_SLASH_SANITIZED_PROMPT\n");
  assert.equal(body, "MODEL_SLASH_SANITIZED_PROMPT");

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, promptPath },
    observed: {
      sessionMetadata: metadata,
      resolvedPrompt: resolved,
      developerModelInstruction: body,
    },
  };
}

async function homeAndProjectAgents(): Promise<ProbeResult> {
  const caseId = "home-and-project-agents";
  const { userHome, projectHome } = await resetCase(caseId);
  const homeAgentsPath = path.join(userHome, ".ndx", "AGENTS.md");
  const projectAgentsPath = path.join(projectHome, "AGENTS.md");
  await writeText(homeAgentsPath, "HOME_AGENT_POLICY");
  await writeText(projectAgentsPath, "PROJECT_ROOT_POLICY");

  const metadata = { model: "missing", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const indexes = orderedIndexes(context.user, ["HOME_AGENT_POLICY", "PROJECT_ROOT_POLICY"]);

  assert.ok(indexes[1] > indexes[0]);

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, homeAgentsPath, projectAgentsPath },
    observed: {
      sessionMetadata: metadata,
      orderedPolicies: ["HOME_AGENT_POLICY", "PROJECT_ROOT_POLICY"],
      indexes,
      renderedHeaders: [homeAgentsPath, projectAgentsPath].map((source) =>
        context.user.includes(`# AGENTS.md instructions for ${source}`),
      ),
    },
  };
}

async function projectToCwdCascade(): Promise<ProbeResult> {
  const caseId = "project-to-cwd-cascade";
  const { userHome, projectHome } = await resetCase(caseId);
  const appDirectory = path.join(projectHome, "apps");
  const agentDirectory = path.join(appDirectory, "agent");
  const cwd = path.join(agentDirectory, "src");
  await fs.mkdir(cwd, { recursive: true });

  const homeAgentsPath = path.join(userHome, ".ndx", "AGENTS.md");
  const rootAgentsPath = path.join(projectHome, "AGENTS.md");
  const appsAgentsPath = path.join(appDirectory, "AGENTS.md");
  const agentAgentsPath = path.join(agentDirectory, "AGENTS.md");
  await writeText(homeAgentsPath, "HOME_POLICY");
  await writeText(rootAgentsPath, "ROOT_POLICY");
  await writeText(appsAgentsPath, "APPS_POLICY");
  await writeText(agentAgentsPath, "AGENT_POLICY");

  const metadata = { model: "missing", cwd, userHome, projectHome };
  const context = await buildContext(metadata);
  const orderedPolicies = ["HOME_POLICY", "ROOT_POLICY", "APPS_POLICY", "AGENT_POLICY"];
  const indexes = orderedIndexes(context.user, orderedPolicies);
  const missingCwdAgentsPath = path.join(cwd, "AGENTS.md");

  assert.deepEqual([...indexes].sort((a, b) => a - b), indexes);
  assert.equal(context.user.includes(missingCwdAgentsPath), false);

  return {
    caseId,
    result: true,
    fixture: {
      userHome,
      projectHome,
      cwd,
      homeAgentsPath,
      rootAgentsPath,
      appsAgentsPath,
      agentAgentsPath,
      missingCwdAgentsPath,
    },
    observed: {
      sessionMetadata: metadata,
      orderedPolicies,
      indexes,
      renderedHeaders: [homeAgentsPath, rootAgentsPath, appsAgentsPath, agentAgentsPath].map((source) =>
        context.user.includes(`# AGENTS.md instructions for ${source}`),
      ),
      missingCwdAgentsRendered: context.user.includes(missingCwdAgentsPath),
    },
  };
}

async function projectCwdNoDuplicate(): Promise<ProbeResult> {
  const caseId = "project-cwd-no-duplicate";
  const { userHome, projectHome } = await resetCase(caseId);
  const projectAgentsPath = path.join(projectHome, "AGENTS.md");
  await writeText(path.join(userHome, ".ndx", "AGENTS.md"), "HOME_POLICY");
  await writeText(projectAgentsPath, "PROJECT_DUP_CHECK_POLICY");

  const metadata = { model: "missing", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);
  const occurrences = context.user.match(/PROJECT_DUP_CHECK_POLICY/g)?.length ?? 0;

  assert.equal(occurrences, 1);

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, projectAgentsPath },
    observed: {
      sessionMetadata: metadata,
      projectPolicyOccurrences: occurrences,
    },
  };
}

async function outsideCwdAgentsIgnored(): Promise<ProbeResult> {
  const caseId = "outside-cwd-agents-ignored";
  const { caseRoot, userHome, projectHome } = await resetCase(caseId);
  const outsideCwd = path.join(caseRoot, "outside");
  await fs.mkdir(outsideCwd, { recursive: true });
  const outsideAgentsPath = path.join(outsideCwd, "AGENTS.md");
  await writeText(path.join(userHome, ".ndx", "AGENTS.md"), "HOME_POLICY");
  await writeText(path.join(projectHome, "AGENTS.md"), "PROJECT_POLICY");
  await writeText(outsideAgentsPath, "OUTSIDE_POLICY_SHOULD_NOT_RENDER");

  const metadata = { model: "missing", cwd: outsideCwd, userHome, projectHome };
  const context = await buildContext(metadata);

  assert.match(context.user, /HOME_POLICY/);
  assert.match(context.user, /PROJECT_POLICY/);
  assert.doesNotMatch(context.user, /OUTSIDE_POLICY_SHOULD_NOT_RENDER/);
  assert.match(context.user, new RegExp(`<cwd>${outsideCwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</cwd>`));

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, outsideCwd, outsideAgentsPath },
    observed: {
      sessionMetadata: metadata,
      containsHomePolicy: context.user.includes("HOME_POLICY"),
      containsProjectPolicy: context.user.includes("PROJECT_POLICY"),
      containsOutsidePolicy: context.user.includes("OUTSIDE_POLICY_SHOULD_NOT_RENDER"),
      environmentContextCwd: `<cwd>${outsideCwd}</cwd>`,
    },
  };
}

async function developerSystemPrompt(): Promise<ProbeResult> {
  const caseId = "developer-system-prompt";
  const { userHome, projectHome } = await resetCase(caseId);
  const systemPromptPath = path.join(userHome, ".ndx", "system-promt.md");
  await writeText(systemPromptPath, "SYSTEM_PROMPT_FOR_DEVELOPER_CONTEXT");

  const metadata = { model: "missing", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);

  assert.match(
    context.developer,
    /<developer_instructions>\nSYSTEM_PROMPT_FOR_DEVELOPER_CONTEXT\n<\/developer_instructions>/,
  );

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, systemPromptPath },
    observed: {
      sessionMetadata: metadata,
      developerInstructionsRendered: context.developer.includes(
        "<developer_instructions>\nSYSTEM_PROMPT_FOR_DEVELOPER_CONTEXT\n</developer_instructions>",
      ),
    },
  };
}

async function developerSystemPromptAbsent(): Promise<ProbeResult> {
  const caseId = "developer-system-prompt-absent";
  const { userHome, projectHome } = await resetCase(caseId);

  const metadata = { model: "missing", cwd: projectHome, userHome, projectHome };
  const context = await buildContext(metadata);

  assert.equal(context.developer.includes("<developer_instructions>"), false);
  assert.match(context.developer, /<model_instruction>/);

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, absentSystemPromptPath: path.join(userHome, ".ndx", "system-promt.md") },
    observed: {
      sessionMetadata: metadata,
      developerInstructionsRendered: context.developer.includes("<developer_instructions>"),
      modelInstructionRendered: context.developer.includes("<model_instruction>"),
    },
  };
}

async function contextOutputShape(): Promise<ProbeResult> {
  const caseId = "context-output-shape";
  const { userHome, projectHome } = await resetCase(caseId);
  const cwd = path.join(projectHome, "workspace");
  await fs.mkdir(cwd, { recursive: true });

  const metadata = {
    model: "missing",
    cwd,
    userHome,
    projectHome,
    currentDate: "2026-05-12",
    timezone: "Asia/Seoul",
  };
  const context = await buildContext(metadata);
  const expectedEnvironmentContext = [
    "<environment_context>",
    `  <cwd>${cwd}</cwd>`,
    "  <shell>bash</shell>",
    "  <current_date>2026-05-12</current_date>",
    "  <timezone>Asia/Seoul</timezone>",
    "</environment_context>",
  ].join("\n");

  assert.equal(typeof context.developer, "string");
  assert.equal(typeof context.user, "string");
  assert.match(context.developer, /^<model_instruction>/);
  assert.match(context.user, new RegExp(expectedEnvironmentContext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  return {
    caseId,
    result: true,
    fixture: { userHome, projectHome, cwd },
    observed: {
      sessionMetadata: metadata,
      developerType: typeof context.developer,
      userType: typeof context.user,
      expectedEnvironmentContext,
      actualEnvironmentContext: context.user.slice(context.user.indexOf("<environment_context>")),
    },
  };
}

const probes: Record<string, () => Promise<ProbeResult>> = {
  "model-exact-file": modelExactFile,
  "model-colon-fallback": modelColonFallback,
  "model-default-file": modelDefaultFile,
  "model-bundled-default": modelBundledDefault,
  "initndx-default-context": initDefaultContext,
  "initndx-model-specific-context": initModelSpecificContext,
  "model-slash-sanitized": modelSlashSanitized,
  "home-and-project-agents": homeAndProjectAgents,
  "project-to-cwd-cascade": projectToCwdCascade,
  "project-cwd-no-duplicate": projectCwdNoDuplicate,
  "outside-cwd-agents-ignored": outsideCwdAgentsIgnored,
  "developer-system-prompt": developerSystemPrompt,
  "developer-system-prompt-absent": developerSystemPromptAbsent,
  "context-output-shape": contextOutputShape,
};

const caseId = process.argv[2];
if (!caseId || !probes[caseId]) {
  throw new Error(`usage: tsx test/20260512/context-probe.ts <${Object.keys(probes).join("|")}>`);
}

const result = await probes[caseId]();
console.log(JSON.stringify(result, null, 2));
