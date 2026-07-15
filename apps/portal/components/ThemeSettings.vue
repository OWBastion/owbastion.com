<script setup lang="ts">
import type { ThemePreference } from "~/composables/useTheme";

const { preference, setTheme } = useTheme();
const options: Array<{ value: ThemePreference; label: string; icon: "sun" | "moon" | "system" }> = [
  { value: "light", label: "浅色", icon: "sun" },
  { value: "dark", label: "深色", icon: "moon" },
  { value: "system", label: "跟随系统", icon: "system" },
];
</script>

<template>
  <div class="theme-settings" role="radiogroup" aria-label="主题设置">
    <button v-for="option in options" :key="option.value" class="theme-option" :class="{ active: preference === option.value }" type="button" role="radio" :aria-checked="preference === option.value" @click="setTheme(option.value)">
      <AppIcon :name="option.icon" />
      <span class="theme-option-copy"><strong>{{ option.label }}</strong></span>
      <AppIcon v-if="preference === option.value" class="theme-check" name="check" />
    </button>
  </div>
</template>

<style scoped>
.theme-settings { display: inline-flex; max-width: 100%; gap: 3px; padding: 3px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-raised); }
.theme-option { display: inline-flex; min-height: 40px; align-items: center; gap: 7px; padding: 0 11px; border: 0; border-radius: 7px; color: var(--muted); background: transparent; font-size: .78rem; text-align: left; transition: background 160ms ease, color 160ms ease, transform 120ms ease; }
.theme-option:hover, .theme-option:focus-visible { color: var(--text); background: var(--surface); outline: 0; }
.theme-option:active { transform: scale(.98); }
.theme-option.active { color: var(--text); background: var(--surface); box-shadow: 0 1px 3px -2px var(--shadow); }
.theme-option > .app-icon { width: 16px; height: 16px; color: var(--accent); }
.theme-option-copy strong { font-size: .78rem; font-weight: 680; white-space: nowrap; }
.theme-check { width: 14px; height: 14px; color: var(--accent); }
@media (max-width: 430px) { .theme-settings { display: flex; width: 100%; }.theme-option { flex: 1; justify-content: center; padding-inline: 7px; }.theme-option-copy strong { font-size: .74rem; } }
</style>
