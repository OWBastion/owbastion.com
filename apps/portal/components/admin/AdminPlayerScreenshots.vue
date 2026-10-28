<script setup lang="ts">
import type { AdminSubmission } from "~/composables/useAdminApi";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";
import { portalErrorDetails } from "~/utils/portal-error";

const props = defineProps<{ playerAccountId: string }>();
const api = useAdminApi();
const pageSize = 24;
const items = shallowRef<AdminSubmission[]>([]);
const total = shallowRef(0);
const loading = shallowRef(true);
const errorMessage = shallowRef("");

async function load(append = false) {
  loading.value = true;
  errorMessage.value = "";
  try {
    const page = append ? Math.floor(items.value.length / pageSize) + 1 : 1;
    const response = await api<{ items: AdminSubmission[]; total: number }>(`/v1/submissions?playerAccountId=${encodeURIComponent(props.playerAccountId)}&page=${page}&pageSize=${pageSize}`);
    items.value = append ? [...items.value, ...response.items] : response.items;
    total.value = response.total;
  } catch (error) { errorMessage.value = portalErrorDetails(error, "无法读取该玩家提交的截图。").description; }
  finally { loading.value = false; }
}
onMounted(() => load());
</script>

<template>
  <div class="shots">
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    <p v-else-if="loading && !items.length" class="shots__empty" role="status">读取中…</p>
    <p v-else-if="!items.length" class="shots__empty">该玩家还没有提交截图。</p>
    <ul v-else class="shots__grid">
      <li v-for="item in items" :key="item.submissionId">
        <NuxtLink :to="`/admin/reviews/${encodeURIComponent(item.submissionId)}`" class="shots__card pressable-soft">
          <img v-if="item.evidenceUrl" :src="item.evidenceUrl" alt="" loading="lazy" />
          <span v-else class="shots__placeholder">无截图</span>
          <span class="shots__meta"><strong>{{ item.mapName }}</strong><StatusBadge :label="submissionStatusText[item.status] ?? item.status" :tone="submissionStatusTone(item.status)" /><time>{{ formatTime(item.updatedAt) }}</time></span>
        </NuxtLink>
      </li>
    </ul>
    <UButton v-if="items.length < total" class="shots__more" label="加载更多" color="neutral" variant="outline" :loading="loading" @click="load(true)" />
  </div>
</template>

<style scoped>
.shots { display: grid; gap: var(--space-3); }
.shots__empty { margin: 0; padding: var(--space-8) 0; color: var(--muted); text-align: center; }
.shots__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.shots__card { display: grid; gap: var(--space-2); height: 100%; padding: var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-control); color: inherit; text-decoration: none; }
.shots__card:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.shots__card img, .shots__placeholder { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--radius-control); background: var(--surface-raised); }
.shots__placeholder { display: grid; place-items: center; color: var(--quiet); font-size: .8rem; }
.shots__meta { display: grid; gap: var(--space-1); justify-items: start; min-width: 0; font-size: .82rem; }
.shots__meta strong { overflow-wrap: anywhere; }
.shots__meta time { color: var(--quiet); font-size: .74rem; }
.shots__more { justify-self: center; }
</style>
