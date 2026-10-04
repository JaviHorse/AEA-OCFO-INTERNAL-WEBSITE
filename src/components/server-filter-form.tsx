"use client";
import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
export function ServerFilterForm({ children }: { children: React.ReactNode }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  return (
    <form
      className="table-filters"
      onSubmit={(e) => {
        e.preventDefault();
        const query = new URLSearchParams();
        for (const [key, value] of new FormData(e.currentTarget))
          if (String(value)) query.set(key, String(value));
        start(() => router.push(`${path}?${query}`));
      }}
    >
      {children}
      <button className="button secondary" disabled={pending}>
        {pending ? "Loading..." : "Apply filters"}
      </button>
    </form>
  );
}
