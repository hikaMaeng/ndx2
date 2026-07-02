import assert from "node:assert/strict";
import test from "node:test";
import { projectNameForVSCode, vscodeFileUriForPath } from "./path.js";

const workspace = {
  hostRoot: "F:/dev/ndx2/volume",
  hostWorkspaceRoot: "F:/dev/ndx2/volume/workspace",
  containerWorkspaceRoot: "/ndx/workspace"
};

test("projectNameForVSCode maps container project paths to host workspace paths", () => {
  assert.equal(projectNameForVSCode("/ndx/workspace/test1", workspace), "F:/dev/ndx2/volume/workspace/test1");
});

test("vscodeFileUriForPath creates a VS Code file protocol URI for host project paths", () => {
  assert.equal(
    vscodeFileUriForPath("/ndx/workspace/project with #hash", workspace),
    "vscode://file/F:/dev/ndx2/volume/workspace/project%20with%20%23hash"
  );
});
