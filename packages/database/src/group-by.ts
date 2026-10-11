export const groupBy = <T, K extends string>(items: Iterable<T>, keyOf: (item: T) => K, include?: (item: T) => boolean) => {
  const groups = new globalThis.Map<K, T[]>();
  for (const item of items) {
    if (include && !include(item)) continue;
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
};
