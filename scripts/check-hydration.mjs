// Exercise the real Next.js RSC boundary, not a client-only UI fixture.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const probe = createServer();
await new Promise((done) => probe.listen(0, "127.0.0.1", done));
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const root = resolve("artifacts/hydration");
await mkdir(`${root}/app`, { recursive: true });
await writeFile(`${root}/package.json`, JSON.stringify({ private: true }));
await writeFile(
  `${root}/next.config.mjs`,
  `export default {turbopack:{root:${JSON.stringify(process.cwd())}}};`,
);
await writeFile(
  `${root}/app/layout.jsx`,
  'export default function Layout({children}){return <html lang="en"><head><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E"/></head><body>{children}</body></html>;}',
);
await writeFile(
  `${root}/app/client.jsx`,
  `"use client";import {useState} from "react";import {Field} from "../../../src/components/field";export function Form({children}){const [saved,setSaved]=useState(false);return <form onSubmit={e=>{e.preventDefault();setSaved(true);}}>{children}<Field label="Client note"><textarea name="note"/></Field><button>Save</button>{saved&&<p role="status">Saved</p>}</form>;}`,
);
await writeFile(
  `${root}/app/page.jsx`,
  `import {Field} from "../../../src/components/field";import {Form} from "./client";export default function Page(){return <Form><Field label="Academic year name" hint="Enter the current year"><input name="label" placeholder="AY 2026-2027" required/></Field><Field label="Start date"><input name="start" type="date"/></Field><Field label="Department"><select name="department"><option>Finance</option></select></Field></Form>;}`,
);
let output = "";
const child = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    root,
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
child.stdout.on("data", (chunk) => {
  output = (output + chunk).slice(-12000);
});
child.stderr.on("data", (chunk) => {
  output = (output + chunk).slice(-12000);
});
let browser;
try {
  const url = `http://127.0.0.1:${port}`;
  let response;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error(`Next.js exited: ${output}`);
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) break;
    } catch {}
    await new Promise((done) => setTimeout(done, 300));
  }
  assert.ok(response?.ok, `Next.js did not start: ${output}`);
  const html = await response.text();
  assert.match(html, /Academic year name/);
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.UX_BROWSER_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
        : undefined),
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByLabel("Academic year name").fill("AY 2026-2027");
  await page.getByLabel("Start date").fill("2026-10-05");
  await page.getByLabel("Department").selectOption("Finance");
  await page.getByLabel("Client note").fill("Hydrated form");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  assert.deepEqual(errors, [], "Browser errors during Next.js SSR/hydration");
  assert.equal(
    await page
      .locator("label")
      .evaluateAll((labels) => labels.every((label) => Boolean(label.control))),
    true,
  );
  console.log(
    "PASS: real Next.js server/client fields hydrate without console errors; labels and form interaction work.",
  );
} finally {
  await browser?.close();
  child.kill();
  await new Promise((done) => {
    if (child.exitCode !== null) done();
    else child.once("exit", done);
  });
}
