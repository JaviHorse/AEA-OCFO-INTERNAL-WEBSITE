import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cents,
  decimal,
  available,
  requiredDocuments,
  allowedTargets,
} from "../src/lib/finance";
import { extractDriveFolderId } from "../src/lib/drive-url";
import type { Requirement } from "../src/lib/types";
test("money arithmetic is exact and revenue does not inflate availability", () => {
  assert.equal(cents("0.10") + cents("0.20"), 30n);
  assert.equal(decimal(-12345n), "-123.45");
  assert.equal(available("1000.00", "100.01", "200.02"), "699.97");
  assert.throws(() => cents("1.001"));
  assert.throws(() => cents("NaN"));
});
test("PDAF activates strictly below 15000", () => {
  const req = {
    id: "pdaf",
    condition_type: "AMOUNT_LT",
    condition_json: { amount: 15000 },
  } as Requirement;
  assert.equal(requiredDocuments([req], "14999.99").length, 1);
  assert.equal(requiredDocuments([req], "15000").length, 0);
  assert.equal(requiredDocuments([req], "15000.01").length, 0);
});
test("CFO approval does not depend on unanimous OCFO review", () => {
  assert(allowedTargets("SUBMITTED", "CFO_ADMIN").includes("APPROVED"));
  assert(!allowedTargets("READY_FOR_CFO", "OCFO_MEMBER").includes("APPROVED"));
  assert(
    !allowedTargets("APPROVED", "DEPARTMENT_MEMBER").includes("CANCELLED"),
  );
  assert.deepEqual(allowedTargets("COMPLETED", "CFO_ADMIN"), []);
});
test("Drive links reject spoofed hosts, files, and insecure URLs", () => {
  assert.equal(
    extractDriveFolderId("https://drive.google.com/drive/folders/abcdefghijk"),
    "abcdefghijk",
  );
  assert.equal(
    extractDriveFolderId(
      "https://drive.google.com/drive/u/0/folders/abcdefghijk?usp=sharing",
    ),
    "abcdefghijk",
  );
  for (const url of [
    "https://drive.google.com.evil.test/drive/folders/abcdefghijk",
    "http://drive.google.com/drive/folders/abcdefghijk",
    "https://drive.google.com/file/d/abcdefghijk/view",
    "javascript:alert(1)",
  ])
    assert.throws(() => extractDriveFolderId(url));
});
