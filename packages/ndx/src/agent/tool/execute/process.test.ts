import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runToolProcess, sanitizeToolOutputText } from "./process.js";
import type { NDXResolvedTool } from "../types.js";

test("sanitizeToolOutputText removes transport-hostile control output", () => {
  assert.equal(sanitizeToolOutputText("a\u001B[31mred\u001B[0m\rnext\u0000\u0007"), "ared\nnext");
});

test("runToolProcess sanitizes final protocol output and keeps a raw output artifact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tool-process-"));
  const tool = testTool(root, [
    "-e",
    "process.stdout.write(JSON.stringify({ type: 'result', success: true, output: 'green\\u001b[31m\\rpurple\\u0000done' }) + '\\n')"
  ]);

  const result = await runToolProcess(tool, {}, "control-output", { cwd: root, projectHome: root, timeoutMs: 5_000 });

  assert.equal(result.status, "success");
  assert.equal(result.success, true);
  assert.equal(result.output.includes("\u001B"), false);
  assert.equal(result.output.includes("\r"), false);
  assert.equal(result.output.includes("\u0000"), false);
  assert.match(result.output, /tool_transport_error: output_sanitized_control_characters/);
  assert.match(result.output, /raw_output_path:/);
  assert.equal(typeof result.raw_output_path, "string");
  assert.match(await fs.readFile(result.raw_output_path ?? "", "utf8"), /green/);
});

test("runToolProcess reports invalid protocol JSON with raw output path", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-tool-process-"));
  const tool = testTool(root, [
    "-e",
    "process.stdout.write('{\"type\":\"result\",\"success\":true,\"output\":\"bad' + String.fromCharCode(1) + '\"}\\n')"
  ]);

  const result = await runToolProcess(tool, {}, "invalid-json", { cwd: root, projectHome: root, timeoutMs: 5_000 });

  assert.equal(result.status, "protocol_error");
  assert.equal(result.success, false);
  assert.equal(result.tool_transport_error, "invalid_tool_protocol");
  assert.equal(typeof result.raw_output_path, "string");
  assert.match(result.output, /tool_transport_error: invalid_tool_protocol/);
  assert.match(result.output, /raw_output_path:/);
  assert.equal(result.output.includes(String.fromCharCode(1)), false);
});

function testTool(root: string, args: string[]): NDXResolvedTool {
  return {
    name: "test_process",
    source: "project",
    directory: root,
    definitionPath: path.join(root, "tool.json"),
    command: process.execPath,
    args,
    env: {},
    schema: { type: "function", name: "test_process", parameters: { type: "object", properties: {} } }
  };
}
