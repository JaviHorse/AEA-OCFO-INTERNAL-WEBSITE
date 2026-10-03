import Link from "next/link";
export default function NotFound() {
  return (
    <main className="center-page">
      <section className="panel denied">
        <h1>This record isn’t available.</h1>
        <p>It may be outside your department or fiscal-year access.</p>
        <Link className="button primary" href="/dashboard">
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
