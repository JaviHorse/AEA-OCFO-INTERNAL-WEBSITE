import "server-only";
import { z } from "zod";
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  RESEND_API_KEY: z.string().min(5).optional(),
  ALLOWED_EMAIL_DOMAIN: z.string().default("student.ateneo.edu"),
  FINANCE_NOTIFICATION_EMAIL: z.email(),
});
export function env() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      `Integration configuration is incomplete: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}.`,
    );
  return parsed.data;
}
