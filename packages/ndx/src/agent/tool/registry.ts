import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NDX_BUILTIN_FUNCTION_TOOLS } from "./base/functionTools.js";
import { NDX_TOOL_RUNTIME_ARG_NAMES, isToolRuntimeArgName } from "./base/runtimeArgs.js";
import type { NDXResolvedTool, NDXToolDefinitionFile, NDXToolRegistryOptions, NDXToolScope } from "./types.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export async function listAvailableTools(options: NDXToolRegistryOptions = {}): Promise<NDXResolvedTool[]> {
  const userHome = options.userHome ?? os.homedir();
  const projectHome = options.projectHome ?? process.cwd();
  const roots = [
    await pluginToolDirectories(path.join(userHome, ".ndx", "plugins"), "user"),
    await toolDirectories(path.join(userHome, ".ndx", "tools"), "user"),
    await pluginToolDirectories(path.join(projectHome, ".ndx", "plugins"), "project"),
    await toolDirectories(path.join(projectHome, ".ndx", "tools"), "project"),
    await toolDirectories(resolveBuiltinToolRoot(), "builtin")
  ].flat();
  const merged = new Map<string, NDXResolvedTool>();

  for (const root of roots) {
    const tool = await readToolDefinition(root.directory, root.scope);
    if (tool) {
      merged.set(tool.name, tool);
    }
  }
  for (const functionTool of NDX_BUILTIN_FUNCTION_TOOLS) {
    merged.set(functionTool.name, {
      name: functionTool.name,
      source: "builtin",
      directory: path.join(resolveBuiltinToolRoot(), functionTool.directory),
      definitionPath: `builtin:function:${functionTool.name}`,
      runtime: "function",
      command: "",
      args: [],
      env: {},
      schema: functionTool.schema()
    });
  }

  const allowedToolNames = options.allowedToolNames ? new Set(options.allowedToolNames) : undefined;
  return [...merged.values()]
    .filter((tool) => !allowedToolNames || allowedToolNames.has(tool.name))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function toolSchemas(tools: NDXResolvedTool[]): Record<string, unknown>[] {
  return tools.map((tool) => tool.schema);
}

export function resolveBuiltinToolRoot(): string {
  return path.join(moduleDirectory, "base");
}

async function pluginToolDirectories(pluginRoot: string, scope: NDXToolScope): Promise<Array<{ directory: string; scope: NDXToolScope }>> {
  const plugins = await childDirectories(pluginRoot);
  const roots = await Promise.all(plugins.map((plugin) => toolDirectories(path.join(plugin, "tools"), scope)));
  return roots.flat();
}

async function toolDirectories(root: string, scope: NDXToolScope): Promise<Array<{ directory: string; scope: NDXToolScope }>> {
  return (await childDirectories(root)).map((directory) => ({ directory, scope }));
}

async function childDirectories(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)).sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function readToolDefinition(directory: string, source: NDXToolScope): Promise<NDXResolvedTool | undefined> {
  const definitionPath = path.join(directory, "tool.json");
  let parsed: NDXToolDefinitionFile;
  try {
    parsed = JSON.parse(await fs.readFile(definitionPath, "utf8")) as NDXToolDefinitionFile;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }

  const schema = normalizeSchema(parsed.schema);
  const name = typeof schema.name === "string" && schema.name.trim() ? schema.name.trim() : path.basename(directory);
  const command = typeof parsed.tool?.command === "string" && parsed.tool.command.trim() ? parsed.tool.command.trim() : "";
  if (!command) {
    throw new Error(`tool command is required: ${definitionPath}`);
  }

  const args = Array.isArray(parsed.tool?.args) ? parsed.tool.args.map((item) => resolveToolArg(directory, String(item))) : [];
  const stdin = typeof parsed.tool?.stdin === "string" ? parsed.tool.stdin : undefined;
  validateTemplateArgs([...args, ...(stdin ? [stdin] : [])], schema, definitionPath);

  return {
    name,
    source,
    directory,
    definitionPath,
    command: command.startsWith("./") ? path.join(directory, command.slice(2)) : command,
    args,
    env: normalizeEnv(parsed.tool?.env),
    stdin,
    schema
  };
}

function normalizeSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("tool schema must be an object.");
  }
  const output = { ...(schema as Record<string, unknown>) };
  if (typeof output.type !== "string") {
    output.type = "function";
  }
  if (typeof output.name !== "string" || !output.name.trim()) {
    throw new Error("tool schema name is required.");
  }
  return output;
}

function normalizeEnv(env: unknown): Record<string, string> {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  return Object.fromEntries(Object.entries(env as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
}

function resolveToolArg(directory: string, arg: string): string {
  return arg.startsWith("./") || arg.startsWith("../") ? path.join(directory, arg) : arg;
}

function validateTemplateArgs(args: string[], schema: Record<string, unknown>, definitionPath: string) {
  const properties = schema.parameters && typeof schema.parameters === "object" && !Array.isArray(schema.parameters)
    ? (schema.parameters as { properties?: unknown }).properties
    : undefined;
  const names = properties && typeof properties === "object" && !Array.isArray(properties) ? new Set(Object.keys(properties)) : new Set<string>();
  for (const arg of args) {
    if (arg.startsWith("$")) {
      if (!isKnownToolRuntimeTemplate(arg)) {
        throw new Error(`unknown tool runtime template ${arg}: ${definitionPath}. Available templates: ${NDX_TOOL_RUNTIME_ARG_NAMES.join(", ")}`);
      }
      continue;
    }
    for (const match of arg.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
      const name = match[1] ?? "";
      if (!names.has(name)) {
        throw new Error(`tool arg template {${name}} is not declared in schema properties: ${definitionPath}`);
      }
    }
  }
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT");
}

function isKnownToolRuntimeTemplate(value: string): boolean {
  return isToolRuntimeArgName(value);
}
