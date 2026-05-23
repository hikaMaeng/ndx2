import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export async function readContext() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

export function emitEffect(effect = { type: "noeffect" }) {
  process.stdout.write(`${JSON.stringify({ type: "result", success: true, output: normalizeEffect(effect) })}\n`);
}

export function emitFailure(message, output) {
  process.stdout.write(`${JSON.stringify({ type: "error", success: false, message, output })}\n`);
}

export function normalizeEffect(effect) {
  const type = effect.type === "stopturn" || effect.stopTurn ? "stopturn" : "noeffect";
  return { ...effect, type, stopTurn: type === "stopturn" };
}

export function stateDirectory(context) {
  const sessionid = context?.session?.sessionid || "unknown-session";
  return path.join(context.projectHome || process.cwd(), ".ndx", "hook-state", sessionid);
}

export async function readState(context) {
  try {
    return JSON.parse(await fs.readFile(path.join(stateDirectory(context), "state.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeState(context, state) {
  const directory = stateDirectory(context);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function runCommand(command, args, options = {}) {
  const startedAt = new Date().toISOString();
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      shell: false,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, options.timeoutMs || 60000);
    timeout.unref();
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ command: [command, ...args].join(" "), startedAt, endedAt: new Date().toISOString(), exitCode: null, stdout, stderr, error: error.message });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({ command: [command, ...args].join(" "), startedAt, endedAt: new Date().toISOString(), exitCode, signal, stdout, stderr });
    });
  });
}

export function compactOutput(text, max = 2400) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.floor(max / 2))}\n...[truncated]...\n${value.slice(-Math.floor(max / 2))}`;
}

export function stableFailureKey(result) {
  const output = `${result?.output || ""}\n${result?.stderrText || ""}\n${result?.stdoutText || ""}`.trim();
  const normalized = output
    .split(/\r?\n/)
    .map((line) => line.replace(/\d{4}-\d{2}-\d{2}T[^\s]+/g, "<timestamp>").replace(/\b\d+\b/g, "<n>").trim())
    .filter(Boolean)
    .slice(-12)
    .join("\n");
  return `${result?.tool || "unknown"}|${result?.status || "unknown"}|${normalized}`;
}

export function summarizeCommandFailure(result) {
  const text = `${result?.output || ""}\n${result?.stderrText || ""}\n${result?.stdoutText || ""}`;
  const dockerCopyMissing = text.match(/COPY\s+([^\s]+).*?not found|"(\/?dist\/[^"]+)": not found/is);
  const pnpMissing = text.match(/Missing package:\s*([^\n]+)/i);
  const invalidInput = text.match(/Invalid type for 'input'|invalid_union/i);
  if (dockerCopyMissing) {
    return {
      failingCommand: result?.tool || "tool",
      rootCause: "Docker build cannot find expected dist artifacts.",
      requiredNextAction: "Compare Dockerfile COPY paths with actual build output paths and fix the build context or COPY source.",
      evidence: compactOutput(text, 1200)
    };
  }
  if (pnpMissing) {
    return {
      failingCommand: result?.tool || "tool",
      rootCause: `Yarn Plug'n'Play cache is missing ${pnpMissing[1].trim()}.`,
      requiredNextAction: "Run yarn install --immutable before interpreting application build failures.",
      evidence: compactOutput(text, 1200)
    };
  }
  if (invalidInput) {
    return {
      failingCommand: result?.tool || "tool",
      rootCause: "Model adapter rejected the Responses input payload.",
      requiredNextAction: "Classify this as model-transport-failed, not as an application implementation failure.",
      evidence: compactOutput(text, 1200)
    };
  }
  return {
    failingCommand: result?.tool || "tool",
    rootCause: "Tool execution failed. Inspect the compact evidence before editing code.",
    requiredNextAction: "Identify the failing file or command from stderr/stdout, then make one targeted fix.",
    evidence: compactOutput(text, 1600)
  };
}
