import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { REGISTER_HEADERS, requestRegisterCells } from "../src/lib/request-register";
import type { FinanceRequest } from "../src/lib/types";

const request = {
 id: "request", reference_code: "AEA-2627-0001", title: '=HYPERLINK("https://evil.example","x")',
 amount: "123.45", status: "SUBMITTED", source_folder_url: "https://drive.google.com/drive/folders/abcdefghijk",
 updated_at: "2026-10-03T01:00:00Z", created_at: "2026-10-03T00:00:00Z",
} as FinanceRequest;
test("register records literal applicant text, numeric money, readable status and safe requirement links", () => {
 const cells = requestRegisterCells(request, "http://localhost:3000", "Department: ACADS");
 assert.equal(cells.length, 6);
 assert.equal(cells[1].userEnteredValue?.stringValue, request.title);
 assert.equal(cells[2].userEnteredValue?.numberValue, 123.45);
 assert.equal(cells[3].userEnteredValue?.stringValue, "Submitted");
 assert.equal(cells[0].userEnteredFormat?.textFormat?.link?.uri, "http://localhost:3000/requests/request");
 assert.equal(cells[5].userEnteredFormat?.textFormat?.link?.uri, request.source_folder_url);
 assert.throws(() => requestRegisterCells({ ...request, status: "DRAFT" }, "https://aea.example"), /submitted/);
 assert.throws(() => requestRegisterCells({ ...request, source_folder_url: "https://evil.example/drive/folders/abcdefghijk" }, "https://aea.example"));
});

async function loadWriter() {
 const compiled = await build({ entryPoints: ["src/lib/google-sheets.ts"], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "sheets-test", setup(b) {
  b.onResolve({ filter: /^(server-only|googleapis)$/ }, (args) => ({ path: args.path, namespace: "sheets-test" }));
  b.onLoad({ filter: /.*/, namespace: "sheets-test" }, (args) => ({ contents: args.path === "server-only" ? "export {};" : "export const google={};", loader: "js" }));
 } }] });
 const module = { exports: {} as { writeRegisterRequest: (...args: any[]) => Promise<number> } };
 new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
 return module.exports.writeRegisterRequest;
}
test("Sheets retries update the same reference, follow sorted rows, reject mismatched headers and duplicates", async () => {
 const write = await loadWriter();
 let rows: any[][] = [REGISTER_HEADERS];
 let writes = 0;
 let leaseChecks = 0;
 let headers = REGISTER_HEADERS;
 const api = { spreadsheets: {
  get: async () => ({ data: { sheets: [{ properties: { sheetId: 0, title: "Finance's Requests", gridProperties: { rowCount: 10 } } }] } }),
  values: { get: async ({ range }: { range: string }) => {
   assert(range.startsWith("'Finance''s Requests'!"));
   if (range.endsWith("A1:F1")) return { data: { values: [headers] } };
   const match = /A(\d+):([AF])(\d+)$/.exec(range)!;
   return { data: { values: rows.slice(Number(match[1])-1, Number(match[3])).map((r) => match[2] === "A" ? [r[0]] : r) } };
  } },
  batchUpdate: async ({ requestBody }: any) => {
   const update = requestBody.requests.find((r: any) => r.updateCells).updateCells;
   rows[update.range.startRowIndex] = update.rows[0].values.map((c: any) => c.userEnteredValue.stringValue ?? c.userEnteredValue.numberValue);
   writes++;
  },
 } };
 const beforeWrite = async () => { leaseChecks++; };
 assert.equal(await write(api, request, "https://aea.example", "", beforeWrite), 2);
 assert.equal(await write(api, { ...request, status: "APPROVED" }, "https://aea.example", "", beforeWrite), 2);
 assert.equal(rows.length, 2);
 assert.equal(rows[1][3], "Approved");
 rows = [REGISTER_HEADERS, ["AEA-OTHER"], rows[1]];
 assert.equal(await write(api, request, "https://aea.example", "", beforeWrite), 3);
 rows.push([...rows[2]]);
 await assert.rejects(write(api, request, "https://aea.example", "", beforeWrite), /Duplicate/);
 rows.pop(); headers = ["Wrong"];
 await assert.rejects(write(api, request, "https://aea.example", "", beforeWrite), /headers/);
 assert.equal(writes, 3); assert.equal(leaseChecks, 3);
});
