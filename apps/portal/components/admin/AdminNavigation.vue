<script setup lang="ts">
const items = [
  { label: "概览", icon: "i-lucide-layout-dashboard", to: "/admin" },
  { label: "玩家", icon: "i-lucide-users", to: "/admin/players" },
  { label: "绑定", icon: "i-lucide-link", to: "/admin/bindings" },
  {
    label: "成就",
    icon: "i-lucide-trophy",
    children: [
      { label: "审核", description: "截图审核队列", icon: "i-lucide-clipboard-check", to: "/admin/reviews" },
      { label: "成就管理", description: "挑战目录与规则", icon: "i-lucide-settings-2", to: "/admin/achievements" },
      { label: "称号发放", description: "人工补发与特殊奖励", icon: "i-lucide-award", to: "/admin/grants" },
    ],
  },
  { label: "地图", icon: "i-lucide-map", to: "/admin/maps" },
  { label: "事件", icon: "i-lucide-zap", to: "/admin/events" },
  { label: "渠道", icon: "i-lucide-radio", to: "/admin/channels" },
  { label: "历史称号", icon: "i-lucide-history", to: "/admin/titles" },
];
</script>

<template>
  <nav class="admin-navigation" aria-label="管理导航">
    <UNavigationMenu :items="items" orientation="horizontal" highlight variant="pill" />
  </nav>
</template>

<style scoped>
.admin-navigation { position: sticky; z-index: 3; top: 82px; margin-block: -8px 4px; padding: 7px; border: 1px solid var(--line); border-radius: 16px; background: color-mix(in oklch, var(--header-surface) 88%, transparent); box-shadow: 0 10px 30px -24px var(--shadow); backdrop-filter: blur(18px) saturate(135%); }
.admin-navigation :deep([data-slot="list"]) { gap: 2px; }
.admin-navigation :deep([data-slot="link"]), .admin-navigation :deep([data-slot="trigger"]) { min-height: 36px; border-radius: 10px; font-size: .78rem; font-weight: 650; }
@media (max-width: 840px) { .admin-navigation { top: 72px; overflow-x: auto; scrollbar-width: none; }.admin-navigation::-webkit-scrollbar { display: none; }.admin-navigation :deep([data-slot="list"]) { min-width: max-content; } }
@media (max-width: 620px) { .admin-navigation { position: static; margin-block: -4px 0; padding: 5px; }.admin-navigation :deep([data-slot="link"]), .admin-navigation :deep([data-slot="trigger"]) { min-height: 40px; } }
@media (prefers-reduced-transparency: reduce) { .admin-navigation { background: var(--surface-raised); backdrop-filter: none; } }
</style>
