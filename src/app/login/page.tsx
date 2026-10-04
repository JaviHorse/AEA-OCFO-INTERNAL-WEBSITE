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
        <div className="welcome-brand">
          <AeaLogo />
          <span>ATENEO ECONOMICS ASSOCIATION</span>
        </div>
        <div className="welcome-message">
          <span className="welcome-kicker">
            A little brighter. A lot more AEA.
          </span>
          <h2>
            Big ideas.
            <br />
            <em>Bright futures.</em>
          </h2>
          <p>
            Your ideas move AEA forward.
            <br />
            Let&apos;s keep the finances moving, too.
          </p>
        </div>
        <div className="welcome-bottom">
          <span>Made for our community.</span>
          <MascotPair />
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
