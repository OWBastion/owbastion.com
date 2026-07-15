<script setup lang="ts">
import type { ThemePreference } from "~/composables/useTheme";

const { preference, setTheme } = useTheme();
const options: Array<{ value: ThemePreference; label: string; description: string; icon: "sun" | "moon" | "system" }> = [
  { value: "light", label: "浅色", description: "使用浅色界面", icon: "sun" },
  { value: "dark", label: "深色", description: "使用深色界面", icon: "moon" },
  { value: "system", label: "跟随系统", description: "根据设备设置切换", icon: "system" },
];
</script>

<template>
  <div class="theme-settings" role="radiogroup" aria-label="主题设置">
    <button v-for="option in options" :key="option.value" class="theme-option" :class="{ active: preference === option.value }" type="button" role="radio" :aria-checked="preference === option.value" @click="setTheme(option.value)">
      <AppIcon :name="option.icon" />
      <span class="theme-option-copy"><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
      <AppIcon v-if="preference === option.value" class="theme-check" name="check" />
    </button>
  </div>
</template>

<style scoped>
.theme-settings { display: grid; gap: 6px; width: min(100%, 560px); }
.theme-option { display: flex; min-height: 58px; align-items: center; gap: 12px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); background: var(--surface); text-align: left; transition: border-color 160ms ease, background 160ms ease, transform 120ms ease; }
.theme-option:hover, .theme-option:focus-visible { border-color: var(--line-strong); color: var(--text); background: var(--surface-raised); outline: 0; }
.theme-option:active { transform: scale(.99); }
.theme-option.active { border-color: color-mix(in oklch, var(--accent) 55%, var(--line)); color: var(--text); }
.theme-option > .app-icon { color: var(--accent); }
.theme-option-copy { display: grid; gap: 3px; flex: 1; }
.theme-option-copy strong { font-size: .82rem; font-weight: 680; }
.theme-option-copy small { color: var(--quiet); font-size: .73rem; }
.theme-check { color: var(--accent); }
</style>
