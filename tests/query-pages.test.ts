import { test } from "node:test";
import assert from "node:assert/strict";
import { queryPages } from "../src/lib/query-pages";
import { requestSummaryAccumulator } from "../src/lib/request-reports";
import { csvRow } from "../src/lib/csv";
import type { RequestType } from "../src/lib/types";

test("batched totals include rows beyond a server cap and fail on partial reads", async () => {
  const records = Array.from({ length: 1203 }, () => ({
    request_type_id: "type",
    status: "APPROVED" as const,
    amount: "0.01",
  }));
  const summary = requestSummaryAccumulator([{ id: "type" } as RequestType]);
  let queries = 0;
  for await (const batch of queryPages(async (from, to) => {
    queries++;
    return {
      data: records.slice(from, Math.min(to + 1, from + 73)),
      error: null,
    };
  }, "Read failed"))
    summary.add(batch);
  assert.equal(summary.values()[0].count, 1203);
  assert.equal(summary.values()[0].amount, 1203n);
  assert.equal(queries, 18);
  const failed = queryPages(
    async () => ({ data: null, error: { code: "42501" } }),
    "Read failed",
  );
  await assert.rejects(failed.next(), /Read failed/);
});
test("CSV streaming rows preserve quotes, newlines and formula protection", () => {
  assert.equal(
    csvRow(['="formula"', "line\nnext", 'literal "quote"', "12.25"]),
    '"\'=""formula""","line\nnext","literal ""quote""","12.25"\r\n',
  );
});
