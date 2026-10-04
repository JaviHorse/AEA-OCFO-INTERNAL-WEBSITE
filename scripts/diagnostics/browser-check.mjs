import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--disable-gpu", "--disable-software-rasterizer"],
});
await mkdir("artifacts", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3000/login", {
  waitUntil: "domcontentloaded",
});
console.log(
  "Login response:",
  page.url(),
  (await page.locator("body").innerText()).slice(0, 600),
);
await page.getByRole("button", { name: "Continue with Google" }).waitFor();
if (process.env.CAPTURE_SCREENSHOTS)
  await page.screenshot({
    path: "artifacts/login-desktop.png",
    fullPage: true,
    timeout: 10000,
  });
await page.setViewportSize({ width: 390, height: 844 });
if (process.env.CAPTURE_SCREENSHOTS)
  await page.screenshot({
    path: "artifacts/login-mobile.png",
    fullPage: true,
    timeout: 10000,
  });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
await page.goto("http://localhost:3000/dashboard");
await page.waitForURL("**/login");
await page.goto("http://localhost:3000/access-denied");
await page
  .getByRole("heading", { name: "Access needs a membership." })
  .waitFor();
console.log(
  JSON.stringify({
    loginRendered: true,
    unauthenticatedDashboardRedirect: true,
    accessDeniedRendered: true,
    mobileOverflow: overflow,
    pageErrors: errors,
  }),
);
await browser.close();
if (errors.length || overflow) process.exitCode = 1;
