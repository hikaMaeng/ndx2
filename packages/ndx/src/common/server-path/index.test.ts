import assert from "node:assert/strict";
import test from "node:test";
import { serverContainerNdxHome, serverContainerRoot, serverContainerUserHome, serverHostWorkspace, serverPathRelativeToWorkspace, toHostWorkspacePath, toServerContainerPath, toServerProjectPath, toServerReadableFilePath, toServerWorkspaceDescendantPath } from "./index.js";

test("server path mapping rewrites configured Windows volumes to container paths", () => {
  const map = {
    hostRoot: "F:/dev/ndx2/volume"
  };

  assert.equal(toServerProjectPath("F:\\dev\\ndx2\\volume\\workspace\\ndx2", map), "/ndx/workspace/ndx2");
  assert.equal(toServerProjectPath("F:/dev/ndx2/volume/workspace/ndx2/packages/ndx", map), "/ndx/workspace/ndx2/packages/ndx");
  assert.equal(toServerProjectPath("/mnt/f/dev/ndx2/volume/workspace/ndx2", map), "/ndx/workspace/ndx2");
  assert.equal(toServerContainerPath("F:\\dev\\ndx2\\volume\\.ndx\\tools\\now", map), "/ndx/.ndx/tools/now");
  assert.equal(serverContainerRoot(map), "/ndx");
  assert.equal(serverContainerUserHome(map), "/ndx");
  assert.equal(serverContainerNdxHome(map), "/ndx/.ndx");
  assert.equal(serverHostWorkspace(map), "F:/dev/ndx2/volume/workspace");
  assert.equal(serverPathRelativeToWorkspace("F:/dev/ndx2/volume/workspace/ndx2/packages/ndx", map), "ndx2/packages/ndx");
  assert.equal(toHostWorkspacePath("/ndx/workspace/ndx2/packages/ndx", map), "F:/dev/ndx2/volume/workspace/ndx2/packages/ndx");
});

test("server volume map keeps host root separate from container runtime root", () => {
  const previousNdxRoot = process.env.NDX_ROOT;
  const previousNdxHostRoot = process.env.NDX_HOST_ROOT;
  process.env.NDX_ROOT = "/ndx";
  process.env.NDX_HOST_ROOT = "F:/dev/ndx2/volume";

  try {
    assert.equal(serverHostWorkspace(), "F:/dev/ndx2/volume/workspace");
  } finally {
    if (previousNdxRoot === undefined) {
      delete process.env.NDX_ROOT;
    } else {
      process.env.NDX_ROOT = previousNdxRoot;
    }
    if (previousNdxHostRoot === undefined) {
      delete process.env.NDX_HOST_ROOT;
    } else {
      process.env.NDX_HOST_ROOT = previousNdxHostRoot;
    }
  }
});

test("server path mapping rejects Windows paths outside configured volumes", () => {
  assert.throws(
    () => toServerContainerPath("D:\\other\\project", { hostRoot: "F:/dev/ndx2/volume" }),
    /outside configured server volumes/
  );
  assert.throws(() => toServerWorkspaceDescendantPath("F:/dev/ndx2/volume/workspace", { hostRoot: "F:/dev/ndx2/volume" }), /under the workspace root/);
  assert.throws(() => toServerWorkspaceDescendantPath("/tmp/project"), /outside configured workspace volume/);
});

test("server readable file path maps Windows drive paths through the Docker Desktop host mount", () => {
  assert.equal(
    toServerReadableFilePath("C:\\Users\\hika0\\AppData\\Local\\Temp\\codex-clipboard.png", { hostRoot: "F:/dev/ndx2/volume" }),
    "/mnt/host/c/Users/hika0/AppData/Local/Temp/codex-clipboard.png"
  );
  assert.equal(
    toServerReadableFilePath("F:\\dev\\ndx2\\volume\\workspace\\ndx2\\image.png", { hostRoot: "F:/dev/ndx2/volume" }),
    "/ndx/workspace/ndx2/image.png"
  );
});
