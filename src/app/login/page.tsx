import { LoginButton } from "@/components/login-button";
import { oauthErrorMessage } from "@/lib/oauth-errors";
import {
  Landmark,
  ArrowUpRight,
  ShieldCheck,
  FolderCheck,
  ChartNoAxesCombined,
} from "lucide-react";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Landmark size={24} />
          </span>
          <span>
            AEA<span className="brand-sub">FINANCE PLATFORM</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">ATENEO ECONOMICS ASSOCIATION</span>
          <h1>
            Good stewardship.
            <br />
            <em>Stronger possibilities.</em>
          </h1>
          <p>
            A shared home for your department’s finances. From the first request
            to the final reconciliation.
          </p>
          <div className="login-features">
            <span>
              <ChartNoAxesCombined /> Clear financial visibility
            </span>
            <span>
              <FolderCheck /> Documents, in one place
            </span>
            <span>
              <ShieldCheck /> Accountable at every step
            </span>
          </div>
        </div>
        <small>OFFICE OF THE CHIEF FINANCIAL OFFICER</small>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="eyebrow">WELCOME TO AEA FINANCE</span>
          <h2>Your work starts here.</h2>
          <p>
            Sign in with your Ateneo Google account to access your finance
            workspace.
          </p>
          {error && (
            <div className="alert critical">{oauthErrorMessage(error)}</div>
          )}
          <LoginButton />
          <div className="login-note">
            <ShieldCheck size={17} />
            <span>
              Available to authorized AEA members with an active fiscal-year
              membership.
            </span>
          </div>
          <a
            className="contact-link"
            href="mailto:aea.college.org@student.ateneo.edu"
          >
            Need access? Contact OCFO <ArrowUpRight size={14} />
          </a>
        </div>
        <small>AEA Finance · Built for continuity.</small>
      </section>
    </main>
  );
}
