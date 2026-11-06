/**
 * Reads a filtered query page by page.
 *
 * PostgREST caps how many rows one response returns (1000 by default), so a
 * period with more transactions than that would be totalled from only the first
 * page. Report totals must never be silently short, so every range read walks
 * the pages until a short one arrives.
 */
export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<unknown>>,
): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < size) return rows;
  }
}
