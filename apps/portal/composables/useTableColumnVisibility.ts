type ColumnVisibility = Record<string, boolean>;

const storagePrefix = "owbastion:admin-table-columns:";

function isColumnVisibility(value: unknown): value is ColumnVisibility {
  return typeof value === "object" && value !== null && Object.values(value).every((entry) => typeof entry === "boolean");
}

export function useTableColumnVisibility(tableKey: string) {
  const visibility = ref<ColumnVisibility>({});
  const storageKey = `${storagePrefix}${tableKey}`;

  onMounted(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (isColumnVisibility(parsed)) visibility.value = parsed;
    } catch {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {}
    }
  });

  watch(visibility, (value) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  }, { deep: true });

  return visibility;
}
