import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildContext, resolveModelInstruction } from "./index.js";
import { buildAvailableSkillsInstructions } from "./availableSkillsInstructions/index.js";
import {
  buildMemoryToolDeveloperInstructions,
  truncateTextByTokens,
} from "./memoryToolInstructions/index.js";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-context-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeSkill(skillDirectory: string, name: string, description: string) {
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(
    path.join(skillDirectory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`,
    "utf8",
  );
}

function modelConfig(model: string, contextsize = 200_000) {
  return { type: "openai" as const, model, url: "https://example.test", token: "", contextsize };
}

test("model instruction resolves exact model names from file-backed prompt", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const modelPromptDirectory = path.join(userHome, ".ndx", "system", "modelprompt");
    await fs.mkdir(modelPromptDirectory, { recursive: true });
    await fs.writeFile(path.join(modelPromptDirectory, "gpt-5-codex.md"), "exact-model prompt\n", "utf8");

    const prompt = await resolveModelInstruction("gpt-5-codex", userHome);
    assert.equal(prompt, "exact-model prompt\n");
  });
});

test("model instruction strips colon suffixes from the right", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const modelPromptDirectory = path.join(userHome, ".ndx", "system", "modelprompt");
    await fs.mkdir(modelPromptDirectory, { recursive: true });
    await fs.writeFile(path.join(modelPromptDirectory, "gpt-5-codex.md"), "base-model prompt\n", "utf8");

    const prompt = await resolveModelInstruction("gpt-5-codex:lm-studio:local", userHome);
    assert.equal(prompt, "base-model prompt\n");
  });
});

test("model instruction falls back to default prompt file", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const modelPromptDirectory = path.join(userHome, ".ndx", "system", "modelprompt");
    await fs.mkdir(modelPromptDirectory, { recursive: true });
    await fs.writeFile(path.join(modelPromptDirectory, "default.md"), "default prompt\n", "utf8");

    const prompt = await resolveModelInstruction("unknown-local-model", userHome);
    assert.equal(prompt, "default prompt\n");
  });
});

test("model instruction falls back to bundled default prompt when .ndx is absent", async () => {
  await withTempDir(async () => {
    const prompt = await resolveModelInstruction("unknown-local-model");
    assert.match(prompt, /You are NDX/);
  });
});

test("buildContext uses user-home default model prompt", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    const modelPromptDirectory = path.join(userHome, ".ndx", "system", "modelprompt");
    await fs.mkdir(modelPromptDirectory, { recursive: true });
    await fs.writeFile(path.join(modelPromptDirectory, "default.md"), "You are NDX from user home\n", "utf8");

    const defaultPromptPath = path.join(userHome, ".ndx", "system", "modelprompt", "default.md");
    const seededPrompt = await fs.readFile(defaultPromptPath, "utf8");
    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: projectHome,
      userHome,
      projectHome,
    });

    assert.match(seededPrompt, /You are NDX/);
    assert.match(context.developer, /<model_instruction>\nYou are NDX/);
  });
});

test("buildContext prefers model-specific prompt files under initialized .ndx", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    const modelPromptDirectory = path.join(userHome, ".ndx", "system", "modelprompt");
    await fs.mkdir(modelPromptDirectory, { recursive: true });
    await fs.writeFile(path.join(modelPromptDirectory, "default.md"), "You are NDX from user home\n", "utf8");
    await fs.writeFile(
      path.join(userHome, ".ndx", "system", "modelprompt", "gpt-5.5.md"),
      "model-specific prompt\n",
      "utf8",
    );

    const context = await buildContext({
      model: modelConfig("GPT-5.5"),
      cwd: projectHome,
      userHome,
      projectHome,
    });

    assert.match(context.developer, /<model_instruction>\nmodel-specific prompt\n<\/model_instruction>/);
    assert.doesNotMatch(context.developer, /You are NDX/);
  });
});

test("buildContext composes implemented sections from initialized arbitrary roots and model", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "custom-home");
    const projectHome = path.join(dir, "workspace-root");
    const cwd = path.join(projectHome, "apps", "agent", "src", "server");
    const model = modelConfig("LOCAL/GPT:studio");
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(path.join(projectHome, "apps", "agent"), { recursive: true });
    await writeSkill(
      path.join(userHome, ".ndx", "skills", "cot_solve"),
      "cot-solve",
      "default planning skill",
    );
    await fs.mkdir(path.join(userHome, ".ndx", "system", "modelprompt"), { recursive: true });
    await fs.writeFile(
      path.join(userHome, ".ndx", "system", "modelprompt", "local_gpt.md"),
      "custom local model prompt\n",
      "utf8",
    );
    await fs.writeFile(path.join(userHome, ".ndx", "system-promt.md"), "developer policy\n", "utf8");
    await fs.writeFile(path.join(userHome, ".ndx", "AGENTS.md"), "home agent policy\n", "utf8");
    await fs.writeFile(path.join(projectHome, "AGENTS.md"), "root agent policy\n", "utf8");
    await fs.writeFile(path.join(projectHome, "apps", "AGENTS.md"), "apps agent policy\n", "utf8");
    await fs.writeFile(path.join(projectHome, "apps", "agent", "AGENTS.md"), "service agent policy\n", "utf8");

    const context = await buildContext({
      model,
      cwd,
      userHome,
      projectHome,
      currentDate: "2026-05-12",
      timezone: "Asia/Seoul",
    });

    assert.match(context.developer, /^<model_instruction>\ncustom local model prompt\n<\/model_instruction>/);
    assert.match(context.developer, /<developer_instructions>\ndeveloper policy\n<\/developer_instructions>/);
    assert.doesNotMatch(context.developer, /You are NDX/);
    assert.doesNotMatch(context.developer, /<permissions instructions>/);
    assert.doesNotMatch(context.developer, /<memory_tool_instructions>/);
    assert.match(context.developer, /<available_skills_instructions>/);
    assert.match(context.developer, /- cot-solve:/);

    const homeIndex = context.user.indexOf("home agent policy");
    const rootIndex = context.user.indexOf("root agent policy");
    const appsIndex = context.user.indexOf("apps agent policy");
    const serviceIndex = context.user.indexOf("service agent policy");
    const environmentIndex = context.user.indexOf("<environment_context>");
    assert.ok(homeIndex >= 0);
    assert.ok(rootIndex > homeIndex);
    assert.ok(appsIndex > rootIndex);
    assert.ok(serviceIndex > appsIndex);
    assert.ok(environmentIndex > serviceIndex);
    assert.match(context.user, new RegExp(`<cwd>${escapeRegExp(cwd)}</cwd>`));
    assert.match(context.user, /<shell>bash<\/shell>/);
    assert.match(context.user, /<current_date>2026-05-12<\/current_date>/);
    assert.match(context.user, /<timezone>Asia\/Seoul<\/timezone>/);
  });
});

test("model instruction sanitizes slash characters before reading model prompt files", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const modelPromptDirectory = path.join(userHome, ".ndx", "system", "modelprompt");
    await fs.mkdir(modelPromptDirectory, { recursive: true });
    await fs.writeFile(path.join(modelPromptDirectory, "local_gpt.md"), "sanitized model prompt\n", "utf8");

    const prompt = await resolveModelInstruction("LOCAL/GPT", userHome);
    assert.equal(prompt, "sanitized model prompt\n");
  });
});

test("developer instructions read user home .ndx system prompt when present", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
    await fs.writeFile(path.join(userHome, ".ndx", "system-promt.md"), "local system prompt\n", "utf8");

    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: "/mnt/f/dev/project",
      userHome,
    });

    assert.match(context.developer, /local system prompt/);
    assert.match(context.developer, /<developer_instructions>\nlocal system prompt\n<\/developer_instructions>/);
  });
});

test("developer instructions are omitted when system prompt is absent", async () => {
  await withTempDir(async (dir) => {
    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: "/mnt/f/dev/project",
      userHome: path.join(dir, "missing-home"),
    });

    assert.doesNotMatch(context.developer, /system-promt/);
    assert.match(context.developer, /You are NDX/);
    assert.doesNotMatch(context.developer, /<permissions instructions>/);
  });
});

test("memory tool developer instructions render the summary when present", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const memoriesDirectory = path.join(userHome, ".ndx", "memories");
    await fs.mkdir(memoriesDirectory, { recursive: true });
    await fs.writeFile(path.join(memoriesDirectory, "memory_summary.md"), "alpha beta gamma\n", "utf8");

    const prompt = await buildMemoryToolDeveloperInstructions({ userHome });

    assert.ok(prompt);
    assert.match(prompt, /## Memory/);
    assert.match(prompt, new RegExp(escapeRegExp(path.join(userHome, ".ndx", "memories"))));
    assert.match(prompt, /alpha beta gamma/);
    assert.match(prompt, /========= MEMORY_SUMMARY BEGINS =========/);
  });
});

test("memory tool developer instructions omit missing or blank summaries", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const memoriesDirectory = path.join(userHome, ".ndx", "memories");
    assert.equal(await buildMemoryToolDeveloperInstructions({ userHome }), undefined);

    await fs.mkdir(memoriesDirectory, { recursive: true });
    await fs.writeFile(path.join(memoriesDirectory, "memory_summary.md"), " \n\t", "utf8");

    assert.equal(await buildMemoryToolDeveloperInstructions({ userHome }), undefined);
  });
});

test("memory tool developer instructions truncate summary by token-like words", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const memoriesDirectory = path.join(userHome, ".ndx", "memories");
    await fs.mkdir(memoriesDirectory, { recursive: true });
    await fs.writeFile(path.join(memoriesDirectory, "memory_summary.md"), "one two\nthree four", "utf8");

    const prompt = await buildMemoryToolDeveloperInstructions({ userHome, tokenLimit: 3 });

    assert.ok(prompt);
    assert.match(prompt, /one two\nthree/);
    assert.doesNotMatch(prompt, /four/);
  });
});

test("memory tool context section remains disabled for now", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    await fs.mkdir(path.join(userHome, ".ndx", "memories"), { recursive: true });
    await fs.writeFile(path.join(userHome, ".ndx", "memories", "memory_summary.md"), "persisted memory", "utf8");

    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: projectHome,
      userHome,
      projectHome,
    });

    assert.doesNotMatch(context.developer, /<memory_tool_instructions>/);
    assert.doesNotMatch(context.developer, /persisted memory/);
  });
});

test("available skills load in ndx override order and later roots replace earlier names", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    await writeSkill(path.join(userHome, ".ndx", "plugin", "alpha", "skills", "shared"), "shared", "user plugin loses");
    await writeSkill(path.join(userHome, ".ndx", "skills", "shared"), "shared", "user plain loses to repo");
    await writeSkill(path.join(projectHome, ".ndx", "plugin", "alpha", "skills", "shared"), "shared", "repo plugin loses");
    await writeSkill(path.join(projectHome, ".ndx", "skills", "shared"), "shared", "repo plain loses to system");
    await writeSkill(path.join(userHome, ".ndx", "system", "plugin", "alpha", "skills", "shared"), "shared", "system plugin loses");
    await writeSkill(path.join(userHome, ".ndx", "system", "skills", "shared"), "shared", "system plain wins");
    await writeSkill(path.join(userHome, ".ndx", "skills", "user-only"), "user-only", "user visible");
    await writeSkill(path.join(projectHome, ".ndx", "skills", "repo-only"), "repo-only", "repo visible");
    await writeSkill(path.join(userHome, ".ndx", "system", "skills", "system-only"), "system-only", "system visible");

    const skills = await buildAvailableSkillsInstructions({
      cwd: projectHome,
      userHome,
      projectHome,
      model: modelConfig("unknown-local-model"),
    });

    assert.match(skills, /## Skills/);
    assert.match(skills, /- shared: system plain wins/);
    assert.doesNotMatch(skills, /user plugin loses|user plain loses|repo plugin loses|repo plain loses|system plugin loses/);

    const systemIndex = skills.indexOf("- shared: system plain wins");
    const repoIndex = skills.indexOf("- repo-only: repo visible");
    const userIndex = skills.indexOf("- user-only: user visible");
    assert.ok(systemIndex >= 0);
    assert.ok(repoIndex > systemIndex);
    assert.ok(userIndex > repoIndex);
  });
});

test("buildContext injects available skills section when skills exist", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    await writeSkill(path.join(projectHome, ".ndx", "skills", "review"), "review", "Review code changes.");

    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: projectHome,
      userHome,
      projectHome,
    });

    assert.match(context.developer, /<available_skills_instructions>\n## Skills/);
    assert.match(context.developer, /- review: Review code changes\. \(file: .*\/project\/\.ndx\/skills\/review\/SKILL\.md\)/);
  });
});

test("available skills apply user system and project skillignore after all loading", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    await writeSkill(path.join(userHome, ".ndx", "skills", "ignored-by-system"), "ignored-by-system", "hidden by system ignore");
    await writeSkill(path.join(projectHome, ".ndx", "skills", "ignored-by-project"), "ignored-by-project", "hidden by project ignore");
    await writeSkill(path.join(projectHome, ".ndx", "skills", "visible"), "visible", "still visible");
    await writeSkill(path.join(projectHome, ".ndx", "skills", "late-winner"), "late-winner", "repo hidden before system wins");
    await writeSkill(path.join(userHome, ".ndx", "system", "skills", "late-winner"), "late-winner", "system hidden after all loading");
    await fs.mkdir(path.join(userHome, ".ndx", "system"), { recursive: true });
    await fs.mkdir(path.join(projectHome, ".ndx"), { recursive: true });
    await fs.writeFile(path.join(userHome, ".ndx", "system", ".skillignore"), "ignored-by-system\nlate-winner\n", "utf8");
    await fs.writeFile(path.join(projectHome, ".ndx", ".skillignore"), "\nignored-by-project\n", "utf8");

    const skills = await buildAvailableSkillsInstructions({
      cwd: projectHome,
      userHome,
      projectHome,
      model: modelConfig("unknown-local-model"),
    });

    assert.match(skills, /- visible: still visible/);
    assert.doesNotMatch(skills, /ignored-by-system|ignored-by-project|late-winner|hidden by/);
  });
});

test("available skills write parsed metadata cache next to SKILL.md", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    const skillDirectory = path.join(projectHome, ".ndx", "skills", "cached");
    await writeSkill(skillDirectory, "cached", "parsed from skill markdown");

    const skills = await buildAvailableSkillsInstructions({
      cwd: projectHome,
      userHome,
      projectHome,
      model: modelConfig("unknown-local-model"),
    });

    const cache = JSON.parse(await fs.readFile(path.join(skillDirectory, ".cache"), "utf8"));
    assert.equal(cache.name, "cached");
    assert.equal(cache.description, "parsed from skill markdown");
    assert.match(skills, /- cached: parsed from skill markdown/);
  });
});

test("available skills prefer existing metadata cache over reparsing SKILL.md", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    const skillDirectory = path.join(projectHome, ".ndx", "skills", "cached");
    await writeSkill(skillDirectory, "from-md", "markdown should be ignored");
    await fs.writeFile(
      path.join(skillDirectory, ".cache"),
      JSON.stringify({ name: "from-cache", description: "cache wins" }),
      "utf8",
    );

    const skills = await buildAvailableSkillsInstructions({
      cwd: projectHome,
      userHome,
      projectHome,
      model: modelConfig("unknown-local-model"),
    });

    assert.match(skills, /- from-cache: cache wins/);
    assert.doesNotMatch(skills, /from-md|markdown should be ignored/);
  });
});

test("available skills respect the two percent context window budget", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    await writeSkill(path.join(projectHome, ".ndx", "skills", "alpha"), "alpha", "a".repeat(500));
    await writeSkill(path.join(projectHome, ".ndx", "skills", "beta"), "beta", "b".repeat(500));

    const skills = await buildAvailableSkillsInstructions({
      cwd: projectHome,
      userHome,
      projectHome,
      model: modelConfig("unknown-local-model", 120),
    });

    assert.match(skills, /Exceeded skills context budget of 2%/);
    assert.doesNotMatch(skills, /a{20}|b{20}/);
  });
});

test("truncateTextByTokens preserves whitespace between retained tokens", () => {
  assert.equal(truncateTextByTokens("one  two\nthree", 2), "one  two\n");
  assert.equal(truncateTextByTokens("one two", 0), "");
});

test("user instructions include user and project AGENTS files in order", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
    await fs.mkdir(projectHome, { recursive: true });
    await fs.writeFile(path.join(userHome, ".ndx", "AGENTS.md"), "home instructions", "utf8");
    await fs.writeFile(path.join(projectHome, "AGENTS.md"), "project instructions", "utf8");

    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: "/mnt/f/dev/project",
      userHome,
      projectHome,
    });

    const homeIndex = context.user.indexOf("home instructions");
    const projectIndex = context.user.indexOf("project instructions");
    assert.ok(homeIndex >= 0);
    assert.ok(projectIndex > homeIndex);
    assert.match(context.user, new RegExp(`# AGENTS\\.md instructions for ${escapeRegExp(path.join(userHome, ".ndx", "AGENTS.md"))}\\n\\n<INSTRUCTIONS>`));
    assert.match(context.user, /<INSTRUCTIONS>\nhome instructions\n<\/INSTRUCTIONS>/);
  });
});

