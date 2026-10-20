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
    :content="{ align: 'end', side: 'bottom', sideOffset: 8, collisionPadding: 12 }"
    :ui="{
      content: 'portal-menu-surface theme-menu-content elevation-2 min-w-40',
      item: 'min-h-11 items-center gap-2.5 px-2.5 py-0',
    }"
  >
    <UButton :icon="currentIcon" color="neutral" variant="outline" :aria-label="`当前主题：${currentLabel}，打开主题菜单`" />
  </UDropdownMenu>
</template>
