import { workspace } from "@/lib/data";
import { PageHeader, Panel } from "@/components/ui";
import { isAdmin } from "@/lib/permissions";
export default async function Profile() {
  const w = await workspace(undefined, ["departments"]);
  const { data: profile } = await w.db
    .from("users")
    .select("full_name,email")
    .eq("id", w.user.id)
    .maybeSingle();
  return (
    <>
      <PageHeader title="My Account" />
      <Panel title="Profile">
        <dl className="detail-list">
          <div>
            <dt>Name</dt>
            <dd>
              {profile?.full_name ??
                w.user.user_metadata.full_name ??
                "AEA member"}
            </dd>
          </div>
          <div>
            <dt>Google account email</dt>
            <dd>{w.user.email}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>
              {w.departments
                .filter((d) =>
                  w.memberships.some((m) => m.department_id === d.id),
                )
                .map((d) => `${d.name} (${d.code})`)
                .join(" / ")}
            </dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd>{isAdmin(w.role) ? "Finance Administrator" : "Member"}</dd>
          </div>
        </dl>
        <p>
          Need to change departments?{" "}
          <a
            className="text-link"
            href="mailto:aea.college.org@student.ateneo.edu"
          >
            Contact Finance.
          </a>
        </p>
      </Panel>
    </>
  );
}
