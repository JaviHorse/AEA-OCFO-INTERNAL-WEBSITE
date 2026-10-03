import { test } from "node:test";
import assert from "node:assert/strict";
import { emailDomainAllowed } from "../src/lib/email-access";
test("email eligibility accepts Gmail and the configured domain with exact domain matching", () => {
  for (const email of ["member@student.ateneo.edu", "Personal@GMAIL.COM"])
    assert.equal(emailDomainAllowed(email, "student.ateneo.edu"), true);
  for (const email of [undefined, "member@yahoo.com", "x@gmail.com.evil.example", "x@fakegmail.com", "x@@gmail.com", "x @gmail.com"])
    assert.equal(emailDomainAllowed(email, "student.ateneo.edu"), false);
  assert.equal(emailDomainAllowed("x@custom.edu", "custom.edu"), true);
  assert.equal(emailDomainAllowed("x@gmail.com", "custom.edu"), true);
});
