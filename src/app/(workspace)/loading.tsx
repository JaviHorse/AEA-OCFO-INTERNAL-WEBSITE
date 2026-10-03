export default function Loading() {
  return (
    <div aria-label="Loading finance workspace">
      <div className="skeleton" style={{ height: 70, marginBottom: 25 }} />
      <div className="loading-grid">
        {[1, 2, 3, 4].map((n) => (
          <div className="skeleton" key={n} />
        ))}
      </div>
    </div>
  );
}
