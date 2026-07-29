<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

type ThemePreference = "light" | "dark" | "system";

const colorMode = useColorMode();
const hydrated = shallowRef(false);

const options: Array<{ value: ThemePreference; label: string; icon: string }> = [
  { value: "light", label: "浅色", icon: "i-lucide-sun" },
  { value: "dark", label: "深色", icon: "i-lucide-moon" },
  { value: "system", label: "跟随系统", icon: "i-lucide-monitor" },
];

const currentOption = computed(() => {
  if (!hydrated.value) return options[2]!;
  return options.find((option) => option.value === colorMode.preference) ?? options[2]!;
});

const currentLabel = computed(() => currentOption.value.label);
const currentIcon = computed(() => currentOption.value.icon);

const items = computed<DropdownMenuItem[][]>(() => [[
  ...options.map((option) => {
    const active = hydrated.value && colorMode.preference === option.value;
    return {
      label: option.label,
      icon: option.icon,
      trailingIcon: active ? "i-lucide-check" : undefined,
      onSelect: () => {
        colorMode.preference = option.value;
      },
    } satisfies DropdownMenuItem;
  }),
]]);

onMounted(() => {
  hydrated.value = true;
});
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', side: 'bottom', sideOffset: 10, collisionPadding: 12 }"
    :ui="{ content: 'theme-menu-content min-w-40', item: 'min-h-10' }"
  >
    <button
      class="theme-trigger hit-44 pressable"
      type="button"
      :aria-label="`当前主题：${currentLabel}，打开主题菜单`"
    >
      <UIcon :name="currentIcon" class="theme-trigger-icon" aria-hidden="true" />
    </button>
  </UDropdownMenu>
</template>

<style scoped>
.theme-trigger {
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  color: var(--muted);
  background: transparent;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}
.theme-trigger:hover,
.theme-trigger[data-state="open"],
.theme-trigger[aria-expanded="true"] {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-surface);
}
.theme-trigger-icon {
  width: 17px;
  height: 17px;
}
</style>
