import { session } from "@/lib/auth";
import { Shell } from "@/components/shell";
import type { Year } from "@/lib/types";
export const maxDuration = 60;
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await session();
  const { data: years, error } = await s.db
    .from("fiscal_years")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw new Error("Fiscal years could not be loaded.");
  return (
    <Shell
      role={s.role}
      years={years as Year[]}
      name={s.user.user_metadata.full_name ?? s.user.email!.split("@")[0]}
      email={s.user.email!}
    >
      {children}
    </Shell>
  );
}
