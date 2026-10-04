// Exercise real UI components/pages with isolated fixtures, without cloud writes
// or bypassing authentication in the application. Security runs in database.test.ts.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const fixturePath = resolve("tests/ui/fixtures.ts").replaceAll("\\", "/");
const result = await build({
  entryPoints: ["tests/ui/entry.tsx"],
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  format: "iife",
  define: {
    "process.env.NODE_ENV": '"development"',
    "process.env.GOOGLE_REQUESTS_SPREADSHEET_ID": '"fixture-register"',
    "process.env.GOOGLE_REQUESTS_SHEET_ID": '"0"',
  },
  plugins: [
    {
      name: "isolated-ux-fixtures",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(next\/link|next\/navigation|server-only|@\/app\/(actions|register\/actions)|@\/lib\/(data|auth|registration|google-drive|page-data))$/,
          },
          (args) => ({ path: args.path, namespace: "ux-fixture" }),
        );
        b.onLoad({ filter: /.*/, namespace: "ux-fixture" }, (args) => {
          if (args.path === "@/lib/page-data")
            return {
              contents: `import {getFixture} from ${JSON.stringify(fixturePath)};export const pageNumber=v=>Math.max(1,Number(v)||1);export const getRequestListData=async(p)=>{const w=getFixture();const records=w.requests.filter(r=>["APPROVED","PROCESSING","COMPLETED","REJECTED","NEEDS_REVISION"].includes(r.status)&&(!p.status||(p.status==="APPROVED"?["APPROVED","PROCESSING","COMPLETED"].includes(r.status):r.status===p.status)));return {...w,requests:records,page:1,count:records.length,queue:"decisions"};};export const getDashboardData=async()=>{const w=getFixture();return {...w,revisions:w.requests.filter(r=>r.status==="NEEDS_REVISION"),pending:w.requests.filter(r=>["SUBMITTED","UNDER_OCFO_REVIEW","READY_FOR_CFO","APPROVED","PROCESSING"].includes(r.status)).length,submitted:w.requests.filter(r=>r.status==="SUBMITTED").length,ready:w.requests.filter(r=>r.status==="READY_FOR_CFO").length,revisionCount:w.requests.filter(r=>r.status==="NEEDS_REVISION").length};};`,
              loader: "js",
              resolveDir: process.cwd(),
            };
          if (args.path === "server-only")
            return { contents: "export {};", loader: "js" };
          if (args.path === "next/link")
            return {
              contents:
                'import {createElement} from "react";export default function Link(props){return createElement("a",props,props.children);}',
              loader: "js",
              resolveDir: process.cwd(),
            };
          if (args.path === "next/navigation")
            return {
              contents: `export const usePathname=()=>new URLSearchParams(location.search).get('path')||'/dashboard';export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(url){window.__navigated=url;},replace(url){window.__navigated=url;},refresh(){window.__refreshed=true;}});export function notFound(){throw Error('Not found');}export function redirect(url){throw Error('Redirect: '+url);}`,
              loader: "js",
            };
          if (
            ["@/lib/data", "@/lib/auth", "@/lib/registration"].includes(
              args.path,
            )
          )
            return {
              contents: `import {getFixture} from ${JSON.stringify(fixturePath)};export const workspace=async()=>getFixture();export const session=async()=>getFixture();export const requireAdminPage=async()=>{const w=getFixture();if(!["CFO_ADMIN","OCFO_MEMBER"].includes(w.role))throw Error("Redirect: /dashboard");return w;};export const registrationContext=async()=>{const w=getFixture();return {...w,admin:w.db,reason:""};};`,
              loader: "ts",
              resolveDir: process.cwd(),
            };
          if (args.path === "@/lib/google-drive")
            return {
              contents:
                'export const driveClient=async()=>({email:"finance-integration@example.edu"});',
              loader: "js",
            };
          return {
            contents: `window.__actions=[];async function action(command,data){window.__actions.push({command,data});return {ok:true,id:'saved-request'};}export const saveRequest=data=>action('SAVE_REQUEST',data);export async function validateDriveAction(url){if(url.includes('empty'))return {ok:false,message:'This folder is empty. Add your required documents, then check it again.'};if(url.includes('inaccessible'))return {ok:false,message:'We couldn’t access this Google Drive folder. Check the link and sharing settings.'};return {ok:true,data:{name:'Supporting documents',files:[{name:'Invoice.pdf'},{name:'PDAF.pdf'}]}};}export const requestAction=(command,data)=>action(command,data);export const adminAction=(command,data)=>action(command,data);export const recordTransaction=data=>action('TRANSACTION',data);export const resolveIssue=data=>action('RESOLVE',data);export const submitReport=data=>action('REPORT',data);export const saveGuide=data=>action('GUIDE',data);export const retryRegisterSync=id=>action('RETRY_REGISTER',{id});export const manageRegisteredUser=data=>action("MANAGE_USER",data);export const registerAccount=department=>action("REGISTER",{department});export const signOut=()=>{};export const verifyRecord=(kind,id)=>action('VERIFY',{kind,id});`,
            loader: "js",
          };
        });
      },
    },
  ],
});
const css = (await readFile("src/app/globals.css", "utf8")).replace(
  '@import "tailwindcss";',
  "",
);
const server = createServer((req, res) => {
  if (req.url === "/fixture.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(result.outputFiles[0].contents);
  } else if (req.url === "/fixture.css") {
    res.setHeader("Content-Type", "text/css");
    res.end(css);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
    );
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.UX_BROWSER_PATH ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const passed = [];
await mkdir("artifacts/ux-review", { recursive: true });
async function open(query) {
  const params = new URLSearchParams(query);
  const paths = {
    dashboard: "/dashboard",
    wizard: "/requests/new",
    projects: "/projects",
    project: "/projects/project",
    departments: "/departments",
    department: "/departments/acads",
    profile: "/profile",
    reports: "/reports",
    detail: "/requests/request",
    admin: "/admin",
    guide: "/guide",
    requests: "/requests",
  };
  params.set("path", paths[params.get("page")] ?? "/dashboard");
  await page.goto(`${base}/?${params}`);
  await page.locator("main").waitFor();
}
async function noOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "viewport must not overflow",
  );
}
async function record(name) {
  passed.push(name);
  console.log(`PASS: ${name}`);
}
try {
  await open("page=dashboard&role=DEPARTMENT_MEMBER");
  await page.getByRole("heading", { name: "Welcome back, ACADS!" }).waitFor();
  const nav = await page
    .getByRole("navigation", { name: "Main navigation" })
    .innerText();
  for (const hidden of [
    "Transactions",
    "Reports",
    "Departments",
    "Administration",
  ])
    assert(!nav.includes(hidden));
  assert(nav.includes("Help & Requirements"));
  assert((await page.locator("main").innerText()).includes("₱52,500.00"));
  assert(!(await page.locator("main").innerText()).includes("CREA"));
  assert.equal(
    await page.getByRole("link", { name: "Fix Request", exact: true }).count(),
    1,
  );
  await page.screenshot({
    path: "artifacts/ux-review/department-dashboard.png",
    fullPage: true,
  });
  await noOverflow();
  await record(
    "A: applicant navigation, department budget, and actionable revision",
  );

  await open("page=wizard&role=DEPARTMENT_MEMBER");
  await page.getByRole("button", { name: /Reimbursement/ }).click();
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  assert.equal(
    await page.getByLabel("Department", { exact: true }).inputValue(),
    "ACADS",
  );
  await page.getByLabel("Amount (PHP)").fill("14999.99");
  await page.getByLabel("Short title / purpose").fill("Speaker reimbursement");
  assert(
    !(await page.getByLabel("Project (optional)").innerText()).includes("CREA"),
  );
  await page
    .getByRole("button", { name: "Continue", exact: false })
    .last()
    .click();
  await page.getByText("PDAF: Required for this amount.").waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByLabel("Amount (PHP)").fill("15000.00");
  await page
    .getByRole("button", { name: "Continue", exact: false })
    .last()
    .click();
  await page.getByText("PDAF: Not required for this amount.").waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /PDAF/ }).count(), 0);
  await page
    .getByLabel("Google Drive Folder URL")
    .fill("https://drive.google.com/drive/folders/empty");
  await page.getByRole("button", { name: "Check Folder", exact: true }).click();
  await page.getByText("This folder is empty.", { exact: false }).waitFor();
  await page
    .getByLabel("Google Drive Folder URL")
    .fill("https://drive.google.com/drive/folders/inaccessible");
  await page.getByRole("button", { name: "Check Folder", exact: true }).click();
  await page
    .getByText("We couldn’t access this Google Drive folder.", { exact: false })
    .waitFor();
  await page
    .getByLabel("Google Drive Folder URL")
    .fill("https://drive.google.com/drive/folders/valid-folder");
  await page.getByRole("button", { name: "Check Folder", exact: true }).click();
  await page.getByText("Folder accessible: Supporting documents").waitFor();
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  await page.screenshot({
    path: "artifacts/ux-review/request-review.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Submit Request", exact: true })
    .click();
  await page.waitForFunction(() => !!window.__navigated);
  const submission = await page.evaluate(
    () => window.__actions.find((a) => a.command === "SAVE_REQUEST").data,
  );
  assert.equal(submission.department_id, "acads");
  assert.equal(submission.project_id, "");
  assert.equal(submission.amount, "15000.00");
  assert.equal(submission.submit, true);
  await record(
    "B: guided reimbursement, optional project, exact PDAF threshold, folder failures and submit payload",
  );

  await open("page=detail&role=OCFO_MEMBER&status=UNDER_OCFO_REVIEW");
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await page.getByRole("checkbox", { name: /Invoice/ }).click();
  await page.waitForFunction(() =>
    window.__actions.some((a) => a.command === "VERIFY_DOCUMENT"),
  );
  await page.getByRole("tab", { name: "Messages", exact: true }).click();
  assert(
    await page
      .getByRole("radio", { name: /Internal Finance Note/ })
      .isChecked(),
  );
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Internal review only");
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.waitForFunction(() =>
    window.__actions.some((a) => a.command === "COMMENT"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__actions.find((a) => a.command === "COMMENT").data.visibility,
    ),
    "INTERNAL_OCFO",
  );
  await page.getByRole("radio", { name: /Message to Requester/ }).check();
  await page
    .getByLabel("Comment", { exact: true })
    .fill("Please replace your invoice");
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.waitForFunction(
    () => window.__actions.filter((a) => a.command === "COMMENT").length === 2,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__actions.filter((a) => a.command === "COMMENT")[1].data
          .visibility,
    ),
    "REQUESTER_VISIBLE",
  );
  await page.getByRole("tab", { name: "More Details", exact: true }).click();
  await page
    .locator("summary")
    .filter({ hasText: /^Finance Review$/ })
    .click();
  await page.getByLabel("Your review state").selectOption("REVIEWED");
  await page.getByRole("button", { name: "Save my review" }).click();
  await page.waitForFunction(() =>
    window.__actions.some((a) => a.command === "REVIEW"),
  );
  await record(
    "C: OCFO document verification, private default, requester message, and peer review",
  );

  await open("page=detail&role=DEPARTMENT_MEMBER&status=NEEDS_REVISION");
  await page.getByRole("heading", { name: "Speaker reimbursement" }).waitFor();
  assert(
    (await page.locator("main").innerText()).includes(
      "Please replace the invoice",
    ),
  );
  assert(
    !(await page.locator("main").innerText()).includes("Private review note"),
  );
  assert.equal(await page.getByRole("tab").count(), 0);
  assert.equal(
    await page.getByRole("link", { name: "Fix Request", exact: true }).count(),
    1,
  );
  await record(
    "D: revision explanation, direct fix action, and no internal notes in applicant UI",
  );

  await open("page=detail&role=CFO_ADMIN&status=READY_FOR_CFO&warnings=1");
  await page.getByRole("heading", { name: "Decision" }).waitFor();
  assert(
    (await page.getByRole("tabpanel").first().innerText()).includes(
      "Available After Approval",
    ),
  );
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert((await page.getByRole("dialog").innerText()).includes("₱7,500.00"));
  assert(
    await page.getByRole("button", { name: "Confirm decision" }).isDisabled(),
  );
  await page
    .getByLabel("Decision notes / override reason")
    .fill("CFO acknowledges the approved over-budget exception");
  await page.getByRole("button", { name: "Confirm decision" }).click();
  await page.waitForFunction(() =>
    window.__actions.some((a) => a.command === "TRANSITION"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__actions.find((a) => a.command === "TRANSITION").data.status,
    ),
    "APPROVED",
  );
  await record(
    "E: CFO review summary, exact budget warning, confirmation and required override note",
  );

  await open("page=detail&role=DEPARTMENT_MEMBER&status=COMPLETED");
  await page.getByRole("heading", { name: "Speaker reimbursement" }).waitFor();
  assert.equal(await page.locator(".status-progress li.done").count(), 3);
  assert.equal(
    await page.getByRole("link", { name: /Fix Request|Finish Draft/ }).count(),
    0,
  );
  await record("F: completed applicant timeline and no edit actions");

  await open("page=admin&role=CFO_ADMIN&tab=years");
  await page
    .getByRole("heading", { name: "Administration", exact: true })
    .waitFor();
  assert((await page.locator("main").innerText()).includes("Members"));
  await page
    .locator("summary")
    .filter({ hasText: /^\+ Create Year$/ })
    .click();
  await page.getByLabel("Academic year name").fill("AY 2027-2028");
  await page.getByLabel("Reference year code").fill("2728");
  await page.getByLabel("Start date", { exact: true }).fill("2027-06-01");
  await page.getByLabel("End date", { exact: true }).fill("2028-05-31");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await page.waitForFunction(() =>
    window.__actions.some((a) => a.command === "CREATE_YEAR"),
  );
  await open("page=admin&role=CFO_ADMIN&tab=types");
  await page
    .getByRole("heading", { name: "Administration", exact: true })
    .waitFor();
  assert(!(await page.locator("main").innerText()).includes("JSON"));
  await record(
    "G: academic-year setup labels, usable create form, and hidden unused workflow configuration",
  );

  await open("page=detail&role=CFO_ADMIN&status=READY_FOR_CFO&closed=1");
  await page.getByRole("heading", { name: "Speaker reimbursement" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Approve", exact: true }).count(),
    0,
  );
  await open(
    "page=requests&role=OCFO_MEMBER&status=READY_FOR_CFO&filter=READY_FOR_CFO",
  );
  await page.getByRole("link", { name: "Review", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Status", { exact: true }).count(), 0);
  await record(
    "closed-year action suppression and Finance inbox without decision statuses",
  );

  for (const content of ["dashboard", "guide", "requests"]) {
    await open(`page=${content}&role=CFO_ADMIN&empty=1`);
    await page.waitForFunction(
      () =>
        document
          .querySelector("main")
          ?.textContent?.includes("Loading fixture") === false,
    );
    assert.equal(
      await page.locator('main a[href*="/requests/new"]').count(),
      0,
      "Admins cannot see applicant filing links",
    );
  }
  await open("page=new&role=CFO_ADMIN");
  await page
    .getByRole("alert")
    .filter({ hasText: "Redirect: /requests" })
    .waitFor();
  await open("page=approvals&role=DEPARTMENT_MEMBER");
  await page
    .getByRole("alert")
    .filter({ hasText: "Redirect: /dashboard" })
    .waitFor();
  await open("page=approvals&role=CFO_ADMIN&status=APPROVED");
  await page.getByRole("link", { name: "View", exact: true }).waitFor();
  assert.deepEqual(
    await page
      .getByLabel("Status", { exact: true })
      .locator("option")
      .allTextContents(),
    ["All statuses", "Approved", "Rejected", "Incomplete"],
  );
  assert.deepEqual(await page.locator("form.table-filters [name]").evaluateAll(elements => elements.map(element => element.getAttribute("name"))),
    ["year", "status", "department", "type", "project"]);
  assert(!(await page.locator("main").innerText()).includes("Available After"));
  assert.equal(await page.locator("thead th").count(), 7);
  await page.screenshot({
    path: "artifacts/ux-review/approvals.png",
    fullPage: true,
  });
  await open("page=approvals&role=CFO_ADMIN&empty=1");
  await page.getByRole("heading", { name: "No decisions yet." }).waitFor();
  for (const status of ["APPROVED", "REJECTED", "NEEDS_REVISION"]) {
    await open(`page=requests&role=OCFO_MEMBER&status=${status}`);
    await page.getByRole("heading", { name: "No matching requests" }).waitFor();
    await open(`page=approvals&role=OCFO_MEMBER&status=${status}`);
    await page.getByRole("link", { name: "View", exact: true }).waitFor();
  }
  await open("page=approvals&role=CFO_ADMIN&status=SUBMITTED");
  await page.getByRole("heading", { name: "No matching requests" }).waitFor();
  await open("page=register&role=DEPARTMENT_MEMBER");
  await page
    .getByRole("heading", { name: "Create your AEA Finance account" })
    .waitFor();
  assert.equal(await page.getByLabel("Department", { exact: true }).count(), 1);
  assert.equal(await page.locator('select[name="role"]').count(), 0);
  await page.screenshot({
    path: "artifacts/ux-review/registration.png",
    fullPage: true,
  });
  await page.getByLabel("Department", { exact: true }).selectOption("acads");
  await page
    .getByRole("button", { name: "Create Account", exact: true })
    .click();
  await page.waitForFunction(
    () => window.__navigated === "/dashboard?welcome=1",
  );
  await record(
    "portal: registration, Admin filing suppression, approvals access and focused queue",
  );

  await open("page=guide&role=DEPARTMENT_MEMBER");
  await page
    .getByRole("heading", { name: "Help & Requirements", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Start Reimbursement", exact: true })
      .count(),
    0,
  );
  await page
    .locator("summary")
    .filter({ hasText: /^Reimbursement$/ })
    .click();
  await page
    .getByRole("link", { name: "Start Reimbursement", exact: true })
    .waitFor();
  await page.screenshot({
    path: "artifacts/ux-review/help-requirements.png",
    fullPage: true,
  });
  await open("page=reports&role=CFO_ADMIN");
  await page
    .getByRole("heading", { name: "By Request Type", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Department summaries", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Submit report", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Download Compilation" }).waitFor();
  const exportReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Compilation" }).click();
  const compilation = await exportReady;
  await compilation.saveAs("artifacts/ux-review/request-compilation.csv");
  const exportedRequests = await readFile(
    "artifacts/ux-review/request-compilation.csv",
    "utf8",
  );
  assert(exportedRequests.includes("Speaker reimbursement"));
  assert(exportedRequests.includes("Reimbursement"));

  assert.equal(await page.locator("main details").count(), 0);
  assert.equal(await page.locator("main a[href^=\"#type-\"]").count(), 0);
  await page.screenshot({
    path: "artifacts/ux-review/request-summaries.png",
    fullPage: true,
  });
  await open("page=requests&role=DEPARTMENT_MEMBER");
  await page.getByLabel("Status", { exact: true }).waitFor();
  assert.deepEqual(await page.locator("thead th").allTextContents(), [
    "Reference",
    "Request",
    "Amount",
    "Status",
    "Updated",
    "Action",
  ]);
  assert.equal(await page.getByLabel("Department", { exact: true }).count(), 0);
  await open("page=detail&role=DEPARTMENT_MEMBER&status=SUBMITTED");
  await page.getByRole("heading", { name: "Speaker reimbursement" }).waitFor();
  await page
    .locator("summary")
    .filter({ hasText: /^Documents$/ })
    .click();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  await open("page=dashboard&role=CFO_ADMIN");
  await page.getByRole("heading", { name: "To Review" }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Department Budgets", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("link", { name: "Transactions", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Request Overview" }).count(),
    0,
  );
  assert.equal(await page.locator(".queue-card").count(), 3);
  await page.screenshot({
    path: "artifacts/ux-review/admin-dashboard.png",
    fullPage: true,
  });
  await record(
    "simplicity: collapsed requirements and reports; six member columns; no member verification; reduced dashboards",
  );

  for (const [route, heading] of [
    ["projects", "Projects"],
    ["project", "Economics Week"],
    ["departments", "Departments"],
    ["department", "Academic Affairs"],
    ["profile", "My Account"],
  ]) {
    await open(`page=${route}&role=CFO_ADMIN`);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    await noOverflow();
  }
  for (const tab of [
    "members",
    "departments",
    "projects",
    "requirements",
    "settings",
    "notifications",
    "audit",
  ]) {
    await open(`page=admin&role=CFO_ADMIN&tab=${tab}`);
    await page
      .getByRole("heading", { name: "Administration", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await page.locator("main > .admin-tabs a").count(), 6);
  }
  await record(
    "page audit: projects, project detail, departments, department detail, profile, and all Administration groups render",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await open("page=dashboard&role=DEPARTMENT_MEMBER");
  await page.getByRole("heading", { name: "Welcome back, ACADS!" }).waitFor();
  await noOverflow();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Toggle navigation" })
      .getAttribute("aria-expanded"),
    "true",
  );
  await page
    .getByRole("button", { name: "Close navigation" })
    .click({ position: { x: 370, y: 400 } });
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
  );
  await page.screenshot({
    path: "artifacts/ux-review/department-mobile.png",
    fullPage: true,
  });
  await open("page=wizard&role=DEPARTMENT_MEMBER");
  await page.getByRole("button", { name: /Reimbursement/ }).waitFor();
  await noOverflow();
  await open("page=detail&role=DEPARTMENT_MEMBER&status=NEEDS_REVISION");
  await page.getByRole("heading", { name: "Speaker reimbursement" }).waitFor();
  await noOverflow();
  await record(
    "mobile dashboard, navigation, wizard, and timeline without viewport overflow",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/ux-review/results.json",
    JSON.stringify(
      {
        passed,
        errors,
        note: "Real UI pages/components tested with isolated data/action fixtures; no cloud writes.",
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
