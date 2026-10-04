"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { registrationContext } from "@/lib/registration";

export async function registerAccount(departmentId: string) {
  const s = await registrationContext();
  if (s.reason) return { ok: false, message: s.reason };
  const department = z.uuid().safeParse(departmentId);
  if (!department.success) return { ok: false, message: "Choose your AEA department." };
  const { error } = await s.db.rpc("register_member", {
    department_id: department.data,
    full_name: s.user.user_metadata.full_name ?? s.user.user_metadata.name ?? s.user.email!.split("@")[0],
    avatar_url: s.user.user_metadata.avatar_url ?? null,
  });
  if (error) return { ok: false, message: "We couldn’t create your account. Refresh this page and try again, or contact Finance if access was already assigned." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Account created." };
}
