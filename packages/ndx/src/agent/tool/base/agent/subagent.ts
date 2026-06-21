import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { readNDXSettingsDocument, resolveSettingsModelConfig, settingsDocumentToAgentRuntimeSettings } from "../../../../common/settings/index.js";
import { appendSessionData } from "../../../session/appendSessionData.js";
import { createSession } from "../../../session/createSession.js";
import { parentContextContents, subagentSessionContents } from "../../../session/content.js";
import { listSessionData } from "../../../session/listSessionData.js";
import { listSessionDataForModelContext, summarizeSessionRowsForContext } from "../../../compact/index.js";
import { interruptActiveDescendantSessions, registerActiveSubsession } from "./interrupt.js";
import type { NDXContextUsage } from "../../../contextusage/index.js";
import type { NDXDatabase, NDXModelConfig, NDXSessionDataRow, NDXSessionRow } from "../../../session/types.js";
import type { NDXTurnLoopEvent } from "../../../turnloop/types.js";

export type NDXSubagentDefinition = {
  name: string;
  description: string;
  pathToAgentMd: string;
  prompt: string;
  inputSchema?: Record<string, unknown>;
  parseError?: string;
  session: { modeltype?: string; messages: string[]; parentcontext: boolean };
};

export type NDXSubagentRunInput = {
  subagentType: string;
  input?: unknown;
  callId?: string;
  parentSession: NDXSessionRow;
  database: NDXDatabase;
  userHome?: string;
  projectHome?: string;
  signal?: AbortSignal;
  onSubsessionEvent?: (session: NDXSessionRow, event: NDXTurnLoopEvent) => Promise<void>;
};

export type NDXSubagentRunResult = {
  sessionid: string;
  subagent_type: string;
  modeltype?: string;
  assigned_model_key?: string;
  model_fallback: boolean;
  parentcontext: boolean;
  status: "completed" | "failed" | "interrupted";
  final_response: string;
  turn_count: number;
};

const modelTypeRoundRobin = new Map<string, number>();

