"use client";
import { AeaLogo, MascotPair } from "@/components/aea-brand";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="center-page">
      <div className="panel denied">
        <AeaLogo />
        <h1>We couldn’t load this workspace.</h1>
        <p>Try again. If this continues, contact Finance.</p>
        {process.env.NODE_ENV === "development" ? (
          <details>
            <summary>Administrator diagnostics</summary>
            <p className="muted">{error.message}</p>
          </details>
        ) : (
          <p className="muted">Reference: {error.digest ?? "unavailable"}</p>
        )}
        <button className="button primary" onClick={reset}>
          Try again
        </button>
        <a
          className="button secondary"
          href="mailto:aea.college.org@student.ateneo.edu"
        >
          Contact Finance
        </a>
        <MascotPair className="account-mascots" />
      </div>
    </main>
  );
}
