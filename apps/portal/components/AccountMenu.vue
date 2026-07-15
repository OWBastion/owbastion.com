<script setup lang="ts">
import type { CurrentPlayer } from "~/composables/usePortalApi";

const props = defineProps<{ player: CurrentPlayer["player"] }>();
const emit = defineEmits<{ logout: [] }>();
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);

function close(returnFocus = false) {
  open.value = false;
  if (returnFocus) nextTick(() => trigger.value?.focus());
}

function toggle() {
  open.value = !open.value;
  if (open.value) nextTick(() => panel.value?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
}

function handlePointerDown(event: PointerEvent) {
  if (open.value && !(event.target instanceof Node && panel.value?.parentElement?.contains(event.target))) close();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) close(true);
}

function selectItem() {
  close();
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
  <div class="account-menu">
    <button ref="trigger" class="account-trigger" type="button" aria-label="打开账户菜单" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
      <span class="account-avatar" aria-hidden="true">{{ props.player.playerName.slice(0, 1) }}</span>
    </button>
    <div v-show="open" ref="panel" class="account-panel" role="menu" aria-label="账户菜单">
      <div class="account-identity"><AppIcon name="user" /><strong>{{ props.player.playerName }}#{{ props.player.playerId }}</strong></div>
      <div class="account-divider" role="separator" />
      <NuxtLink to="/me" class="account-menu-item" role="menuitem" @click="selectItem"><AppIcon name="user" /><span>我的</span></NuxtLink>
      <NuxtLink to="/me#appearance" class="account-menu-item" role="menuitem" @click="selectItem"><AppIcon name="settings" /><span>设置</span></NuxtLink>
      <button class="account-menu-item account-menu-logout" type="button" role="menuitem" @click="emit('logout'); close()"><AppIcon name="logout" /><span>退出</span></button>
    </div>
  </div>
</template>

<style scoped>
.account-menu { position: relative; }
.account-trigger { display: grid; width: 36px; height: 36px; place-items: center; padding: 0; border: 1px solid var(--line-strong); border-radius: 50%; color: var(--accent); background: var(--accent-surface); transition: transform 120ms ease, border-color 160ms ease; }
.account-trigger:hover, .account-trigger[aria-expanded="true"] { border-color: var(--accent); }
.account-trigger:active { transform: scale(.96); }
.account-avatar { font-size: .85rem; font-weight: 720; letter-spacing: -.04em; }
.account-panel { position: absolute; z-index: 30; top: calc(100% + 10px); right: 0; display: grid; width: min(270px, calc(100vw - 28px)); gap: 3px; padding: 9px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface-raised); box-shadow: 0 8px 18px -8px var(--shadow); transform-origin: top right; animation: account-menu-in 150ms ease-out; }
.account-identity { display: flex; min-height: 38px; align-items: center; gap: 10px; padding: 4px 9px 8px; color: var(--text); font-size: .78rem; }
.account-identity strong { overflow-wrap: anywhere; font-weight: 680; }
.account-divider { height: 1px; margin: 1px 0 4px; background: var(--line); }
.account-menu-item { display: flex; min-height: 42px; align-items: center; gap: 10px; width: 100%; padding: 0 9px; border: 0; border-radius: 8px; color: var(--muted); background: transparent; font-size: .8rem; text-decoration: none; text-align: left; }
.account-menu-item:hover, .account-menu-item:focus-visible { color: var(--text); background: var(--surface); outline: 0; }
.account-menu-logout { cursor: pointer; }
.account-menu-logout .app-icon { color: var(--danger); }
@keyframes account-menu-in { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) { .account-panel { animation: none; } }
</style>