test("user instructions cascade from project root to cwd descendants", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    const appDirectory = path.join(projectHome, "apps");
    const agentDirectory = path.join(appDirectory, "agent");
    const cwd = path.join(agentDirectory, "src");
    await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
    await fs.mkdir(cwd, { recursive: true });
    await fs.writeFile(path.join(userHome, ".ndx", "AGENTS.md"), "home policy", "utf8");
    await fs.writeFile(path.join(projectHome, "AGENTS.md"), "root policy", "utf8");
    await fs.writeFile(path.join(appDirectory, "AGENTS.md"), "apps policy", "utf8");
    await fs.writeFile(path.join(agentDirectory, "AGENTS.md"), "agent policy", "utf8");

    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd,
      userHome,
      projectHome,
    });

    const homeIndex = context.user.indexOf("home policy");
    const rootIndex = context.user.indexOf("root policy");
    const appsIndex = context.user.indexOf("apps policy");
    const agentIndex = context.user.indexOf("agent policy");
    assert.ok(homeIndex >= 0);
    assert.ok(rootIndex > homeIndex);
    assert.ok(appsIndex > rootIndex);
    assert.ok(agentIndex > appsIndex);
    assert.doesNotMatch(context.user, new RegExp(escapeRegExp(path.join(cwd, "AGENTS.md"))));
  });
});

