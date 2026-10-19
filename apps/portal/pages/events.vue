<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";
import EventDirectory from "~/components/events/EventDirectory.vue";
import { portalErrorDetails } from "~/utils/portal-error";
useSeoMeta({ title: "随机事件 · 躲避堡垒 3", description: "查看当前随机事件与开放挑战。" });
const { player, refresh } = useCurrentPlayer();
const { data: eventResponse, pending: loading, error: catalogError } = await useAsyncData("public-event-directory", () => usePublicCatalog<{ items: RandomEvent[] }>("events"));
const events = computed(() => eventResponse.value?.items ?? []);
const implementedCount = computed(() => events.value.filter((event) => event.releaseStatus === "implemented").length);
// Mode pools carry named versions; only numbered game versions order meaningfully.
const latestVersion = computed(() => [...new Set(events.value.map((event) => event.gameVersion).filter((version) => /^\d+(\.\d+)*$/.test(version)))].sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0] ?? null);
const error = computed(() => catalogError.value ? portalErrorDetails(catalogError.value, "请稍后重试。").description : "");
onMounted(async () => {
  try { await refresh(); }
  catch { player.value = null; }
});
</script>
<template>
  <main class="events-page directory-page page-shell">
    <PageMasthead title-id="events-title" eyebrow="Random events" title="随机事件" description="每局随机触发的事件：出现概率、持续与冷却、效果说明，以及与之相关的挑战。">
      <MastheadStat label="已实装" :value="loading ? null : implementedCount" />
      <MastheadStat label="最新版本" :value="loading ? null : latestVersion" />
    </PageMasthead>
    <section class="events-panel" aria-label="随机事件列表">
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
.events-panel { container-type: inline-size; }
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
</style>
