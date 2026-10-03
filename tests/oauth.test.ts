import { test } from "node:test";
import assert from "node:assert/strict";
import { oauthErrorMessage, safeOauthErrorCode } from "../src/lib/oauth-errors";
import { classifyOauthError } from "../src/lib/oauth-errors";
test("Network transport failures do not masquerade as OAuth configuration errors", () => {
  assert.equal(
    classifyOauthError({ name: "AuthRetryableFetchError" }),
    "network",
  );
  assert.match(oauthErrorMessage("network"), /server could not reach Supabase/);
});
test("OAuth errors distinguish setup, denied access, and missing session cookies", () => {
  assert.match(oauthErrorMessage("pkce_verifier_missing"), /cookie is missing/);
  assert.match(
    oauthErrorMessage("pkce_code_verifier_not_found"),
    /cookie is missing/,
  );
  assert.equal(
    safeOauthErrorCode("pkce_code_verifier_not_found"),
    "pkce_code_verifier_not_found",
  );
  assert.match(oauthErrorMessage("database"), /migration and seed/);
  assert.match(
    oauthErrorMessage("access_denied"),
    /OAuth audience and test users/,
  );
  assert.match(oauthErrorMessage("missing_code"), /redirect URL/);
});
test("Untrusted provider details cannot become callback error codes or visible text", () => {
  assert.equal(safeOauthErrorCode("access_denied"), "access_denied");
  assert.equal(safeOauthErrorCode("secret-token&redirect=evil"), "oauth");
  assert(!oauthErrorMessage("secret-token").includes("secret-token"));
});
