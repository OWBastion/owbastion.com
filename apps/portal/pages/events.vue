<script setup lang="ts">
import EventDirectorySkeleton from "~/components/events/EventDirectorySkeleton.vue";
import type { RandomEvent } from "~/types/random-event";
import EventDirectory from "~/components/events/EventDirectory.vue";
import { portalErrorDetails } from "~/utils/portal-error";
useSeoMeta({ title: "随机事件 · 躲避堡垒 3", description: "查看当前随机事件与开放挑战。" });
const { player, refresh } = useCurrentPlayer();
const { data: eventResponse, pending: loading, error: catalogError } = useAsyncData("public-event-directory", () => usePublicCatalog<{ items: RandomEvent[] }>("events"), { lazy: true });
const events = computed(() => eventResponse.value?.items ?? []);
// Mode pools carry named versions; only numbered game versions order meaningfully.
const error = computed(() => catalogError.value ? portalErrorDetails(catalogError.value, "请稍后重试。").description : "");
onMounted(async () => {
  try { await refresh(); }
  catch { player.value = null; }
});
</script>
<template>
  <main class="events-page directory-page page-shell">
    <PageMasthead title="随机事件" />
    <section class="events-panel" aria-label="随机事件列表">
      <LoadingReveal>
        <EventDirectorySkeleton v-if="loading" role="status" aria-label="读取中…" />
        <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取事件" :description="error" />
        <EventDirectory v-else :events="events" :authenticated="Boolean(player)" />
      </LoadingReveal>
    </section>
  </main>
</template>
<style scoped>
.events-panel { container-type: inline-size; }
</style>
