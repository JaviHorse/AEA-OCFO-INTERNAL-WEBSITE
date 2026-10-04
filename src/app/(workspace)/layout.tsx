import { session } from "@/lib/auth";
import { referenceData } from "@/lib/data";
import { Shell } from "@/components/shell";
import type { Year } from "@/lib/types";
export const maxDuration = 60;
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await session();
  const [{ data: years, error }, { data: departments }] = await Promise.all([
    referenceData(s.activeYear.id, "years"),
    referenceData(s.activeYear.id, "departments"),
  ]);
  if (error) throw new Error("Fiscal years could not be loaded.");
  return (
    <Shell
      role={s.role}
      years={years as Year[]}
      name={s.user.user_metadata.full_name ?? s.user.email!.split("@")[0]}
      email={s.user.email!}
      department={
        (departments ?? [])
          .filter((d) => s.memberships.some((m) => m.department_id === d.id))
          .map((d) => d.code)
          .join(" / ") || "Your department"
      }
    >
      {children}
    </Shell>
  );
}
