<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";
import EventDirectory from "~/components/events/EventDirectory.vue";
import { portalErrorDetails } from "~/utils/portal-error";
useSeoMeta({ title: "随机事件 · 躲避堡垒 3", description: "查看当前随机事件与开放挑战。" });
const api = usePortalApi(); const { player, refresh } = useCurrentPlayer(); const events = ref<RandomEvent[]>([]); const loading = shallowRef(true); const error = shallowRef("");
onMounted(async () => {
  const [eventResult, playerResult] = await Promise.allSettled([api<{ items: RandomEvent[] }>("/v1/events"), refresh()]);
  if (eventResult.status === "fulfilled") events.value = eventResult.value.items;
  if (playerResult.status === "rejected") player.value = null;
  error.value = eventResult.status === "rejected" ? portalErrorDetails(eventResult.reason, "请稍后重试。").description : "";
  loading.value = false;
});
</script>
<template>
  <main class="events-page directory-page page-shell">
    <section class="page-intro" aria-labelledby="events-title"><h1 id="events-title" class="page-title">随机事件</h1></section>
    <section class="events-panel surface-card" aria-label="随机事件列表">
      <div v-if="loading" class="event-skeleton-grid directory-grid" role="status" aria-label="读取中…">
        <div v-for="index in 6" :key="index" class="event-skeleton-card interactive-card interactive-card--static" aria-hidden="true">
          <div class="event-skeleton-top"><USkeleton class="event-skeleton-badge" /><USkeleton class="event-skeleton-status" /></div>
          <USkeleton class="event-skeleton-title" />
          <div class="event-skeleton-copy"><USkeleton /><USkeleton /><USkeleton class="event-skeleton-copy-short" /></div>
          <div class="event-skeleton-tags"><USkeleton class="event-skeleton-tag" /><USkeleton class="event-skeleton-tag event-skeleton-tag-short" /><USkeleton class="event-skeleton-tag" /></div>
        </div>
      </div>
      <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取事件" :description="error" />
      <EventDirectory v-else :events="events" :authenticated="Boolean(player)" />
    </section>
  </main>
</template>
<style scoped>
.page-intro { margin-bottom: 2rem; }
.events-panel { padding: clamp(1.125rem, 4vw, 2.25rem); }
.event-skeleton-card { display: grid; min-height: 210px; align-content: start; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-card); }
.event-skeleton-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.event-skeleton-badge { width: 52px; height: 22px; border-radius: var(--radius-pill); }
.event-skeleton-status { width: 70px; height: 22px; border-radius: var(--radius-pill); }
.event-skeleton-title { width: 62%; height: 22px; }
.event-skeleton-copy { display: grid; gap: var(--space-2); }
.event-skeleton-copy > * { width: 100%; height: 12px; }
.event-skeleton-copy-short { width: 76% !important; }
.event-skeleton-tags { display: flex; gap: var(--space-1); margin-top: auto; }
.event-skeleton-tag { width: 48px; height: 20px; border-radius: var(--radius-pill); }
.event-skeleton-tag-short { width: 36px; }
@media (max-width: 47.99rem) {
  .page-intro { margin-bottom: var(--space-5); }
  .events-panel { padding: var(--space-3); }
}
</style>
