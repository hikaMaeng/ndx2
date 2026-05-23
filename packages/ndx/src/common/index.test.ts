import assert from "node:assert/strict";
import test from "node:test";
import { ndxFilePath, normalizeWslPath, serviceDomain, uuid7 } from "./index.js";

test("service domain metadata is stable", () => {
  assert.equal(serviceDomain.service, "ndx");
  assert.equal(serviceDomain.packageName, "ndx");
});

test("common utilities expose ndx path helpers and uuid7", () => {
  assert.equal(normalizeWslPath("F:\\dev\\ndx2"), "/mnt/f/dev/ndx2");
  assert.equal(ndxFilePath("F:\\Users\\ndev", "system", "modelprompt"), "/mnt/f/Users/ndev/.ndx/system/modelprompt");
  assert.match(uuid7(), /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
