/** Iterate database pages without retaining previous batches in memory. */
export async function* queryPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  message: string,
  size = 500,
) {
  let offset = 0;
  for (;;) {
    const result = await read(offset, offset + size - 1);
    if (result.error) throw new Error(message);
    const rows = result.data ?? [];
    if (!rows.length) return;
    yield rows;
    // Honor servers configured with a smaller row cap rather than truncating.
    offset += rows.length;
  }
}
