import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

const state = globalThis as typeof globalThis & { __gmailTest: any };
const sdk = `
const s=()=>globalThis.__gmailTest;
class OAuth2 {
 constructor(options){s().oauthOptions=options;}
 setCredentials(credentials){s().credentials=credentials;}
 async getAccessToken(){return {token:'test-access'};}
 async getTokenInfo(){return {email:s().sender,scopes:['https://www.googleapis.com/auth/gmail.send']};}
 async generateCodeVerifierAsync(){return {codeVerifier:'test-verifier',codeChallenge:'test-challenge'};}
 generateAuthUrl(options){s().authOptions=options;return 'https://accounts.google.com/o/oauth2/auth?state='+options.state;}
 async getToken(options){s().exchanges++;s().exchangeOptions=options;return {tokens:{access_token:'test-access',refresh_token:'test-refresh',id_token:'test-id',scope:s().scope,expiry_date:Date.now()+3600000}};}
 async verifyIdToken(){return {getPayload:()=>({email:s().sender,email_verified:true})};}
}
export const google={auth:{OAuth2},gmail:()=>({users:{messages:{async send(options){s().sends++;s().raw=options.requestBody.raw;if(s().fail)throw Error('secret-token-DO-NOT-LOG');return {data:{id:'gmail-message'}};}}}})};`;

async function load(entry: string) {
  const mocks: Record<string, string> = {
    "server-only": "export {};", "googleapis": sdk,
    "./supabase/server": "export const serviceClient=()=>globalThis.__gmailTest.db;",
    "./auth": "export const session=async()=>({role:globalThis.__gmailTest.role,user:{id:'admin'}});",
    "next/headers": "export const cookies=async()=>globalThis.__gmailTest.jar;",
    "next/server": "export const NextResponse={redirect:url=>new Response(null,{status:302,headers:{location:url}})};",
    "node:fs/promises": `export const readFile=async()=> 'OTHER_SETTING=keep\\nGOOGLE_GMAIL_REFRESH_TOKEN=\\n';export const writeFile=async(path,content,options)=>globalThis.__gmailTest.saved={path,content,options};export const rename=async()=>{};export const unlink=async()=>{};`,
  };
  const compiled = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "gmail-fixtures", setup(b) {
    b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "gmail-fixtures" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "gmail-fixtures" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }] });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

const request = { id: "request", reference_code: "AEA-2627-0001", fiscal_year_id: "year", department_id: "dept", requester_user_id: "requester", title: "A <request>", amount: "100.25", status: "APPROVED", notes: "INTERNAL_OCFO private comment", created_at: "2026-10-04T00:00:00Z" };
function initialize() {
  const cookie = new Map<string, string>();
  const logs: any[] = [];
  state.__gmailTest = { sender: "aea.college.org@student.ateneo.edu", scope: "https://www.googleapis.com/auth/gmail.send openid email", role: "CFO_ADMIN", sends: 0, exchanges: 0,
    jar: { get: (name: string) => cookie.has(name) ? { value: cookie.get(name) } : undefined, set: (name: string, value: string) => cookie.set(name, value) },
    db: { from(table: string) {
      let insertion = false, update: any;
      const q: any = { select: () => q, eq: () => q,
        insert(value: any) { logs.push(value); insertion = true; return q; },
        update(value: any) { logs.push(value); update = value; return q; },
        single: async () => ({ data: insertion ? { id: "notification" } : state.__gmailTest.user, error: null }),
        then(resolve: any) { return Promise.resolve({ error: state.__gmailTest.logFailure ? {} : null, data: update }).then(resolve); },
      }; return q;
    } }, user: { email: "requester@gmail.com", full_name: "<Requester>" }, logs };
}

test("Gmail notifications use the stored requester, concise escaped content, and safe SENT/FAILED logging", async () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, { GOOGLE_GMAIL_CLIENT_ID: "test-client", GOOGLE_GMAIL_CLIENT_SECRET: "test-secret", GOOGLE_GMAIL_REDIRECT_URI: "http://localhost:3000/api/google/gmail/callback", GOOGLE_GMAIL_REFRESH_TOKEN: "test-refresh", GOOGLE_GMAIL_SENDER: "aea.college.org@student.ateneo.edu", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    const notifications = await load("src/lib/gmail-notifications.ts");
    for (const event of ["APPROVED", "REJECTED", "NEEDS_REVISION"]) {
      initialize();
      const result = await notifications.sendDecisionNotification(event, request);
      assert.equal(result.ok, true);
      assert.equal(state.__gmailTest.sends, 1);
      const mime = Buffer.from(state.__gmailTest.raw, "base64url").toString();
      assert.match(mime, /From: AEA Finance <aea.college.org@student.ateneo.edu>/);
      assert.match(mime, /To: requester@gmail.com/);
      const plain = mime.match(/Content-Type: text\/plain;[^]*?\r\n\r\n([^]*?)\r\n--/)?.[1];
      assert(plain);
      const decoded = Buffer.from(plain, "base64").toString("utf8");
      assert(decoded.includes("₱100.25"));
      assert(decoded.includes("A <request>"));
      assert(!decoded.includes("private comment"));
      assert.equal(state.__gmailTest.logs[0].event_type, "REQUEST_" + event);
      assert.equal(state.__gmailTest.logs[1].delivery_status, "SENT");
      assert.equal(state.__gmailTest.logs[1].provider_message_id, "gmail-message");
      const message = notifications.decisionEmail(event, request, "<Requester>", "http://localhost:3000");
      assert(!JSON.stringify(message).includes("private comment"));
      assert(message.html.includes("&lt;Requester&gt;"));
    }
    initialize(); state.__gmailTest.fail = true;
    assert.equal((await notifications.sendDecisionNotification("REJECTED", request)).ok, false);
    assert.equal(state.__gmailTest.logs[1].delivery_status, "FAILED");
    assert(!JSON.stringify(state.__gmailTest.logs).includes("secret-token"));
    initialize(); state.__gmailTest.user = null;
    assert.equal((await notifications.sendDecisionNotification("APPROVED", request)).ok, false);
    assert.equal(state.__gmailTest.sends, 0);
    assert.equal(state.__gmailTest.logs[1].delivery_status, "FAILED");
    initialize(); state.__gmailTest.sender = "admin-personal@gmail.com";
    assert.equal((await notifications.sendDecisionNotification("APPROVED", request)).ok, false);
    assert.equal(state.__gmailTest.sends, 0);
    const gmail = await load("src/lib/gmail.ts");
    process.env.GOOGLE_GMAIL_SENDER = "javier.macasaet@student.ateneo.edu";
    initialize(); state.__gmailTest.sender = process.env.GOOGLE_GMAIL_SENDER;
    assert.equal((await notifications.sendDecisionNotification("APPROVED", request)).ok, true);
    assert.match(Buffer.from(state.__gmailTest.raw, "base64url").toString(), /From: AEA Finance <javier.macasaet@student.ateneo.edu>/);
    initialize(); // The old organization's token cannot send for the testing account.
    assert.equal((await notifications.sendDecisionNotification("APPROVED", request)).ok, false);
    assert.equal(state.__gmailTest.sends, 0);
    assert.throws(() => gmail.encodeMimeMessage({ to: "requester@gmail.com", subject: "Subject\r\nBcc:evil@example.com", html: "body" }), /headers/);
  } finally { process.env = previous; delete state.__gmailTest; }
});

