import Projects from "../../src/app/(workspace)/projects/page";
import ProjectDetail from "../../src/app/(workspace)/projects/[id]/page";
import Departments from "../../src/app/(workspace)/departments/page";
import DepartmentDetail from "../../src/app/(workspace)/departments/[id]/page";
import Profile from "../../src/app/(workspace)/profile/page";
import Reports from "../../src/app/(workspace)/reports/page";
import Approvals from "../../src/app/(workspace)/approvals/page";
import NewRequest from "../../src/app/(workspace)/requests/new/page";
import Register from "../../src/app/register/page";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Shell } from "../../src/components/shell";
import { RequestForm } from "../../src/components/request-form";
import { RequestTable } from "../../src/components/request-table";
import Dashboard from "../../src/app/(workspace)/dashboard/page";
import RequestDetail from "../../src/app/(workspace)/requests/[id]/page";
import Admin from "../../src/app/(workspace)/admin/page";
import Guide from "../../src/app/(workspace)/guide/page";
import { getFixture } from "./fixtures";
function FixtureApp() {
  const [content, setContent] = useState<React.ReactNode>(null);
  const [error, setError] = useState("");
  const w = getFixture();
  const params = new URLSearchParams(location.search);
  useEffect(() => {
    const page = params.get("page") ?? "dashboard";
    const searchParams = Promise.resolve(Object.fromEntries(params));
    const load = async () => {
      if (page === "projects") return Projects({ searchParams });
      if (page === "project")
        return ProjectDetail({ params: Promise.resolve({ id: "project" }) });
      if (page === "departments") return Departments({ searchParams });
      if (page === "department")
        return DepartmentDetail({
          params: Promise.resolve({ id: "acads" }),
          searchParams,
        });
      if (page === "profile") return Profile();
      if (page === "reports") return Reports({ searchParams });
      if (page === "approvals") return Approvals({ searchParams });
      if (page === "new") return NewRequest({ searchParams });
      if (page === "register") return Register();
      if (page === "dashboard") return Dashboard({ searchParams });
      if (page === "detail")
        return RequestDetail({
          params: Promise.resolve({ id: "request" }),
          searchParams,
        });
      if (page === "guide") return Guide({ searchParams });
      if (page === "admin") return Admin({ searchParams });
      if (page === "requests")
        return (
          <RequestTable
            requests={w.requests as any}
            queue={w.role === "DEPARTMENT_MEMBER" ? "all" : "inbox"}
            departments={w.departments}
            types={w.requestTypes as any}
            projects={w.projects as any}
            finance={w.role !== "DEPARTMENT_MEMBER"}
            initialStatus={params.get("filter") ?? ""}
            yearId={w.year.id}
          />
        );
      return (
        <RequestForm
          yearId={w.year.id}
          departments={w.departments}
          types={w.requestTypes as any}
          projects={w.projects as any}
          requirements={w.requirements as any}
          projectDepartments={w.projectDepartments}
          integrationEmail="finance-integration@example.edu"
        />
      );
    };
    load()
      .then(setContent)
      .catch((e) => setError(e.message));
  }, []);
  if (params.get("page") === "register")
    return (
      <>
        {error ? (
          <main>
            <p role="alert">{error}</p>
          </main>
        ) : (
          (content ?? <main>Loading fixture…</main>)
        )}
      </>
    );
  return (
    <Shell
      role={w.role as any}
      years={w.years}
      name="ACADS Officer"
      email="officer@example.edu"
      department={w.role === "DEPARTMENT_MEMBER" ? "ACADS" : "OCFO"}
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        (content ?? <p>Loading fixture…</p>)
      )}
    </Shell>
  );
}
createRoot(document.getElementById("root")!).render(<FixtureApp />);