test("user instructions do not duplicate project AGENTS when cwd equals projectHome", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
    await fs.mkdir(projectHome, { recursive: true });
    await fs.writeFile(path.join(userHome, ".ndx", "AGENTS.md"), "home policy", "utf8");
    await fs.writeFile(path.join(projectHome, "AGENTS.md"), "project policy", "utf8");

    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: projectHome,
      userHome,
      projectHome,
    });

    assert.equal(context.user.match(/project policy/g)?.length, 1);
  });
});

test("user instructions ignore cwd AGENTS outside declared projectHome", async () => {
  await withTempDir(async (dir) => {
    const userHome = path.join(dir, "home");
    const projectHome = path.join(dir, "project");
    const outsideCwd = path.join(dir, "outside");
    await fs.mkdir(path.join(userHome, ".ndx"), { recursive: true });
    await fs.mkdir(projectHome, { recursive: true });
    await fs.mkdir(outsideCwd, { recursive: true });
    await fs.writeFile(path.join(userHome, ".ndx", "AGENTS.md"), "home policy", "utf8");
    await fs.writeFile(path.join(projectHome, "AGENTS.md"), "project policy", "utf8");
    await fs.writeFile(path.join(outsideCwd, "AGENTS.md"), "outside policy", "utf8");

    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: outsideCwd,
      userHome,
      projectHome,
    });

    assert.match(context.user, /home policy/);
    assert.match(context.user, /project policy/);
    assert.doesNotMatch(context.user, /outside policy/);
    assert.match(context.user, new RegExp(`<cwd>${escapeRegExp(outsideCwd)}</cwd>`));
  });
});

test("buildContext returns one developer string and one user string", async () => {
  await withTempDir(async (dir) => {
    const context = await buildContext({
      model: modelConfig("unknown-local-model"),
      cwd: "/mnt/f/dev/project",
      userHome: path.join(dir, "home"),
      projectHome: path.join(dir, "project"),
      currentDate: "2026-05-11",
      timezone: "Asia/Seoul",
    });

    assert.equal(typeof context.developer, "string");
    assert.equal(typeof context.user, "string");
    assert.match(context.developer, /You are NDX/);
    assert.match(context.developer, /^<model_instruction>/);
    assert.match(context.developer, /<\/model_instruction>/);
    assert.match(context.user, /<environment_context>/);
    assert.match(context.user, /<cwd>\/mnt\/f\/dev\/project<\/cwd>/);
    assert.match(context.user, /<shell>bash<\/shell>/);
    assert.match(context.user, /<current_date>2026-05-11<\/current_date>/);
    assert.match(context.user, /<timezone>Asia\/Seoul<\/timezone>/);
  });
});
