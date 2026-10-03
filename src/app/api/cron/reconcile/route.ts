import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";
import { reconcileYear } from "@/lib/reconciliation";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`,
    provided = request.headers.get("authorization") ?? "";
  if (
    !process.env.CRON_SECRET ||
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: years, error } = await serviceClient()
    .from("fiscal_years")
    .select("id")
    .eq("is_closed", false);
  if (error)
    return NextResponse.json(
      { error: "Unable to load fiscal years." },
      { status: 500 },
    );
  try {
    const results = [];
    for (const y of years ?? []) results.push(await reconcileYear(y.id));
    return NextResponse.json({ ok: true, results });
  } catch {
    return NextResponse.json(
      {
        error:
          "Reconciliation failed. Check database and integration configuration.",
      },
      { status: 500 },
    );
  }
}
