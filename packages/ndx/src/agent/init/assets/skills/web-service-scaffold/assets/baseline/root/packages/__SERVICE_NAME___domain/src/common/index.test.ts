import assert from "node:assert/strict";
import test from "node:test";
import { serviceDomain } from "./index.js";

test("service domain metadata is stable", () => {
  assert.equal(serviceDomain.service, "__SERVICE_NAME__");
  assert.equal(serviceDomain.packageName, "__DOMAIN_PACKAGE_NAME__");
});