test("one-time Gmail OAuth verifies Admin, state, PKCE, identity and scopes without exposing tokens", async () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "development", GOOGLE_GMAIL_CLIENT_ID: "test-client", GOOGLE_GMAIL_CLIENT_SECRET: "test-secret", GOOGLE_GMAIL_REDIRECT_URI: "http://localhost:3000/api/google/gmail/callback", GOOGLE_GMAIL_SENDER: "aea.college.org@student.ateneo.edu" });
    const authorize = await load("src/app/api/google/gmail/authorize/route.ts");
    const callback = await load("src/app/api/google/gmail/callback/route.ts");
    initialize(); state.__gmailTest.role = "DEPARTMENT_MEMBER";
    assert.equal((await authorize.GET()).status, 403);
    assert.equal(state.__gmailTest.exchanges, 0);
    initialize(); await authorize.GET();
    assert.equal(state.__gmailTest.authOptions.access_type, "offline");
    assert.equal(state.__gmailTest.authOptions.prompt, "consent");
    assert.equal(state.__gmailTest.authOptions.code_challenge_method, "S256");
    let response = await callback.GET(new Request("http://localhost:3000/api/google/gmail/callback?code=code&state=wrong"));
    assert.equal(response.status, 400); assert.equal(state.__gmailTest.exchanges, 0);
    assert.match(await response.text(), /same regular browser/);
    initialize(); await authorize.GET();
    const expired = JSON.parse(state.__gmailTest.jar.get("aea-gmail-setup").value);
    expired.expires = Date.now() - 1;
    state.__gmailTest.jar.set("aea-gmail-setup", JSON.stringify(expired));
    response = await callback.GET(new Request(`http://localhost:3000/api/google/gmail/callback?code=code&state=${state.__gmailTest.authOptions.state}`));
    assert.equal(response.status, 400); assert.equal(state.__gmailTest.exchanges, 0);
    initialize(); await authorize.GET();
    state.__gmailTest.sender = "wrong@gmail.com";
    response = await callback.GET(new Request(`http://localhost:3000/api/google/gmail/callback?code=code&state=${state.__gmailTest.authOptions.state}`));
    assert.equal(response.status, 400); assert(!state.__gmailTest.saved);
    assert.match(await response.text(), /Wrong Google account selected/);
    initialize(); await authorize.GET(); state.__gmailTest.scope = "openid email";
    response = await callback.GET(new Request(`http://localhost:3000/api/google/gmail/callback?code=code&state=${state.__gmailTest.authOptions.state}`));
    assert.equal(response.status, 400); assert(!state.__gmailTest.saved);
    assert.match(await response.text(), /send permission was not granted/);
    initialize(); await authorize.GET();
    response = await callback.GET(new Request(`http://localhost:3000/api/google/gmail/callback?code=code&state=${state.__gmailTest.authOptions.state}`));
    assert.equal(response.status, 200);
    assert.equal(state.__gmailTest.exchangeOptions.codeVerifier, "test-verifier");
    assert(state.__gmailTest.saved.content.includes("test-refresh"));
    assert(state.__gmailTest.saved.content.includes("OTHER_SETTING=keep"));
    assert(!(await response.text()).includes("test-refresh"));
    process.env.GOOGLE_GMAIL_SENDER = "javier.macasaet@student.ateneo.edu";
    initialize(); state.__gmailTest.sender = process.env.GOOGLE_GMAIL_SENDER;
    await authorize.GET();
    assert.equal(state.__gmailTest.authOptions.login_hint, process.env.GOOGLE_GMAIL_SENDER);
    response = await callback.GET(new Request(`http://localhost:3000/api/google/gmail/callback?code=code&state=${state.__gmailTest.authOptions.state}`));
    assert.equal(response.status, 200);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal((await authorize.GET()).status, 403);
  } finally { process.env = previous; delete state.__gmailTest; }
});
