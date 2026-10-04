import pg from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) {
  console.log(
    "DATABASE_URL is not configured; apply migration 007 through Supabase SQL editor.",
  );
  process.exitCode = 1;
} else {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
  });
  try {
    await client.connect();
    await client.query(
      await readFile(
        "supabase/migrations/007_confidential_budgets.sql",
        "utf8",
      ),
    );
    console.log(
      "Migration 007 applied: confidential budgets and audited CFO allocation controls.",
    );
  } catch (error) {
    console.error(
      "Migration 007 could not be applied:",
      error.code ?? "connection error",
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
