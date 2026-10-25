<script setup lang="ts">
import type { PlayerSubmissionListResponse } from "~/composables/usePortalApi";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交记录 · 躲避堡垒 3" });

const api = usePortalApi();
const page = ref(1);
const pageSize = 20;
const { data, status, error, refresh } = await useAsyncData("my-submissions", async () => {
  const response = await api<PlayerSubmissionListResponse>(`/v1/me/submissions?page=${page.value}&pageSize=${pageSize}`);
  if (page.value > 1 && !response.items.length && response.total) page.value -= 1;
  return response;
}, { watch: [page] });

const pending = computed(() => status.value === "pending");
const loadError = computed(() => error.value ? portalErrorDetails(error.value, "无法读取提交记录，请稍后重试。").description : "");
</script>

<template>
  <main class="submissions page-shell">
    <UButton to="/me" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="返回玩家中心" class="submissions__back" />
    <PageMasthead title="提交记录" />
    <LoadingReveal>
      <div v-if="pending" class="submissions__loading" role="status" aria-label="读取中…"><USkeleton /><USkeleton /><USkeleton /></div>
      <UAlert v-else-if="loadError" color="error" variant="subtle" title="无法读取提交记录" :description="loadError">
        <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="refresh()" /></template>
      </UAlert>
      <template v-else-if="data">
        <PlayerRecentSubmissions :submissions="data.items" />
        <UPagination v-if="data.total > pageSize" v-model:page="page" :total="data.total" :items-per-page="pageSize" :disabled="pending" class="submissions__pagination" />
      </template>
    </LoadingReveal>
  </main>
</template>

<style scoped>
.submissions { display: grid; align-content: start; gap: var(--space-6); max-width: 44rem; padding-block: var(--space-8) 4.5rem; }
.submissions__back { justify-self: start; margin-left: calc(-1 * var(--space-2)); }
.submissions__loading { display: grid; gap: var(--space-2); }
.submissions__loading > * { height: 3.25rem; border-radius: var(--radius-control); }
.submissions__pagination { justify-self: center; }
@media (max-width: 47.99rem) { .submissions { padding-block: var(--space-5) var(--space-12); } }
</style>
