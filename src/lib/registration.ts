import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { serverClient, serviceClient } from "./supabase/server";

export const registrationContext = cache(async () => {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login?register=1");
  const admin = serviceClient();
  const [years, memberships] = await Promise.all([
    admin.from("fiscal_years").select("*").eq("is_active", true).maybeSingle(),
    admin
      .from("memberships")
      .select("*")
      .eq("email", user.email?.toLowerCase() ?? ""),
  ]);
  if (years.error || memberships.error)
    throw new Error(
      "Registration settings could not be loaded. Contact Finance.",
    );
  const year = years.data;
  if (
    year &&
    memberships.data?.some((m) => m.fiscal_year_id === year.id && m.is_active)
  )
    redirect("/dashboard");
  const eligible =
    user.email?.toLowerCase().split("@")[1] === "student.ateneo.edu" &&
    user.app_metadata.provider === "google";
  const reason = !eligible
    ? "Self-registration requires an Ateneo Google account. Contact Finance about access for an enrolled Gmail account."
    : memberships.data?.length
      ? "Your account already has a membership. Contact Finance to restore access or assign your department for the current fiscal year."
      : !year || year.is_closed
        ? "Finance needs to open an active fiscal year before you can register."
        : "";
  return { db, admin, user, year, reason };
});