export async function loadSubagents(options: { userHome?: string; projectHome?: string } = {}): Promise<NDXSubagentDefinition[]> {
  const userHome = options.userHome ?? os.homedir();
  const projectHome = options.projectHome ?? process.cwd();
  const roots = [
    await pluginAgentFiles(path.join(userHome, ".ndx", "plugin")),
    await agentFiles(path.join(userHome, ".ndx", "agent")),
    await pluginAgentFiles(path.join(projectHome, ".ndx", "plugin")),
    await agentFiles(path.join(projectHome, ".ndx", "agent")),
    await agentFiles(path.join(userHome, ".ndx", "system", "agent"))
  ].flat();
  const merged = new Map<string, NDXSubagentDefinition>();
  for (const file of roots) {
    const definition = await parseSubagentFile(file);
    if (definition.name) merged.set(definition.name, definition);
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function buildAvailableSubagentsInstructions(options: { userHome?: string; projectHome?: string } = {}): Promise<string> {
  const subagents = await loadSubagents(options);
  if (subagents.length === 0) return "";
  return [
    "A subagent is a nested NDX session invoked with the `agent` tool. The selected AGENT.md owns its prompt, modeltype, parent-context behavior, and queued messages. Pass only `subagent_type` plus `input` when the AGENT.md declares a `## arguments` JSON Schema.",
    ...subagents.map((agent) => {
      const schema = agent.inputSchema ? ` input_schema=${JSON.stringify(agent.inputSchema)}` : "";
      const parseError = agent.parseError ? ` parse_error=${JSON.stringify(agent.parseError)}` : "";
      return `- ${agent.name}: ${agent.description} (file: ${agent.pathToAgentMd})${schema}${parseError}`;
    })
  ].join("\n");
}

export async function runSubagent(input: NDXSubagentRunInput): Promise<NDXSubagentRunResult> {
  const userHome = input.userHome ?? os.homedir();
  const projectHome = input.projectHome ?? input.parentSession.path;
  const definition = (await loadSubagents({ userHome, projectHome })).find((agent) => agent.name === input.subagentType);
  if (!definition) throw new Error(`Unknown subagent_type: ${input.subagentType}`);
  if (definition.parseError) throw new Error(`Invalid AGENT.md for subagent ${definition.name}: ${definition.parseError}`);
  validateSubagentInput(definition, input.input);

  const modelSelection = await resolveSubagentModel(userHome, definition.session.modeltype, input.parentSession.model);
  const child = await createSession(input.database, {
    projectname: input.parentSession.projectname,
    title: `${definition.name} subagent`,
    mode: input.parentSession.mode,
    model: modelSelection.model,
    parentsessionid: input.parentSession.sessionid,
    rootsessionid: input.parentSession.rootsessionid ?? input.parentSession.sessionid,
    createdbytoolcallid: input.callId,
    createdbytoolname: "agent",
    subagenttype: definition.name,
    subagentconfig: {
      modeltype: definition.session.modeltype,
      assignedModelKey: modelSelection.assignedModelKey,
      modelFallback: modelSelection.fallback,
      parentcontext: definition.session.parentcontext,
      ...(typeof input.input !== "undefined" ? { input: input.input } : {})
    }
  });

  await emitSubagentSession(input, child, definition, modelSelection, "running");
  const unregister = registerActiveSubsession(input.parentSession.sessionid, child.sessionid);
  const abort = () => {
    void interruptActiveDescendantSessions(input.database, input.parentSession.sessionid);
  };
  input.signal?.addEventListener("abort", abort, { once: true });

  let turnCount = 0;
  try {
    if (input.signal?.aborted) {
      await interruptActiveDescendantSessions(input.database, input.parentSession.sessionid);
      await setSubagentStatus(input.database, child.sessionid, "interrupted");
      await emitSubagentSession(input, child, definition, modelSelection, "interrupted");
      return resultFromChild(child.sessionid, definition, modelSelection, "interrupted", "", turnCount);
    }
    if (definition.session.parentcontext) {
      await appendParentContext(input.database, input.parentSession, child, modelSelection.model);
    }
    const requests = [subagentFirstRequest(definition, input.input), ...definition.session.messages].filter((text) => text.trim().length > 0);
    for (const request of requests.length > 0 ? requests : [`Run the ${definition.name} subagent.`]) {
      turnCount += 1;
      const { runAgentTurnWithCompactContinuation } = await import("../../../turnloop/index.js");
      await runAgentTurnWithCompactContinuation(input.database, child, { text: request }, modelSelection.model, {
        async onEvent(event) {
          await input.onSubsessionEvent?.(child, event);
        },
        async onSubsessionEvent(subsession, event) {
          await input.onSubsessionEvent?.(subsession, event);
        }
      });
      if (input.signal?.aborted) {
        await interruptActiveDescendantSessions(input.database, input.parentSession.sessionid);
        break;
      }
    }
    const finalResponse = await latestAssistantResponse(input.database, child.sessionid);
    const status = input.signal?.aborted ? "interrupted" : "completed";
    await setSubagentStatus(input.database, child.sessionid, status);
    await emitSubagentSession(input, child, definition, modelSelection, status);
    return resultFromChild(child.sessionid, definition, modelSelection, status, finalResponse, turnCount);
  } catch (error) {
    const status = input.signal?.aborted ? "interrupted" : "failed";
    await setSubagentStatus(input.database, child.sessionid, status);
    await emitSubagentSession(input, child, definition, modelSelection, status);
    if (status === "interrupted") return resultFromChild(child.sessionid, definition, modelSelection, "interrupted", "", turnCount);
    throw error;
  } finally {
    input.signal?.removeEventListener("abort", abort);
    unregister();
  }
}

export async function parseSubagentFile(file: string): Promise<NDXSubagentDefinition> {
  const source = await fs.readFile(file, "utf8");
  const parsed = parseFrontmatter(source);
  const name = singleLine(parsed.fields.get("name") ?? path.basename(path.dirname(file)));
  const description = singleLine(parsed.fields.get("description") ?? "");
  let body = parsed.body;
  let parseError: string | undefined;
  let session: NDXSubagentDefinition["session"] = { messages: [], parentcontext: false };
  let inputSchema: Record<string, unknown> | undefined;

  const sessionBlock = extractJsonBlock(body, "session");
  body = sessionBlock.body;
  if (sessionBlock.error) {
    parseError = sessionBlock.error;
  } else if (sessionBlock.value) {
    try {
      session = parseSessionConfig(sessionBlock.value);
    } catch (error) {
      parseError = String(error instanceof Error ? error.message : error);
    }
  }

  const argumentsBlock = extractJsonBlock(body, "arguments");
  body = argumentsBlock.body;
  if (!parseError && argumentsBlock.error) {
    parseError = argumentsBlock.error;
  } else if (!parseError && argumentsBlock.value) {
    try {
      inputSchema = parseArgumentsConfig(argumentsBlock.value);
    } catch (error) {
      parseError = String(error instanceof Error ? error.message : error);
    }
  }
  if (!description && !parseError) parseError = "frontmatter description is required";
  return { name, description, pathToAgentMd: file, prompt: body.trim(), ...(inputSchema ? { inputSchema } : {}), ...(parseError ? { parseError } : {}), session };
}

async function pluginAgentFiles(pluginRoot: string): Promise<string[]> {
  const plugins = await childDirectories(pluginRoot);
  return (await Promise.all(plugins.map((plugin) => agentFiles(path.join(plugin, "agent"))))).flat();
}

async function agentFiles(root: string): Promise<string[]> {
  return (await childDirectories(root)).map((directory) => path.join(directory, "AGENT.md"));
}

async function childDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)).sort();
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT") return [];
    throw error;
  }
}

