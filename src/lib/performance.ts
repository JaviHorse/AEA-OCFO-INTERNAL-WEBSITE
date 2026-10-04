import "server-only";

// Opt in locally with PERF_TIMING=1. Labels never contain IDs, filters or bodies.
export async function withTiming<T>(
  label: string,
  work: () => PromiseLike<T>,
): Promise<T> {
  if (process.env.NODE_ENV === "production" || process.env.PERF_TIMING !== "1")
    return await work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    console.info(
      `[perf] ${label}: ${(performance.now() - start).toFixed(1)}ms`,
    );
  }
}
export const timedDatabaseFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const match = url.pathname.match(
    /\/(rest\/v1|auth\/v1)\/(?:rpc\/)?([a-z_]+)$/,
  );
  return withTiming(
    match
      ? `supabase.${match[1].startsWith("auth") ? "auth" : url.pathname.includes("/rpc/") ? "rpc" : "query"}.${match[2]}`
      : "supabase.http",
    // Never retain an authenticated response in Next's persistent fetch cache.
    // A deadline also prevents an unavailable backend from holding a worker open.
    () =>
      fetch(input, {
        ...init,
        cache: "no-store",
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      }),
  );
};
