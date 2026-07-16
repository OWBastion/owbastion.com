<script setup lang="ts">
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";

const props = defineProps<{
  map: Map | null;
  challenges: MapChallenge[];
  authenticated: boolean;
}>();

const open = defineModel<boolean>("open", { required: true });
const difficultyRank: Record<string, number> = { 普通: 1, 困难: 2, 专家: 3, 地狱: 4, 传奇: 5 };
const mapChallenges = computed(() => props.map ? props.challenges.filter((challenge) => challenge.mapId === props.map?.mapId) : []);
const difficulty = computed(() => Math.max(0, ...mapChallenges.value.map((challenge) => difficultyRank[challenge.difficulty ?? ""] ?? 0)));
const difficultyLabel = computed(() => mapChallenges.value.map((challenge) => challenge.difficulty).filter(Boolean).join("、") || "暂无记录");
</script>

<template>
  <UModal v-model:open="open" :title="map?.mapName ?? '地图详情'" :description="map ? `版本 ${map.gameVersion}` : undefined" scrollable :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }">
    <template #body>
      <UCard v-if="map" class="detail-card" variant="subtle">
        <template #header>
          <div class="detail-heading"><div><p class="eyebrow">地图详情</p><h2>{{ map.mapName }}</h2></div><UBadge :label="`版本 ${map.gameVersion}`" color="neutral" variant="subtle" /></div>
        </template>
        <div class="detail-content">
          <section class="detail-section" aria-labelledby="map-overview-title"><div class="section-title"><h3 id="map-overview-title">地图概览</h3><span>{{ mapChallenges.length }} 项挑战</span></div><dl class="detail-facts"><div><dt>难度</dt><dd class="difficulty-pips"><UIcon v-for="index in 5" :key="index" name="i-lucide-flame" :class="{ active: index <= difficulty }" aria-hidden="true" /></dd></div><div><dt>挑战难度</dt><dd>{{ difficultyLabel }}</dd></div><div><dt>通关难度</dt><dd class="muted">{{ authenticated ? "未开放" : "登录后查看" }}</dd></div></dl><div class="progress-row"><div><span>挑战进度</span><strong>{{ authenticated ? "未开放" : "登录后查看" }}</strong></div><UProgress :model-value="0" aria-label="挑战进度" /></div></section>
          <section class="detail-section split-section" aria-labelledby="fastest-title"><div class="section-title"><h3 id="fastest-title">最快通关</h3><UBadge label="暂无记录" color="neutral" variant="subtle" /></div><div class="empty-stat-grid"><div><span>传奇最快</span><strong>暂无记录</strong><small>暂无对应玩家</small></div><div><span>地狱最快</span><strong>暂无记录</strong><small>暂无对应玩家</small></div></div></section>
          <section class="detail-section" aria-labelledby="mechanics-title"><div class="section-title"><h3 id="mechanics-title">特殊机制</h3><UBadge label="未开放" color="neutral" variant="subtle" /></div><p class="muted-copy">暂无机制记录。</p></section>
          <section class="detail-section" aria-labelledby="rating-title"><div class="section-title"><h3 id="rating-title">玩家评分</h3><UBadge label="未开放" color="neutral" variant="subtle" /></div><div class="rating-empty"><UIcon name="i-lucide-star" aria-hidden="true" /><span>暂无评分</span></div></section>
        </div>
      </UCard>
    </template>
  </UModal>
</template>

<style scoped>
.detail-card { margin: 0; border: 0; background: transparent; box-shadow: none; }.detail-card :deep(.p-4) { padding: 0; }.detail-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }.detail-heading h2 { margin: 0; color: var(--text); font-size: clamp(1.7rem, 5vw, 2.5rem); letter-spacing: -.06em; line-height: 1; }.detail-heading .eyebrow { margin-bottom: 8px; color: var(--accent); }.detail-content { display: grid; gap: 0; }.detail-section { display: grid; gap: 15px; padding: 22px 0; border-top: 1px solid var(--line); }.detail-section:first-child { padding-top: 0; border-top: 0; }.section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.section-title h3 { margin: 0; color: var(--text); font-size: 1rem; letter-spacing: -.025em; }.section-title > span { color: var(--quiet); font-size: .75rem; }.detail-facts { display: grid; gap: 10px; margin: 0; }.detail-facts > div, .progress-row > div { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.detail-facts > div { padding-bottom: 10px; border-bottom: 1px solid var(--line); }.detail-facts dt, .progress-row span, .empty-stat-grid span, .empty-stat-grid small { color: var(--muted); font-size: .8rem; }.detail-facts dd { margin: 0; color: var(--text); font-size: .84rem; font-weight: 650; }.detail-facts dd.muted, .empty-stat-grid small { color: var(--quiet); font-weight: 500; }.difficulty-pips { display: flex; gap: 5px; }.difficulty-pips .icon { width: 16px; height: 16px; color: var(--line-strong); }.difficulty-pips .icon.active { color: var(--accent); }.progress-row { display: grid; gap: 9px; }.progress-row strong { color: var(--quiet); font-size: .8rem; font-weight: 600; }.split-section { gap: 18px; }.empty-stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); }.empty-stat-grid > div { display: grid; gap: 7px; padding: 0 18px; }.empty-stat-grid > div:first-child { padding-left: 0; border-right: 1px solid var(--line); }.empty-stat-grid > div:last-child { padding-right: 0; }.empty-stat-grid strong { color: var(--text); font-size: 1.45rem; letter-spacing: -.04em; }.muted-copy { margin: 0; color: var(--quiet); font-size: .84rem; }.rating-empty { display: flex; align-items: center; gap: 8px; color: var(--quiet); font-size: .84rem; }.rating-empty .icon { color: var(--line-strong); }
@media (max-width: 480px) { .detail-heading { align-items: flex-start; flex-direction: column; }.empty-stat-grid > div { padding-inline: 10px; }.empty-stat-grid > div:first-child { padding-left: 0; }.empty-stat-grid > div:last-child { padding-right: 0; } }
@media (prefers-reduced-motion: reduce) { .detail-card :deep(*) { scroll-behavior: auto; } }
</style>
