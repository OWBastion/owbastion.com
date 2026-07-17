<script setup lang="ts">
import type { Map, MapChallenge } from "../../composables/useSubmissionUpload";

const props = defineProps<{
  map: Map;
  challenges: MapChallenge[];
  authenticated: boolean;
}>();

const emit = defineEmits<{ select: [] }>();

const mapChallenges = computed(() => props.challenges.filter((challenge) => challenge.mapId === props.map.mapId));
const mechanics = computed(() => props.map.mechanics ?? []);
const mapIndex = computed(() => props.map.mapId.split(".").at(-1)?.slice(0, 2).toUpperCase() ?? "地图");
</script>

<template>
  <button class="map-card" type="button" :aria-label="`查看${map.mapName}详情`" @click="emit('select')">
    <div class="map-card-visual" :style="map.backgroundUrl ? { backgroundImage: `linear-gradient(color-mix(in oklch, var(--surface) 42%, transparent), color-mix(in oklch, var(--surface) 68%, transparent)), url(${map.backgroundUrl})` } : undefined" aria-hidden="true"><img v-if="map.coverUrl" :src="map.coverUrl" alt="" /><span v-else>{{ mapIndex }}</span><i></i><b></b></div>
    <div class="map-card-body">
      <div class="map-card-heading"><h2>{{ map.mapName }}</h2><span>{{ map.gameVersion }}</span></div>
      <dl class="map-card-facts">
        <div><dt>地图评级</dt><dd>{{ map.difficultyRating ?? "暂无记录" }}</dd></div>
        <div><dt>通关难度</dt><dd :class="{ muted: !authenticated }">{{ authenticated ? "未开放" : "登录后查看" }}</dd></div>
        <div><dt>挑战进度</dt><dd class="progress-value">{{ mapChallenges.length ? `${mapChallenges.length} 项挑战` : "暂无记录" }}</dd></div>
      </dl>
      <div class="map-card-footer"><UBadge v-for="mechanic in mechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle" /></div>
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
.map-card-visual img { position: relative; z-index: 1; max-width: 72%; max-height: 108px; object-fit: contain; filter: drop-shadow(0 8px 14px color-mix(in oklch, var(--shadow) 42%, transparent)); }.map-card-visual span { position: relative; z-index: 1; padding: 9px 13px; border: 1px solid color-mix(in oklch, var(--accent) 35%, var(--line)); border-radius: 10px; color: var(--accent); background: color-mix(in oklch, var(--surface) 68%, transparent); font-size: .8rem; font-weight: 750; letter-spacing: .14em; }
.map-card-body { display: grid; gap: 17px; padding: 18px 18px 16px; }.map-card-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }.map-card-heading h2 { min-width: 0; margin: 0; overflow: hidden; color: var(--text); font-size: 1.32rem; letter-spacing: -.045em; text-overflow: ellipsis; white-space: nowrap; }.map-card-heading span { flex: 0 0 auto; color: var(--quiet); font-size: .72rem; }
.map-card-facts { display: grid; gap: 9px; margin: 0; }.map-card-facts > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 9px; border-top: 1px solid var(--line); }.map-card-facts dt { color: var(--muted); font-size: .75rem; }.map-card-facts dd { margin: 0; color: var(--text); font-size: .78rem; font-weight: 650; }.map-card-facts dd.muted { color: var(--quiet); font-weight: 500; }.progress-value { color: var(--accent) !important; }.difficulty-pips { display: flex; gap: 4px; }.difficulty-pips .icon { width: 15px; height: 15px; color: var(--line-strong); }.difficulty-pips .icon.active { color: var(--accent); }
.map-card-footer { display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 620px) {
  .map-card-visual { min-height: 108px; }
  .map-card-body { gap: 14px; padding: 14px; }
  .map-card-heading { align-items: flex-start; flex-direction: column; gap: 5px; }
  .map-card-heading h2 { font-size: 1.2rem; }
  .map-card-heading span { font-size: .7rem; }
  .map-card-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .map-card-facts > div { min-width: 0; align-items: flex-start; flex-direction: column; gap: 6px; padding-top: 8px; }
  .map-card-facts > div:last-child { grid-column: 1 / -1; align-items: center; flex-direction: row; }
  .map-card-facts dt, .map-card-facts dd { max-width: 100%; overflow-wrap: anywhere; }
  .map-card-facts dd { font-size: .76rem; }
  .map-card-footer { gap: 5px; }
}
@media (max-width: 360px) { .map-card-visual { min-height: 96px; }.map-card-body { padding-inline: 12px; }.map-card-footer { display: grid; grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .map-card { transition: border-color 160ms ease, box-shadow 160ms ease; }.map-card:active { transform: none; } }
</style>
