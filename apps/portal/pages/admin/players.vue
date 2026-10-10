<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "玩家管理 · 躲避堡垒 3" });
const route = useRoute();
const selectedId = computed(() => typeof route.params.playerAccountId === "string" ? route.params.playerAccountId : undefined);
</script>

<template>
  <AdminWorkspace title="玩家管理">
    <div class="players-container">
      <div class="players-workbench" :class="{ 'players-workbench--detail': selectedId }">
        <AdminPlayerList class="players-workbench__list" :selected-id="selectedId" />
        <div class="players-workbench__detail"><NuxtPage /></div>
      </div>
    </div>
  </AdminWorkspace>
</template>

<style scoped>
.players-container { container-type: inline-size; }
.players-workbench { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5); }
.players-workbench--detail .players-workbench__list { display: none; }
.players-workbench:not(.players-workbench--detail) .players-workbench__detail { display: none; }
@container (min-width: 52rem) {
  .players-workbench { grid-template-columns: 20rem minmax(0, 1fr); align-items: start; }
  .players-workbench--detail .players-workbench__list, .players-workbench:not(.players-workbench--detail) .players-workbench__detail { display: block; }
  .players-workbench__list { position: sticky; top: var(--space-4); max-height: calc(100dvh - var(--space-8)); overflow: auto; }
}
.players-workbench__detail { animation: detail-in 220ms cubic-bezier(.2, .9, .3, 1); }
@keyframes detail-in { from { opacity: 0; transform: translateX(.75rem); } }
@media (prefers-reduced-motion: reduce) { .players-workbench__detail { animation: none; } }
</style>
