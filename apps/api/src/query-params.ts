export const hasOnlyUniqueQueryNames = (params: URLSearchParams, allowedNames: readonly string[]) => {
  const names = new Set<string>();
  params.forEach((_value, name) => names.add(name));
  return [...names].every((name) => allowedNames.includes(name) && params.getAll(name).length === 1);
};

export const parsePagination = (params: URLSearchParams, maxPageSize: number) => {
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  return Number.isInteger(page) && page > 0 && Number.isInteger(pageSize) && pageSize > 0 && pageSize <= maxPageSize
    ? { page, pageSize }
    : null;
};
