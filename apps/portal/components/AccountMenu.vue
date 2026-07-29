<script setup lang="ts">
import type { CurrentPlayer } from "~/composables/usePortalApi";
import type { DropdownMenuItem } from "@nuxt/ui";

const props = defineProps<{ player: CurrentPlayer["player"] }>();
const emit = defineEmits<{ logout: [] }>();

const items = computed<DropdownMenuItem[][]>(() => {
  const links: DropdownMenuItem[] = [
    { label: "我的", icon: "i-lucide-user", to: "/me" },
  ];
  if (props.player.isAdmin) {
    links.push({ label: "管理后台", icon: "i-lucide-settings-2", to: "/admin" });
  }
  links.push({ label: "设置", icon: "i-lucide-sliders-horizontal", to: "/me#appearance" });
  links.push({
    label: "退出",
    icon: "i-lucide-log-out",
    color: "error",
    onSelect: () => emit("logout"),
  });

  return [
    [{
      label: `${props.player.playerName}#${props.player.playerId}`,
      type: "label",
      icon: "i-lucide-user",
    }],
    links,
  ];
});
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', side: 'bottom', sideOffset: 10, collisionPadding: 12 }"
    :ui="{ content: 'portal-menu-surface account-menu-content min-w-56 origin-top-right', item: 'min-h-10' }"
  >
    <button class="account-trigger hit-44 pressable" type="button" aria-label="打开账户菜单">
      <span class="account-avatar" aria-hidden="true">{{ props.player.playerName.slice(0, 1) }}</span>
    </button>
  </UDropdownMenu>
</template>

<style scoped>
.account-trigger {
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  color: var(--accent);
  background: var(--accent-surface);
}
.account-trigger:hover,
.account-trigger[data-state="open"],
.account-trigger[aria-expanded="true"] {
  border-color: var(--accent);
}
.account-avatar {
  font-size: .85rem;
  font-weight: 720;
  letter-spacing: -.04em;
}
</style>
