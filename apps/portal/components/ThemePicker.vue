<script setup lang="ts">
import type { ThemePreference } from "~/composables/useTheme";

const { preference, setTheme } = useTheme();

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];
</script>

<template>
  <label class="theme-picker">
    <span class="theme-picker-label">主题</span>
    <select :value="preference" aria-label="选择主题" @change="setTheme(($event.target as HTMLSelectElement).value as ThemePreference)">
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  </label>
</template>

<style scoped>
.theme-picker { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: .75rem; font-weight: 650; }
.theme-picker select { min-height: 34px; padding: 0 8px; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: var(--surface-raised); font-size: .75rem; }
.theme-picker-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
@media (max-width: 760px) { .theme-picker select { min-height: 40px; } }
</style>
