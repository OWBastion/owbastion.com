export const hasOnlyUniqueQueryNames = (params: URLSearchParams, allowedNames: readonly string[]) => {
  const names = new Set<string>();
  params.forEach((_value, name) => names.add(name));
  return [...names].every((name) => allowedNames.includes(name) && params.getAll(name).length === 1);
};
