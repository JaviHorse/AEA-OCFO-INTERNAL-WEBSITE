import Link from "next/link";
import { registrationContext } from "@/lib/registration";
import { RegistrationForm } from "@/components/registration-form";
import { signOut } from "@/app/actions";
export default async function Register() {
  const s = await registrationContext();
  const { data: departments, error } = s.reason
    ? { data: [], error: null }
    : await s.admin
        .from("departments")
        .select("id,code,name")
        .eq("is_active", true)
        .order("code");
  if (error)
    throw new Error("Departments could not be loaded. Please try again.");
  return (
    <main className="account-page">
      <section className="account-card">
        <Link className="text-link" href="/login">
          AEA Finance
        </Link>
        <h1>Create your AEA Finance account</h1>
        <dl className="detail-list">
          <div>
            <dt>Name</dt>
            <dd>
              {s.user.user_metadata.full_name ??
                s.user.user_metadata.name ??
                "AEA member"}
            </dd>
          </div>
          <div>
            <dt>Google account email</dt>
            <dd>{s.user.email}</dd>
          </div>
        </dl>
        {s.reason ? (
          <div className="alert" role="status">
            {s.reason}
            <p>
              <a
                className="text-link"
                href="mailto:aea.college.org@student.ateneo.edu"
              >
                Contact Finance
              </a>
            </p>
          </div>
        ) : (
          <RegistrationForm departments={departments ?? []} />
        )}
        <form action={signOut}>
          <button className="button secondary">
            Sign out / use another account
          </button>
        </form>
      </section>
    </main>
  );
}
