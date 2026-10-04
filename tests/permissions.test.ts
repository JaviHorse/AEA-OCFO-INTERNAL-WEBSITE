import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertCanFile,
  isAdmin,
  isRegisteredUser,
  productRole,
} from "../src/lib/permissions";
test("the two portal experiences do not grant legacy accounts additional privileges", () => {
  assert.equal(productRole("CFO_ADMIN"), "ADMIN");
  assert.equal(productRole("OCFO_MEMBER"), "ADMIN");
  assert.equal(productRole("DEPARTMENT_MEMBER"), "REGISTERED_USER");
  for (const role of ["CFO_ADMIN", "OCFO_MEMBER"] as const) {
    assert.equal(isAdmin(role), true);
    assert.throws(() => assertCanFile(role), /cannot submit/);
  }
  assert.equal(isRegisteredUser("PROJECT_MEMBER"), false);
  assert.throws(() => assertCanFile("PROJECT_MEMBER"), /registered department/);
  assert.doesNotThrow(() => assertCanFile("DEPARTMENT_MEMBER"));
});
