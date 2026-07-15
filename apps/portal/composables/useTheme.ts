import { computed, onBeforeUnmount, onMounted, readonly, watch } from "vue";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "owbastion-portal-theme";

export function useTheme() {
  const preference = useState<ThemePreference>("portal-theme-preference", () => "light");
  const resolvedTheme = computed(() => {
    if (preference.value !== "system") return preference.value;
    return import.meta.client && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  let mediaQuery: MediaQueryList | undefined;

  function applyTheme() {
    if (!import.meta.client) return;
    const root = document.documentElement;
    root.dataset.theme = preference.value;
    root.style.colorScheme = resolvedTheme.value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme.value === "dark" ? "#151a1b" : "#f5f4ef");
  }

  function setTheme(next: ThemePreference) {
    preference.value = next;
  }

  function handleSystemChange() {
    if (preference.value === "system") applyTheme();
  }

  onMounted(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") preference.value = stored;
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", handleSystemChange);
    applyTheme();
  });

  watch(preference, (next) => {
    if (!import.meta.client) return;
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme();
  });

  onBeforeUnmount(() => mediaQuery?.removeEventListener("change", handleSystemChange));

  return { preference: readonly(preference), resolvedTheme, setTheme };
}
