"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyRecord } from "@/app/actions";
export function VerifyRecord({
  kind,
  id,
}: {
  kind: "transaction" | "report";
  id: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button
        className="button secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await verifyRecord(kind, id);
            if (r.ok) router.refresh();
            else setError(r.message ?? "Verification failed.");
          })
        }
      >
        {pending ? "Verifying…" : "Verify record"}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
