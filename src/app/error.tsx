"use client";
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
        <h1>We couldn’t load this workspace.</h1>
        <p>
          Check that the database migration and seed have been applied and your
          active membership is configured.
        </p>
        <p className="muted">
          {process.env.NODE_ENV === "development"
            ? error.message
            : `Reference: ${error.digest ?? "unavailable"}`}
        </p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
