<script setup lang="ts">
import type { ThemePreference } from "~/composables/useTheme";

const { preference, setTheme } = useTheme();
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const options: Array<{ value: ThemePreference; label: string; icon: "sun" | "moon" | "system" }> = [
  { value: "light", label: "浅色", icon: "sun" },
  { value: "dark", label: "深色", icon: "moon" },
  { value: "system", label: "跟随系统", icon: "system" },
];

const currentIcon = computed(() => options.find((option) => option.value === preference.value)?.icon ?? "system");
const currentLabel = computed(() => options.find((option) => option.value === preference.value)?.label ?? "主题");

function close(returnFocus = false) {
  open.value = false;
  if (returnFocus) nextTick(() => trigger.value?.focus());
}

function toggle() {
  open.value = !open.value;
  if (open.value) nextTick(() => panel.value?.querySelector<HTMLElement>("[role=menuitemradio]")?.focus());
}

function chooseTheme(value: ThemePreference) {
  setTheme(value);
  close(true);
}

function handlePointerDown(event: PointerEvent) {
  if (open.value && !(event.target instanceof Node && panel.value?.parentElement?.contains(event.target))) close();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) close(true);
}

onMounted(() => {
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handlePointerDown);
  document.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="theme-menu">
    <button ref="trigger" class="theme-trigger" type="button" :aria-label="`当前主题：${currentLabel}，打开主题菜单`" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
      <AppIcon :name="currentIcon" />
    </button>
    <div v-show="open" ref="panel" class="theme-panel" role="menu" aria-label="主题菜单">
      <button v-for="option in options" :key="option.value" class="theme-option" type="button" role="menuitemradio" :aria-checked="preference === option.value" @click="chooseTheme(option.value)">
        <AppIcon :name="option.icon" />
        <span>{{ option.label }}</span>
        <AppIcon v-if="preference === option.value" class="theme-check" name="check" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-menu { position: relative; }
.theme-trigger { display: grid; width: 36px; height: 36px; place-items: center; padding: 0; border: 1px solid var(--line-strong); border-radius: 50%; color: var(--muted); background: transparent; transition: color 160ms ease, border-color 160ms ease, background 160ms ease, transform 120ms ease; }
.theme-trigger:hover, .theme-trigger[aria-expanded="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-surface); }
.theme-trigger:active { transform: scale(.96); }
.theme-trigger .app-icon { width: 17px; height: 17px; }
.theme-panel { position: absolute; z-index: 30; top: calc(100% + 10px); right: 0; display: grid; width: 156px; gap: 3px; padding: 6px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface-raised); box-shadow: 0 8px 18px -8px var(--shadow); transform-origin: top right; animation: theme-menu-in 150ms ease-out; }
.theme-option { display: flex; min-height: 38px; align-items: center; gap: 9px; padding: 0 9px; border: 0; border-radius: 7px; color: var(--muted); background: transparent; font-size: .77rem; text-align: left; }
.theme-option:hover, .theme-option:focus-visible { color: var(--text); background: var(--surface); outline: 0; }
.theme-option > .app-icon { width: 16px; height: 16px; color: var(--accent); }
.theme-option span { flex: 1; white-space: nowrap; }
.theme-check { width: 14px !important; height: 14px !important; }
@keyframes theme-menu-in { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) { .theme-panel { animation: none; } }
</style>
