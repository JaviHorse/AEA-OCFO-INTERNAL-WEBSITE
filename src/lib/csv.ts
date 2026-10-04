export function csvRow(values: string[]) {
  return (
    values
      .map(
        (value) =>
          `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`,
      )
      .join(",") + "\r\n"
  );
}
