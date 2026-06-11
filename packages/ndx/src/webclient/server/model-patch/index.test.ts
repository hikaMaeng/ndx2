import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { analyzeModelFolderPatch, applyModelFolderPatch } from "./index.js";

const TEMPLATE = [
  "{{bos_token}}",
  "{%- set ndx_no_think = reasoning_effort is defined and reasoning_effort in ['none', 'minimal', 'low'] -%}",
  "{%- if add_generation_prompt and not ndx_no_think %}<think>{%- endif %}"
].join("\n");

test("applyModelFolderPatch writes NDX hub model.yaml without touching the raw model folder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ndx-model-patch-"));
  const modelFolder = path.join(root, "unsloth", "Step-3.7-Flash-GGUF");
  const hub = path.join(root, "hub", "models");
  await fs.mkdir(modelFolder, { recursive: true });
  await fs.writeFile(path.join(modelFolder, "Step-3.7-Flash-UD-Q5_K_M-00001-of-00004.gguf"), "", "utf8");

  try {
    const before = await analyzeModelFolderPatch(modelFolder, { template: TEMPLATE, lmStudioHubModelsPath: hub });
    assert.equal(before.status, "needs_patch");
    assert.equal(before.baseModelKey, "unsloth/Step-3.7-Flash-GGUF");
    assert.equal(before.aliasModelKey, "unsloth/step-3.7-flash-gguf-ndx");

    const after = await applyModelFolderPatch(modelFolder, { template: TEMPLATE, lmStudioHubModelsPath: hub });
    assert.equal(after.status, "patched");
    assert.equal(after.applied, true);
    assert.equal(await fs.stat(path.join(modelFolder, "model.yaml")).then(() => true).catch(() => false), false);

    const generated = await fs.readFile(path.join(hub, "unsloth", "step-3.7-flash-gguf-ndx", "model.yaml"), "utf8");
    assert.match(generated, /model: unsloth\/step-3\.7-flash-gguf-ndx/);
    assert.match(generated, /base:\n  - key: unsloth\/Step-3\.7-Flash-GGUF/);
    assert.match(generated, /sources:\n      - type: huggingface\n        user: unsloth\n        repo: Step-3\.7-Flash-GGUF/);
    assert.match(generated, /stopStrings: \[\]/);
    assert.match(generated, /ndx_no_think/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
