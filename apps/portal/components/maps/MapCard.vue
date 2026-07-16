<script setup lang="ts">
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";

const props = defineProps<{
  map: Map;
  challenges: MapChallenge[];
  authenticated: boolean;
}>();

const emit = defineEmits<{ select: [] }>();

const difficultyRank: Record<string, number> = { 普通: 1, 困难: 2, 专家: 3, 地狱: 4, 传奇: 5 };
const mapChallenges = computed(() => props.challenges.filter((challenge) => challenge.mapId === props.map.mapId));
const difficulty = computed(() => Math.max(0, ...mapChallenges.value.map((challenge) => difficultyRank[challenge.difficulty ?? ""] ?? 0)));
const mapIndex = computed(() => props.map.mapId.split(".").at(-1)?.slice(0, 2).toUpperCase() ?? "地图");
</script>

<template>
  <button class="map-card" type="button" :aria-label="`查看${map.mapName}详情`" @click="emit('select')">
    <div class="map-card-visual" aria-hidden="true"><span>{{ mapIndex }}</span><i></i><b></b></div>
    <div class="map-card-body">
      <div class="map-card-heading"><h2>{{ map.mapName }}</h2><span>{{ map.gameVersion }}</span></div>
      <dl class="map-card-facts">
        <div><dt>难度</dt><dd class="difficulty-pips"><UIcon v-for="index in 5" :key="index" name="i-lucide-flame" :class="{ active: index <= difficulty }" aria-hidden="true" /></dd></div>
        <div><dt>通关难度</dt><dd :class="{ muted: !authenticated }">{{ authenticated ? "未开放" : "登录后查看" }}</dd></div>
        <div><dt>挑战进度</dt><dd class="progress-value">{{ mapChallenges.length ? `${mapChallenges.length} 项挑战` : "暂无记录" }}</dd></div>
      </dl>
      <div class="map-card-footer"><UBadge v-if="mapChallenges.length" label="挑战目录" color="primary" variant="subtle" /><UBadge label="特殊机制未开放" color="neutral" variant="subtle" /></div>
    </div>
  </button>
</template>

<style scoped>
.map-card { display: grid; min-width: 0; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 17px; color: inherit; background: var(--surface); font: inherit; text-align: left; transition: border-color 160ms ease, box-shadow 160ms ease, transform 100ms ease-out; }
.map-card:hover { border-color: var(--line-strong); box-shadow: 0 10px 24px -20px var(--shadow); }
.map-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.map-card:active { transform: scale(.985); }
.map-card-visual { position: relative; display: grid; min-height: 138px; place-items: center; overflow: hidden; color: color-mix(in oklch, var(--accent) 70%, var(--text)); background: radial-gradient(circle at 70% 25%, color-mix(in oklch, var(--accent-surface) 74%, var(--surface-raised)), transparent 38%), linear-gradient(135deg, var(--surface-raised), color-mix(in oklch, var(--surface-raised) 64%, var(--accent-surface))); }
.map-card-visual::before, .map-card-visual::after { position: absolute; width: 140%; height: 1px; background: color-mix(in oklch, var(--accent) 20%, transparent); content: ""; transform: rotate(-19deg); }
.map-card-visual::after { transform: rotate(22deg) translateY(34px); }
.map-card-visual i, .map-card-visual b { position: absolute; border: 1px solid color-mix(in oklch, var(--accent) 28%, transparent); border-radius: 50%; }
.map-card-visual i { width: 170px; height: 170px; transform: translate(45px, -20px); }.map-card-visual b { width: 92px; height: 92px; transform: translate(-72px, 34px); }
.map-card-visual span { position: relative; z-index: 1; padding: 9px 13px; border: 1px solid color-mix(in oklch, var(--accent) 35%, var(--line)); border-radius: 10px; color: var(--accent); background: color-mix(in oklch, var(--surface) 68%, transparent); font-size: .8rem; font-weight: 750; letter-spacing: .14em; }
.map-card-body { display: grid; gap: 17px; padding: 18px 18px 16px; }.map-card-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }.map-card-heading h2 { min-width: 0; margin: 0; overflow: hidden; color: var(--text); font-size: 1.32rem; letter-spacing: -.045em; text-overflow: ellipsis; white-space: nowrap; }.map-card-heading span { flex: 0 0 auto; color: var(--quiet); font-size: .72rem; }
.map-card-facts { display: grid; gap: 9px; margin: 0; }.map-card-facts > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 9px; border-top: 1px solid var(--line); }.map-card-facts dt { color: var(--muted); font-size: .75rem; }.map-card-facts dd { margin: 0; color: var(--text); font-size: .78rem; font-weight: 650; }.map-card-facts dd.muted { color: var(--quiet); font-weight: 500; }.progress-value { color: var(--accent) !important; }.difficulty-pips { display: flex; gap: 4px; }.difficulty-pips .icon { width: 15px; height: 15px; color: var(--line-strong); }.difficulty-pips .icon.active { color: var(--accent); }
.map-card-footer { display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 620px) { .map-card-visual { min-height: 122px; }.map-card-body { padding-inline: 15px; } }
@media (prefers-reduced-motion: reduce) { .map-card { transition: border-color 160ms ease, box-shadow 160ms ease; }.map-card:active { transform: none; } }
</style>
