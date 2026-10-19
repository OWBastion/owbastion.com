<script setup lang="ts">
import type { LeaderboardPlayerMapTitle, LeaderboardPlayerMapXp } from "@owbastion/contracts";

// Map progress for a public profile: how many maps were cleared, the best tier per map, and XP per map.
const props = defineProps<{ perMapXp: LeaderboardPlayerMapXp[]; titles: LeaderboardPlayerMapTitle[]; mapCount: number | null }>();

const tiers = [
  { slot: "pioneer", label: "开拓者" },
  { slot: "conqueror", label: "征服者" },
  { slot: "dominator", label: "主宰" },
] as const;

const rows = computed(() => {
  const byMap = new Map<string, { mapId: string; mapName: string; xp: number; runCount: number; tier: number }>();
  for (const row of props.perMapXp) byMap.set(row.mapId, { mapId: row.mapId, mapName: row.mapName, xp: row.xp, runCount: row.runCount, tier: 0 });
  for (const title of props.titles) {
    const row = byMap.get(title.mapId) ?? { mapId: title.mapId, mapName: title.mapName, xp: 0, runCount: 0, tier: 0 };
    byMap.set(title.mapId, row);
    row.tier = Math.max(row.tier, tiers.findIndex((tier) => tier.slot === title.slot) + 1);
  }
  return [...byMap.values()].sort((a, b) => b.tier - a.tier || b.xp - a.xp || a.mapName.localeCompare(b.mapName, "zh-CN"));
});
const topXp = computed(() => Math.max(1, ...rows.value.map((row) => row.xp)));
const tierCounts = computed(() => [...tiers].map((tier, index) => ({ ...tier, step: index + 1, count: rows.value.filter((row) => row.tier === index + 1).length })).reverse());
const share = computed(() => props.mapCount ? Math.min(100, Math.round(rows.value.length / props.mapCount * 100)) : null);
</script>

<template>
  <div class="maps">
    <div class="maps__summary">
      <p class="maps__count num"><b>{{ rows.length }}</b><span v-if="mapCount != null">/ {{ mapCount }} 张</span></p>
      <div v-if="share !== null" class="maps__meter" role="img" :aria-label="`已玩过 ${share}% 的地图`"><span :style="{ width: `${share}%` }" /></div>
      <ul class="maps__tiers num">
        <li v-for="tier in tierCounts" :key="tier.slot" :class="`t${tier.step}`"><b>{{ tier.count }}</b>{{ tier.label }}</li>
      </ul>
    </div>
    <ol v-if="rows.length" class="maps__list">
      <li v-for="row in rows" :key="row.mapId" class="maps__row" :class="`t${row.tier}`">
        <span class="maps__name">{{ row.mapName }}</span>
        <span v-if="row.tier" class="maps__tier">{{ tiers[row.tier - 1]!.label }}</span>
        <span class="maps__xp num">{{ row.xp.toLocaleString() }}<small>XP</small></span>
        <span class="maps__bar" aria-hidden="true"><span :style="{ width: `${Math.max(3, row.xp / topXp * 100)}%` }" /></span>
      </li>
    </ol>
    <p v-else class="maps__empty">还没有通关记录</p>
  </div>
</template>

<style scoped>
.maps { display: grid; gap: var(--space-5); }
.maps__summary { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3) var(--space-4); }
.maps__count { display: flex; align-items: baseline; gap: var(--space-1); margin: 0; color: var(--quiet); font-size: var(--type-label-sm-size); }
.maps__count b { color: var(--text); font-family: var(--font-display); font-size: 2rem; line-height: 1; }
.maps__meter { height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: color-mix(in oklch, var(--line-strong) 60%, transparent); }
.maps__meter span { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
.maps__tiers { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.maps__tiers li { display: flex; align-items: baseline; justify-content: center; gap: var(--space-2); padding: var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-control); color: var(--muted); font-size: var(--type-caption-size); }
.maps__tiers b { color: var(--text); font-family: var(--font-display); font-size: var(--type-card-title-size); }
.maps__tiers .t3, .maps__row.t3 .maps__tier { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 22%, var(--surface)); }
.maps__tiers .t2, .maps__row.t2 .maps__tier { border-color: color-mix(in oklch, var(--accent) 55%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 12%, var(--surface)); }
.maps__tiers .t1, .maps__row.t1 .maps__tier { border-color: color-mix(in oklch, var(--accent) 30%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 6%, var(--surface)); }
.maps__list { display: grid; margin: 0; padding: 0; list-style: none; }
.maps__row { display: grid; grid-template-columns: minmax(0, 1fr) auto 5.5rem; grid-template-areas: "name tier xp" "bar bar bar"; align-items: center; gap: var(--space-1) var(--space-3); padding-block: var(--space-3); border-bottom: 1px solid var(--line); }
.maps__name { grid-area: name; overflow: hidden; font-size: var(--type-body-sm-size); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.maps__tier { grid-area: tier; padding: 0 var(--space-2); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.6; white-space: nowrap; }
.maps__xp { grid-area: xp; color: var(--text); font-size: var(--type-body-sm-size); font-weight: 600; text-align: right; }
.maps__xp small { margin-left: 2px; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.maps__bar { grid-area: bar; height: 3px; overflow: hidden; border-radius: var(--radius-pill); background: color-mix(in oklch, var(--line) 70%, transparent); }
.maps__bar span { display: block; height: 100%; border-radius: inherit; background: color-mix(in oklch, var(--accent) 70%, var(--line-strong)); }
.maps__row.t3 .maps__bar span { background: var(--accent); }
.maps__empty { margin: 0; color: var(--quiet); font-size: var(--type-body-sm-size); }
</style>