function parseFrontmatter(source: string): { fields: Map<string, string>; body: string } {
  if (!source.startsWith("---")) return { fields: new Map<string, string>(), body: source };
  const end = source.indexOf("\n---", 3);
  if (end < 0) return { fields: new Map<string, string>(), body: source };
  const fields = new Map<string, string>();
  for (const line of source.slice(3, end).trim().split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index > 0) fields.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  return { fields, body: source.slice(end + 4) };
}

function extractJsonBlock(body: string, name: "session" | "arguments"): { body: string; value?: unknown; error?: string } {
  const match = new RegExp(`(^|\\n)##\\s*${name}\\b[ \\t]*(?:\\r?\\n)?`, "i").exec(body);
  if (!match) return { body };
  const headingStart = match.index + (match[1] ? match[1].length : 0);
  let jsonStart = match.index + match[0].length;
  while (jsonStart < body.length && /\s/.test(body[jsonStart] ?? "")) jsonStart += 1;
  if (body[jsonStart] !== "{") return { body, error: `## ${name} must be followed by a JSON object` };
  const jsonEnd = findJsonObjectEnd(body, jsonStart);
  if (jsonEnd < 0) return { body, error: `## ${name} JSON object is not closed` };
  try {
    return { body: `${body.slice(0, headingStart)}${body.slice(jsonEnd)}`, value: JSON.parse(body.slice(jsonStart, jsonEnd)) as unknown };
  } catch (error) {
    return { body, error: `## ${name} JSON parse failed: ${String(error instanceof Error ? error.message : error)}` };
  }
}

function findJsonObjectEnd(source: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function parseSessionConfig(value: unknown): NDXSubagentDefinition["session"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("## session must be a JSON object");
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.modeltype === "string" && record.modeltype.trim() ? { modeltype: record.modeltype.trim() } : {}),
    messages: Array.isArray(record.messages) ? record.messages.filter((item): item is string => typeof item === "string") : [],
    parentcontext: record.parentcontext === true
  };
}

function parseArgumentsConfig(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("## arguments must be a JSON object schema");
  return value as Record<string, unknown>;
}

function validateSubagentInput(definition: NDXSubagentDefinition, input: unknown): void {
  if (!definition.inputSchema) {
    if (typeof input !== "undefined") throw new Error(`Subagent ${definition.name} does not declare ## arguments and does not accept input.`);
    return;
  }
  const errors = validateJsonSchemaValue(input, definition.inputSchema, "input");
  if (errors.length > 0) throw new Error(`Invalid input for subagent ${definition.name}: ${errors.join("; ")}`);
}

function validateJsonSchemaValue(value: unknown, schema: Record<string, unknown>, pathName: string): string[] {
  const errors: string[] = [];
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => item === value)) errors.push(`${pathName} must be one of ${JSON.stringify(schema.enum)}`);
  const type = schema.type;
  if (typeof type === "string" && !jsonSchemaTypeMatches(value, type)) {
    errors.push(`${pathName} must be ${type}`);
    return errors;
  }
  if (type === "object" || (value && typeof value === "object" && !Array.isArray(value))) {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    for (const key of required) if (!(key in record)) errors.push(`${pathName}.${key} is required`);
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties as Record<string, unknown> : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in record && childSchema && typeof childSchema === "object" && !Array.isArray(childSchema)) {
        errors.push(...validateJsonSchemaValue(record[key], childSchema as Record<string, unknown>, `${pathName}.${key}`));
      }
    }
  }
  if (Array.isArray(value) && schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    value.forEach((item, index) => errors.push(...validateJsonSchemaValue(item, schema.items as Record<string, unknown>, `${pathName}[${index}]`)));
  }
  return errors;
}

function jsonSchemaTypeMatches(value: unknown, type: string): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

