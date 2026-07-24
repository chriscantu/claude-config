export interface Page<T> {
  items: T[];
  pageNumber: number;
  totalPages: number;
}

/**
 * Return the 1-indexed page `pageNumber` of `all`, `pageSize` items per page.
 * Pages are 1-indexed: page 1 is the first `pageSize` items, i.e. all[0 .. pageSize).
 */
export function paginate<T>(all: T[], pageNumber: number, pageSize: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const start = pageNumber * pageSize;
  const items = all.slice(start, start + pageSize);
  return { items, pageNumber, totalPages };
}
