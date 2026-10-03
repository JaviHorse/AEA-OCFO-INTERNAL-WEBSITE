"use client";

export function RequestReportExport({ rows, year }: { rows: string[][]; year: string }) {
  function download() {
    const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const csv = "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `finance-requests-${year.replace(/[^a-zA-Z0-9-]/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <button className="button secondary" onClick={download}>Download Compilation</button>;
}
