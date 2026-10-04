"use client";
import { useState } from "react";
export function LoginButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <form
      action="/auth/sign-in"
      method="post"
      onSubmit={() => setLoading(true)}
    >
      <button type="submit" className="google-button" disabled={loading}>
        <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.35Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.96-.9 6.61-2.42l-3.23-2.5c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.13H3.07v2.59A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.71 9.4 5.95 12 5.95Z"
          />
        </svg>
        {loading ? "Connecting…" : label}
      </button>
    </form>
  );
}
