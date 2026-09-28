export const pageResult = <T>(items: T[], page: number, pageSize: number, total: number) => ({ contractVersion: "1" as const, items, page, pageSize, total, hasMore: page * pageSize < total });
export const paginate = <T>(items: T[], page: number, pageSize: number) => pageResult(items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, items.length);
