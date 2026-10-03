import { readFile, readdir } from "node:fs/promises";
const secrets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_GMAIL_CLIENT_SECRET",
  "GOOGLE_GMAIL_REFRESH_TOKEN",
]
  .map((k) => process.env[k])
  .filter(Boolean);
try {
  const key = JSON.parse(await readFile("GDrive_key.json", "utf8"));
  secrets.push(key.private_key, key.private_key.replaceAll("\n", "\\n"));
} catch {}
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(path)));
    else if (/\.(js|json|html|map)$/.test(e.name)) out.push(path);
  }
  return out;
}
const files = await walk(".next/static");
let leaked = false;
for (const path of files) {
  const content = await readFile(path, "utf8");
  if (secrets.some((s) => s && content.includes(s))) {
    leaked = true;
    console.log(`Secret found in client asset: ${path}`);
  }
}
const ignore = await readFile(".gitignore", "utf8");
if (!ignore.includes(".env*") || !ignore.includes("GDrive_key"))
  throw new Error("Credential ignore rules are incomplete.");
console.log(
  leaked
    ? "FAILED: client assets contain a secret."
    : `PASS: ${files.length} client assets scanned; no configured server credentials found; credential files ignored.`,
);
if (leaked) process.exitCode = 1;
