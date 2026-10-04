import { requireAdminPage } from "@/lib/auth";
import { workspace } from "@/lib/data";
import { queryPages } from "@/lib/query-pages";
import { csvRow } from "@/lib/csv";
import { requestTypeLabel } from "@/lib/ux";
import { decisionLabel } from "@/lib/request-decisions";
import type { FinanceRequest } from "@/lib/types";
export const maxDuration = 60;

export async function GET(request: Request) {
  await requireAdminPage();
  const year = new URL(request.url).searchParams.get("year") ?? undefined;
  const w = await workspace(year, ["departments", "requestTypes"]);
  const departments = new Map(w.departments.map((d) => [d.id, d.code]));
  const types = new Map(w.requestTypes.map((t) => [t.id, requestTypeLabel(t)]));
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const pages = queryPages<
    Pick<
      FinanceRequest,
      | "id"
      | "request_type_id"
      | "reference_code"
      | "title"
      | "department_id"
      | "amount"
      | "status"
      | "submitted_at"
      | "created_at"
      | "updated_at"
      | "source_folder_url"
    >
  >(
    (from, to) =>
      w.db
        .from("requests")
        .select(
          "id,request_type_id,reference_code,title,department_id,amount,status,submitted_at,created_at,updated_at,source_folder_url",
        )
        .eq("fiscal_year_id", w.year.id)
        .neq("status", "DRAFT")
        .order("request_type_id")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
        .abortSignal(signal),
    "Request export could not be loaded.",
  );
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          "\uFEFF" +
            csvRow([
              "Academic year",
              "Request type",
              "Reference",
              "Request",
              "Department",
              "Amount (PHP)",
              "Decision",
              "Submitted",
              "Updated",
              "Requirements folder",
            ]),
        ),
      );
    },
    async pull(controller) {
      try {
        const next = await pages.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(
            next.value
              .map((r) =>
                csvRow([
                  w.year.label,
                  types.get(r.request_type_id) ?? "Archived request type",
                  r.reference_code ?? "",
                  r.title,
                  departments.get(r.department_id) ?? "Archived department",
                  String(r.amount),
                  decisionLabel(r.status) ||
                    (r.status === "CANCELLED"
                      ? "Withdrawn"
                      : "Awaiting decision"),
                  r.submitted_at ?? r.created_at,
                  r.updated_at ?? r.created_at,
                  r.source_folder_url ?? "",
                ]),
              )
              .join(""),
          ),
        );
      } catch {
        controller.error(new Error("Request export could not be loaded."));
      }
    },
    async cancel() {
      abort.abort();
      await pages.return();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-requests-${w.year.code.replace(/[^a-zA-Z0-9-]/g, "-")}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
