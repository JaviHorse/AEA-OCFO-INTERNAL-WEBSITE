import { workspace } from "@/lib/data";
import { isFinance } from "@/lib/finance";
import { PageHeader, Panel } from "@/components/ui";
import { TransactionLedger } from "@/components/transaction-ledger";
import { TransactionForm } from "@/components/transaction-form";
export default async function Transactions({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Actual expenses and revenue. Separate, linked, and accountable."
      />
      <Panel title="Finance ledger" subtitle={w.year.label}>
        <TransactionLedger
          transactions={w.transactions}
          departments={w.departments}
          projects={w.projects}
          requests={w.requests}
          canVerify={!!w.yearRole && isFinance(w.yearRole) && !w.readOnly}
        />
      </Panel>
      {w.yearRole && isFinance(w.yearRole) && !w.readOnly && (
        <Panel
          title="Record an actual transaction"
          subtitle="The request, department, year, and project must match. OCFO recording requires CFO permission."
        >
          <TransactionForm
            yearId={w.year.id}
            departments={w.departments}
            requests={w.requests}
            projects={w.projects}
          />
        </Panel>
      )}
    </>
  );
}
