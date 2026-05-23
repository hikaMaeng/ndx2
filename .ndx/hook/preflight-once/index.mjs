import fs from "node:fs/promises";
import path from "node:path";
import { compactOutput, emitEffect, readContext, readState, runCommand, writeState } from "./lib.mjs";

const context = await readContext();
const projectHome = context.projectHome || process.cwd();
const state = await readState(context);

if (state.preflight?.completed || context.iteration !== 1) {
  emitEffect({ type: "noeffect" });
  process.exit(0);
}

try {
  await fs.access(path.join(projectHome, "package.json"));
} catch {
  emitEffect({ type: "noeffect" });
  process.exit(0);
}

const commands = [
  ["yarn", ["install", "--immutable"], 120000],
  ["yarn", ["build"], 120000],
  ["npm", ["run", "deploy"], 180000]
];
const results = [];
for (const [command, args, timeoutMs] of commands) {
  const result = await runCommand(command, args, { cwd: projectHome, timeoutMs });
  results.push(result);
  if (result.exitCode !== 0) break;
}

state.preflight = {
  completed: true,
  results
};
await writeState(context, state);

const failed = results.find((result) => result.exitCode !== 0);
if (!failed) {
  emitEffect({
    type: "noeffect",
    appendMessages: [{
      role: "system",
      content: `PROJECT HOOK PREFLIGHT: baseline environment verification passed before implementation.\n${results.map((result) => `- ${result.command}: exit ${result.exitCode}`).join("\n")}`
    }]
  });
} else {
  emitEffect({
    type: "noeffect",
    appendMessages: [{
      role: "system",
      content: [
        "PROJECT HOOK PREFLIGHT: baseline verification failed before implementation. Fix this concrete blocker before broad feature work.",
        `failing command: ${failed.command}`,
        `exit code: ${failed.exitCode}`,
        "compact output:",
        compactOutput(`${failed.stderr}\n${failed.stdout}`, 2400)
      ].join("\n")
    }]
  });
}
