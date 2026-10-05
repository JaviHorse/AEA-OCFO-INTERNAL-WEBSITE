import Link from "next/link";
import { LoginButton } from "@/components/login-button";
import { oauthErrorMessage } from "@/lib/oauth-errors";
import { AeaLogo, MascotPair } from "@/components/aea-brand";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; register?: string }>;
}) {
  const { error, register } = await searchParams;
  return (
    <main className="account-page login-portal">
      <aside
        className="aea-welcome"
        aria-label="Welcome to the Ateneo Economics Association"
      >
        <div className="welcome-office">
          <MascotPair className="office-mascots" />
          <div>
            <span className="office-label">Office of the</span>
            <strong>Chief Financial Officer</strong>
            <span className="office-association">Ateneo Economics Association</span>
          </div>
        </div>
        <div className="welcome-message">
          <h2>
            Maximizing
            <br />
            <em>Finances</em>
            <br />
            <span className="welcome-with">with <span>AEA.</span></span>
          </h2>
          <p>
            Every request. Every decision. Moving AEA forward.
          </p>
        </div>
        <div className="welcome-bottom">
          <span className="welcome-signature">Built for our community.<span>Driven by accountability.</span></span>
          <div className="welcome-growth" aria-hidden="true"><i /><i /><i /><span>↗</span></div>
        </div>
      </aside>
      <section className="account-card">
        <div className="portal-logo">
          <AeaLogo />
          <span>FINANCE PORTAL</span>
        </div>
        <h1>{register ? "Register your account" : "Welcome to AEA Finance"}</h1>
        <p>
          {register
            ? "Verify your Ateneo email, then choose your department."
            : "Sign in to submit or review requests."}
        </p>
        {error && (
          <div className="alert critical" role="alert">
            {oauthErrorMessage(error)}
          </div>
        )}
        <LoginButton
          label={
            register
              ? "Continue with Ateneo Google Account"
              : "Continue with Google"
          }
        />
        <p className="subtle-note">
          {register
            ? "Choose your @student.ateneo.edu account. Existing registered accounts will open their dashboard."
            : "Use your Ateneo Google account or a Gmail account enrolled by Finance."}
        </p>
        {register ? (
          <p>
            <Link className="text-link" href="/login">
              Already registered? Back to sign in
            </Link>
          </p>
        ) : (
          <div className="registration-invite">
            <Link className="button secondary" href="/register">
              Register Your Account
            </Link>
          </div>
        )}
        <a
          className="text-link"
          href="mailto:aea.college.org@student.ateneo.edu"
        >
          Need help? Contact Finance
        </a>
      </section>
    </main>
  );
}