async function resolveSubagentModel(userHome: string, modeltype: string | undefined, parentModel: NDXModelConfig): Promise<{ model: NDXModelConfig; assignedModelKey?: string; fallback: boolean }> {
  if (!modeltype) return { model: parentModel, fallback: true };
  const settings = await readNDXSettingsDocument(userHome);
  const candidates = settingsDocumentToAgentRuntimeSettings(settings).modeltype?.[modeltype] ?? [];
  if (candidates.length === 0) return { model: parentModel, fallback: true };
  const counterKey = `${userHome}:${modeltype}`;
  const start = modelTypeRoundRobin.get(counterKey) ?? 0;
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(start + offset) % candidates.length];
    if (!candidate) continue;
    const resolved = resolveSettingsModelConfig(settings, candidate, parentModel.contextsize);
    if (resolved) {
      modelTypeRoundRobin.set(counterKey, start + offset + 1);
      return { model: resolved.model, assignedModelKey: resolved.key, fallback: false };
    }
  }
  return { model: parentModel, fallback: true };
}

async function appendParentContext(database: NDXDatabase, parentSession: NDXSessionRow, child: NDXSessionRow, model: NDXModelConfig): Promise<void> {
  const rows = await listSessionDataForModelContext(database, parentSession.sessionid);
  let text = "";
  try {
    text = (await summarizeSessionRowsForContext(model, undefined, rows, {
      extraSystemLines: [
        `This summary will be injected into child session ${child.sessionid} as parent context.`,
        `Mention parent sessionid ${parentSession.sessionid} and tell the child to use session_history recall with scope="session" when exact source rows are needed.`
      ]
    })).text;
  } catch (error) {
    text = [
      `Parent session ${parentSession.sessionid} summary could not be generated: ${String(error instanceof Error ? error.message : error)}`,
      "Use session_history recall with scope=\"session\" and the parent sessionid if exact parent rows are needed."
    ].join("\n");
  }
  await appendSessionData(database, child.sessionid, "user", parentContextContents({
    parentSessionid: parentSession.sessionid,
    sourceStartDataId: rows[0] ? String(rows[0].dataid) : undefined,
    sourceEndDataId: rows.at(-1) ? String(rows.at(-1)?.dataid) : undefined,
    sourceRowCount: rows.length,
    text
  }));
}

function subagentFirstRequest(definition: NDXSubagentDefinition, input: unknown): string {
  if (!definition.inputSchema) return definition.prompt;
  return [definition.prompt, "", "<input_json>", JSON.stringify(input, null, 2), "</input_json>"].join("\n").trim();
}

async function latestAssistantResponse(database: NDXDatabase, sessionid: string): Promise<string> {
  const rows = await listSessionData(database, sessionid);
  for (const row of [...rows].reverse()) {
    if (!row.contents || typeof row.contents !== "object") continue;
    const contents = row.contents as { kind?: unknown; text?: unknown };
    if (contents.kind === "assistant_message" && typeof contents.text === "string") return contents.text;
  }
  return "";
}

async function setSubagentStatus(database: NDXDatabase, sessionid: string, status: NDXSubagentRunResult["status"]): Promise<void> {
  await database.query("UPDATE \"session\" SET subagentstatus = $2, lastupdated = now() WHERE sessionid = $1;", [sessionid, status]);
}

async function emitSubagentSession(input: NDXSubagentRunInput, child: NDXSessionRow, definition: NDXSubagentDefinition, modelSelection: { assignedModelKey?: string }, status: "running" | "completed" | "failed" | "interrupted"): Promise<NDXSessionDataRow> {
  const row = await appendSessionData(input.database, input.parentSession.sessionid, "system", subagentSessionContents({
    sessionid: child.sessionid,
    parentSessionid: input.parentSession.sessionid,
    subagentType: definition.name,
    toolCallId: input.callId,
    modeltype: definition.session.modeltype,
    assignedModelKey: modelSelection.assignedModelKey,
    parentcontext: definition.session.parentcontext,
    status,
    title: child.title
  }));
  await input.onSubsessionEvent?.(input.parentSession, { type: NDX_TURN_EVENT.SubagentSession, data: row, contextUsage: zeroContextUsage(input.parentSession.model) });
  return row;
}

function resultFromChild(sessionid: string, definition: NDXSubagentDefinition, modelSelection: { assignedModelKey?: string; fallback: boolean }, status: NDXSubagentRunResult["status"], finalResponse: string, turnCount: number): NDXSubagentRunResult {
  return {
    sessionid,
    subagent_type: definition.name,
    modeltype: definition.session.modeltype,
    assigned_model_key: modelSelection.assignedModelKey,
    model_fallback: modelSelection.fallback,
    parentcontext: definition.session.parentcontext,
    status,
    final_response: finalResponse,
    turn_count: turnCount
  };
}

function zeroContextUsage(model: NDXModelConfig): NDXContextUsage {
  return { tokens: 0, messageTokens: 0, toolDefinitionTokens: 0, percent: 0, contextsize: model.contextsize };
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export { activeDescendantSessionIds, interruptActiveDescendantSessions } from "./interrupt.js";
