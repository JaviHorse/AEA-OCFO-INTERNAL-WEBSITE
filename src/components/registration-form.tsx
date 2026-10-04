"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerAccount } from "@/app/register/actions";
import { Field } from "./ui";
export function RegistrationForm({ departments }: { departments: { id: string; code: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <form onSubmit={(event) => {
    event.preventDefault();
    const department = String(new FormData(event.currentTarget).get("department_id") ?? "");
    start(async () => {
      const result = await registerAccount(department);
      if (result.ok) { router.replace("/dashboard?welcome=1"); router.refresh(); }
      else setError(result.message);
    });
  }}>
    <Field label="Department" hint="Choose the department you belong to. Finance can correct it later if needed.">
      <select name="department_id" required defaultValue="">
        <option value="" disabled>Choose your AEA department</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
      </select>
    </Field>
    {error && <p role="alert" className="error-text">{error}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Creating account…" : "Create Account"}</button>
  </form>;
}
