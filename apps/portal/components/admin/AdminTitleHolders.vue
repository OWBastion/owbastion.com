<script setup lang="ts">
import type { AdminTitleHolder, AdminTitleHolderListResponse } from "./admin-title-types";
import { portalErrorDetails } from "~/utils/portal-error";

const props = defineProps<{ titleKey: string; count: number }>();
const api = useAdminApi();
const holders = ref<AdminTitleHolder[]>([]);
const page = shallowRef(0);
const hasMore = shallowRef(true);
const loading = shallowRef(false);
const errorMessage = shallowRef("");

async function loadMore() {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await api<AdminTitleHolderListResponse>(`/v1/titles/${encodeURIComponent(props.titleKey)}/holders`, { query: { page: page.value + 1, pageSize: 50 } });
    holders.value.push(...response.items);
    page.value = response.page;
    hasMore.value = response.hasMore;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取获得玩家，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}
onMounted(loadMore);

const grantedDay = (timestamp: number) => new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
</script>

<template>
  <section class="title-holders" :aria-label="`获得玩家 ${count} 人`">
    <span class="type-caption">获得玩家 · {{ count }} 人</span>
    <ul v-if="holders.length" class="title-holders__list">
      <li v-for="holder in holders" :key="holder.playerAccountId">
        <NuxtLink class="accent-link" :to="`/admin/players/${encodeURIComponent(holder.playerAccountId)}`"><PlayerBattleTag :player-name="holder.playerName" :player-id="holder.playerId" /></NuxtLink>
        <small class="table-meta">{{ grantedDay(holder.firstGrantedAt) }}<template v-if="holder.grantCount > 1"> · {{ holder.grantCount }} 项</template></small>
      </li>
    </ul>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    <span v-if="loading" class="table-meta" role="status">读取中…</span>
    <UButton v-else-if="hasMore" size="sm" color="neutral" variant="ghost" :label="errorMessage ? '重试' : '加载更多'" @click="loadMore" />
  </section>
</template>

<style scoped>
.title-holders { display: grid; gap: var(--space-2); }
.title-holders__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--space-2) var(--space-4); margin: 0; padding: 0; list-style: none; }
.title-holders__list li { display: flex; justify-content: space-between; gap: var(--space-2); align-items: baseline; }
</style>
