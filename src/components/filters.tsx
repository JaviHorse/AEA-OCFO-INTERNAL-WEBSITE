"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Department } from "@/lib/types";
export function DepartmentFilter({
  departments,
}: {
  departments: Department[];
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select
      className="filter-select"
      aria-label="Filter department"
      value={params.get("department") ?? ""}
      onChange={(e) => {
        const q = new URLSearchParams(params);
        if (e.target.value) q.set("department", e.target.value);
        else q.delete("department");
        router.push(`${path}?${q}`);
      }}
    >
      <option value="">All departments</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.code} · {d.name}
        </option>
      ))}
    </select>
  );
}
