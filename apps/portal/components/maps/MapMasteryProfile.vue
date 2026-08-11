<script setup lang="ts">
import type { CurrentPlayerMasteryResponse, PlayerMasteryMapProfile } from "~/composables/usePortalApi";
import MasteryRunHistory from "./MasteryRunHistory.vue";
import { formatMasteryDuration } from "~/utils/mastery";

const props = defineProps<{
  mapName: string;
  authenticated: boolean;
  profile: PlayerMasteryMapProfile | null;
  loading: boolean;
  error: string;
  history: CurrentPlayerMasteryResponse | null;
  historyLoading: boolean;
  historyError: string;
}>();

const emit = defineEmits<{
  retry: [];
  "history-page": [page: number];
  "retry-history": [];
}>();

const hasHistory = computed(() => Boolean(props.history?.total) || props.historyLoading || Boolean(props.historyError));
</script>

<template>
  <section class="mastery-profile detail-section" aria-labelledby="map-mastery-title">
    <div class="section-title"><h3 id="map-mastery-title">精通记录</h3><span v-if="profile">{{ profile.verifiedRunCount }} 次已验证通关</span></div>
    <p v-if="!authenticated" class="muted-copy">登录后查看</p>
    <div v-else-if="loading" class="mastery-profile-loading" role="status" aria-label="读取精通记录…"><USkeleton /><USkeleton /><USkeleton /></div>
    <UAlert v-else-if="error && !history" color="error" variant="subtle" title="无法读取精通记录" :description="error">
      <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="emit('retry')" /></template>
    </UAlert>
    <template v-else>
      <UEmpty v-if="!profile" title="暂无精通记录" description="尚无已验证通关。" variant="naked" />
      <template v-else>
        <dl class="mastery-summary"><div><dt>精通 XP</dt><dd>{{ profile.totalXp }} XP</dd></div><div><dt>已验证通关</dt><dd>{{ profile.verifiedRunCount }} 次</dd></div><div><dt>最高难度</dt><dd>{{ profile.highestCompletedDifficulty ?? "暂无记录" }}</dd></div><div><dt>最低死亡</dt><dd>{{ profile.lowestDeaths ?? "暂无记录" }}</dd></div><div><dt>最少跳过</dt><dd>{{ profile.fewestSkips ?? "暂无记录" }}</dd></div><div><dt>单次最高 XP</dt><dd>{{ profile.highestSingleRunXp ?? "暂无记录" }}<template v-if="profile.highestSingleRunXp !== null"> XP</template></dd></div></dl>
        <div class="difficulty-summary" aria-label="各难度通关记录"><div v-for="stat in profile.difficultyStats" :key="stat.difficulty"><strong>{{ stat.difficulty }}</strong><span>{{ stat.verifiedRunCount }} 次 · 最快 {{ formatMasteryDuration(stat.fastestCompletionSeconds) }}</span></div></div>
      </template>
      <MasteryRunHistory v-if="profile || hasHistory" :map-name="mapName" :history="history" :loading="historyLoading" :error="historyError" @change-page="emit('history-page', $event)" @retry="emit('retry-history')" />
    </template>
  </section>
</template>

<style scoped>
.mastery-profile { gap: 16px; }.mastery-profile-loading { display: grid; gap: 9px; }.mastery-profile-loading > * { height: 44px; border-radius: 10px; }
.mastery-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; margin: 0; }.mastery-summary > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 10px 0; border-top: 1px solid var(--line); }.mastery-summary dt { color: var(--muted); font-size: .76rem; }.mastery-summary dd { margin: 0; color: var(--text); font-size: .8rem; font-weight: 700; text-align: right; }
.difficulty-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }.difficulty-summary > div { display: grid; gap: 3px; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-raised); }.difficulty-summary strong { color: var(--text); font-size: .8rem; }.difficulty-summary span { color: var(--quiet); font-size: .72rem; overflow-wrap: anywhere; }
@media (max-width: 620px) { .mastery-summary, .difficulty-summary { grid-template-columns: 1fr; }.mastery-summary > div { padding-block: 9px; } }
</style>
