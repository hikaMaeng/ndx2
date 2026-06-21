import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { agentToolSchema } from "./index.js";
import { loadSubagents, parseSubagentFile } from "./subagent.js";

test("loadSubagents applies configured root priority with later roots overriding by name", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-subagent-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await writeAgent(path.join(userHome, ".ndx", "agent", "demo", "AGENT.md"), "demo", "user agent", "from user");
  await writeAgent(path.join(projectHome, ".ndx", "agent", "demo", "AGENT.md"), "demo", "project agent", "from project");
  await writeAgent(path.join(userHome, ".ndx", "system", "agent", "demo", "AGENT.md"), "demo", "system agent", "from system");
  const agents = await loadSubagents({ userHome, projectHome });
  assert.equal(agents.length, 1);
  assert.equal(agents[0]?.description, "system agent");
  assert.equal(agents[0]?.prompt, "from system");
});

test("parseSubagentFile removes ## session JSON and parses subagent session config", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-subagent-"));
  const file = path.join(root, "AGENT.md");
  await writeFile(file, "---\nname: planner\ndescription: planning agent\n---\nPlan the work.\n\n## session\n{\n  \"modeltype\": \"planner\",\n  \"messages\": [\"review once\"],\n  \"parentcontext\": true\n}\n");
  const agent = await parseSubagentFile(file);
  assert.equal(agent.name, "planner");
  assert.equal(agent.prompt, "Plan the work.");
  assert.deepEqual(agent.session, { modeltype: "planner", messages: ["review once"], parentcontext: true });
});

test("parseSubagentFile removes ## arguments JSON Schema and exposes structured input schema", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-subagent-"));
  const file = path.join(root, "AGENT.md");
  await writeFile(file, "---\nname: planner\ndescription: planning agent\n---\nPlan from structured input.\n\n## arguments\n{\n  \"type\": \"object\",\n  \"properties\": {\n    \"goal\": { \"type\": \"string\" }\n  },\n  \"required\": [\"goal\"]\n}\n\nUse only the provided input_json.\n");
  const agent = await parseSubagentFile(file);
  assert.equal(agent.prompt, "Plan from structured input.\n\n\n\nUse only the provided input_json.");
  assert.deepEqual(agent.inputSchema, { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] });
});

test("agentToolSchema exposes only subagent_type and structured input", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-subagent-"));
  const userHome = path.join(root, "user");
  const projectHome = path.join(root, "project");
  await writeFile(path.join(projectHome, ".ndx", "agent", "planner", "AGENT.md"), "---\nname: planner\ndescription: planning agent\n---\nPlan.\n\n## arguments\n{\n  \"type\": \"object\",\n  \"properties\": {\n    \"goal\": { \"type\": \"string\" }\n  },\n  \"required\": [\"goal\"]\n}\n");
  const schema = await agentToolSchema({ userHome, projectHome });
  const parameters = schema.parameters as { properties: Record<string, unknown>; required: string[]; allOf: unknown[] };
  assert.deepEqual(Object.keys(parameters.properties).sort(), ["input", "subagent_type"]);
  assert.deepEqual(parameters.required, ["subagent_type"]);
  assert.equal("prompt" in parameters.properties, false);
  assert.equal("description" in parameters.properties, false);
  assert.equal("modeltype" in parameters.properties, false);
  assert.equal("max_turns" in parameters.properties, false);
  assert.deepEqual(parameters.allOf, [{
    if: { properties: { subagent_type: { const: "planner" } }, required: ["subagent_type"] },
    then: { properties: { input: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] } }, required: ["input"] }
  }]);
});

test("invalid ## session JSON is retained as a subagent parse error", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-subagent-"));
  const file = path.join(root, "AGENT.md");
  await writeFile(file, "---\nname: broken\ndescription: broken agent\n---\nBroken prompt.\n\n## session\n{ \"modeltype\": \"planner\"\n");
  const agent = await parseSubagentFile(file);
  assert.match(agent.parseError ?? "", /JSON object is not closed/);
});

async function writeAgent(file: string, name: string, description: string, prompt: string): Promise<void> {
  await writeFile(file, `---\nname: ${name}\ndescription: ${description}\n---\n${prompt}\n`);
}

async function writeFile(file: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents, "utf8");
}
