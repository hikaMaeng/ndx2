import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Dockerfile copies builtin process tools to the bundled registry path", async () => {
  const dockerfile = await fs.readFile(path.resolve("docker/Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY packages\/ndx\/src\/agent\/tool\/base \.\/dist\/server\/base/);
  assert.doesNotMatch(dockerfile, /COPY packages\/ndx\/src\/agent\/tool\/base \.\/dist\/server\/basetools/);
});

test("local Dockerfile uses the file-backed base image tag", async () => {
  const dockerfile = await fs.readFile(path.resolve("docker/Dockerfile"), "utf8");

  assert.match(dockerfile, /ARG NDX2_BASE_IMAGE=ndx2-ndx-base:0\.2\.3/);
  assert.match(dockerfile, /FROM \$\{NDX2_BASE_IMAGE\}/);
  assert.doesNotMatch(dockerfile, /ndx2-runtime-base/);
});

test("npm release Dockerfile builds the single final image directly", async () => {
  const dockerfile = await fs.readFile(path.resolve("../../npm/Dockerfile"), "utf8");

  assert.match(dockerfile, /FROM pgvector\/pgvector:pg17/);
  assert.match(dockerfile, /COPY apps\/ndx\/dist \.\/dist/);
  assert.doesNotMatch(dockerfile, /ndx2-ndx-base/);
});
