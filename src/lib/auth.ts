import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { serverClient, serviceClient } from "./supabase/server";
import { env } from "./env";
import { emailDomainAllowed } from "./email-access";
import { isAdmin } from "./permissions";
import type { Membership, Year, Role } from "./types";
export const session = cache(async function session() {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const admin = serviceClient();
  const [{ data: settings }, { data: year, error }] = await Promise.all([
    admin
      .from("organization_settings")
      .select("value")
      .eq("key", "allowed_email_domain")
      .maybeSingle(),
    admin.from("fiscal_years").select("*").eq("is_active", true).maybeSingle(),
  ]);
  const domain = settings?.value ?? env().ALLOWED_EMAIL_DOMAIN;
  if (!emailDomainAllowed(user.email, domain)) redirect("/access-denied");
  if (error)
    throw new Error(
      "Database setup is incomplete. Apply the migration and seed in supabase/.",
    );
  if (!year) redirect("/access-denied?reason=no-year");
  const { data: memberships, error: membershipError } = await admin
    .from("memberships")
    .select("*")
    .eq("fiscal_year_id", year.id)
    .eq("email", user.email!.toLowerCase())
    .eq("is_active", true)
    .order("id");
  if (membershipError) throw new Error("Membership lookup failed.");
  if (!memberships?.length) redirect("/register");
  const priority: Role[] = [
    "CFO_ADMIN",
    "OCFO_MEMBER",
    "DEPARTMENT_MEMBER",
    "PROJECT_MEMBER",
  ];
  const sorted = (memberships as Membership[]).sort(
    (a, b) => priority.indexOf(a.role) - priority.indexOf(b.role),
  );
  return {
    user,
    db,
    activeYear: year as Year,
    memberships: sorted,
    role: sorted[0].role,
  };
});
export const yearContext = cache(async function yearContext(id?: string) {
  const s = await session();
  const yearId = id ?? s.activeYear.id;
  if (yearId === s.activeYear.id) {
    return {
      ...s,
      year: s.activeYear,
      yearMemberships: s.memberships,
      yearRole: s.role,
      readOnly: s.activeYear.is_closed,
    };
  }
  const [{ data: year }, { data: memberships }] = await Promise.all([
    s.db.from("fiscal_years").select("*").eq("id", yearId).maybeSingle(),
    s.db
      .from("memberships")
      .select("*")
      .eq("fiscal_year_id", yearId)
      .eq("email", s.user.email!.toLowerCase())
      .eq("is_active", true)
      .order("id"),
  ]);
  if (!year) redirect("/dashboard");
  const list = (memberships ?? []) as Membership[];
  const priority: Role[] = [
    "CFO_ADMIN",
    "OCFO_MEMBER",
    "DEPARTMENT_MEMBER",
    "PROJECT_MEMBER",
  ];
  list.sort((a, b) => priority.indexOf(a.role) - priority.indexOf(b.role));
  return {
    ...s,
    year: year as Year,
    yearMemberships: list,
    yearRole: ["CFO_ADMIN", "OCFO_MEMBER"].includes(s.role)
      ? s.role
      : list[0]?.role,
    readOnly: (year as Year).is_closed,
  };
});
export async function requireFinance(yearId?: string, adminOnly = false) {
  const s = await yearContext(yearId);
  if (
    !s.yearRole ||
    !["CFO_ADMIN", "OCFO_MEMBER"].includes(s.yearRole) ||
    (adminOnly && s.yearRole !== "CFO_ADMIN")
  )
    throw new Error("You do not have permission for this action.");
  if (s.readOnly) throw new Error("This fiscal year is closed and read-only.");
  return s;
}
export async function requireAdminPage() {
  const s = await session();
  if (!isAdmin(s.role)) redirect("/dashboard");
  return s;
}
