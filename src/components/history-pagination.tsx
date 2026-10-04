import Link from "next/link";
export function HistoryPagination({
  href,
  year,
  page,
  count,
}: {
  href: string;
  year: string;
  page: number;
  count: number;
}) {
  if (count <= 50 && page === 1) return null;
  const destination = (next: number) =>
    `${href}?${new URLSearchParams({ year, page: String(next) })}`;
  return (
    <nav className="pagination" aria-label="History pages">
      <span>
        Page {page} of {Math.max(1, Math.ceil(count / 50))} · Up to 50 records
        per section
      </span>
      {page > 1 && (
        <Link className="button secondary" href={destination(page - 1)}>
          Previous
        </Link>
      )}
      {page * 50 < count && (
        <Link className="button secondary" href={destination(page + 1)}>
          Next
        </Link>
      )}
    </nav>
  );
}
