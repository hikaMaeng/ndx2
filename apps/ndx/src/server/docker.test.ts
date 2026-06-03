import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Dockerfile copies builtin process tools to the bundled registry path", async () => {
  const dockerfile = await fs.readFile(path.resolve("docker/Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY packages\/ndx\/src\/agent\/tool\/base \.\/dist\/server\/base/);
  assert.doesNotMatch(dockerfile, /COPY packages\/ndx\/src\/agent\/tool\/base \.\/dist\/server\/basetools/);
});
