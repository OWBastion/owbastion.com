<script setup lang="ts">
import type { LeaderboardEntry, LeaderboardPlayerMapTitle, LeaderboardPlayerSummary } from "@owbastion/contracts";
import { portalErrorDetails } from "~/utils/portal-error";

const props = defineProps<{ entry: LeaderboardEntry | null }>();
const open = defineModel<boolean>("open", { required: true });

const api = usePortalApi();
const summary = shallowRef<LeaderboardPlayerSummary | null>(null);
const pending = ref(false);
const errorMessage = ref("");

const MAP_SHOW = 5;
const ACHIEVEMENT_SHOW = 10;
// Tier ladder, lowest to highest; the index is the accent step (t1..t3).
const tiers: Array<{ slot: NonNullable<LeaderboardPlayerMapTitle["slot"]>; label: string }> = [
  { slot: "pioneer", label: "开拓者" },
  { slot: "conqueror", label: "征服者" },
  { slot: "dominator", label: "主宰" },
];
const mapsExpanded = ref(false);
const achievementsExpanded = ref(false);

const mapRows = computed(() => {
  const titles = summary.value?.titles?.map ?? [];
  const byMap = new Map<string, { mapId: string; mapName: string; gameVersion: string | null; xp: number | null; tier: number; plain: LeaderboardPlayerMapTitle[] }>();
  for (const row of summary.value?.perMapXp ?? []) {
    byMap.set(row.mapId, { mapId: row.mapId, mapName: row.mapName, gameVersion: row.gameVersion, xp: row.xp, tier: 0, plain: [] });
  }
  for (const title of titles) {
    const row = byMap.get(title.mapId) ?? { mapId: title.mapId, mapName: title.mapName, gameVersion: null, xp: null, tier: 0, plain: [] };
    byMap.set(title.mapId, row);
    const index = tiers.findIndex((tier) => tier.slot === title.slot);
    if (index >= 0) row.tier = Math.max(row.tier, index + 1);
    else row.plain.push(title);
  }
  return [...byMap.values()].sort((a, b) => (b.xp ?? -1) - (a.xp ?? -1) || a.mapName.localeCompare(b.mapName));
});
const tierSummary = computed(() => [...tiers].reverse().map((tier) => ({
  label: tier.label,
  step: tiers.indexOf(tier) + 1,
  count: mapRows.value.filter((row) => row.tier === tiers.indexOf(tier) + 1).length,
})));
const shownMaps = computed(() => mapsExpanded.value ? mapRows.value : mapRows.value.slice(0, MAP_SHOW));
const achievements = computed(() => summary.value?.titles?.general ?? []);
const shownAchievements = computed(() => achievementsExpanded.value ? achievements.value : achievements.value.slice(0, ACHIEVEMENT_SHOW));

const playerKey = computed(() => props.entry?.player?.playerKey ?? null);
const playerName = computed(() => props.entry?.player?.displayName ?? "匿名玩家");
const initial = computed(() => (props.entry?.player ? props.entry.player.displayName.charAt(0) : "?"));

async function load() {
  summary.value = null;
  errorMessage.value = "";
  mapsExpanded.value = false;
  achievementsExpanded.value = false;
  if (!playerKey.value) return;
  pending.value = true;
  try {
    summary.value = await api<LeaderboardPlayerSummary>(`/v1/public/leaderboard/players/${encodeURIComponent(playerKey.value)}`);
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "请稍后重试。").description;
  } finally {
    pending.value = false;
  }
}

watch(() => props.entry, () => { if (open.value) void load(); });
watch(open, (isOpen) => { if (isOpen) void load(); });
</script>

<template>
  <USlideover v-model:open="open" side="right" :title="playerName" :ui="{ content: 'max-w-md' }">
    <template #body>
      <div v-if="entry" class="player-sheet">
        <div class="player-sheet-head" :class="{ 'player-sheet-head--anonymous': !entry.player }">
          <span class="player-sheet-avatar" aria-hidden="true">{{ initial }}</span>
          <div class="player-sheet-identity">
            <h2 class="player-sheet-name">{{ playerName }}</h2>
            <span v-if="entry.player?.equippedTitle" class="title-pill">{{ entry.player.equippedTitle.label }}</span>
          </div>
        </div>

        <div v-if="pending" class="player-sheet-loading" role="status" aria-label="读取中…">
          <USkeleton class="player-sheet-stat" v-for="index in 2" :key="index" />
        </div>
        <UAlert v-else-if="errorMessage" color="error" variant="subtle" role="alert" title="无法读取玩家" :description="errorMessage">
          <template #actions>
            <UButton label="重试" color="neutral" variant="outline" size="sm" @click="load" />
          </template>
        </UAlert>
        <NuxtLink v-if="entry.player?.publicHandle" class="public-profile-link" :to="`/u/${entry.player.publicHandle}`">查看公开主页 <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink>
        <template v-else>
          <div v-if="!entry.player" class="player-sheet-stats num">
            <div class="player-sheet-stat-cell">
              <b>{{ entry.boards?.mastery ? `#${entry.boards.mastery.rank}` : "—" }}</b>
              <span>地图精通排名 · {{ (entry.boards?.mastery?.score ?? 0).toLocaleString() }} XP</span>
            </div>
            <div class="player-sheet-stat-cell">
              <b>{{ entry.boards?.achievement ? `#${entry.boards.achievement.rank}` : "—" }}</b>
              <span>成就排名 · {{ entry.boards?.achievement?.score ?? 0 }} 个</span>
            </div>
          </div>
          <div v-else-if="summary?.boards" class="player-sheet-stats num">
            <div class="player-sheet-stat-cell">
              <b>{{ summary.boards.mastery ? `#${summary.boards.mastery.rank}` : "—" }}</b>
              <span>地图精通排名 · {{ (summary.boards.mastery?.score ?? 0).toLocaleString() }} XP</span>
            </div>
            <div class="player-sheet-stat-cell">
              <b>{{ summary.boards.achievement ? `#${summary.boards.achievement.rank}` : "—" }}</b>
              <span>成就排名 · {{ summary.boards.achievement?.score ?? 0 }} 个</span>
            </div>
          </div>

          <template v-if="!entry.player">
            <h4 class="player-sheet-section">公开主页</h4>
            <p class="notice">这位玩家关闭了公开主页。名次照常保留，但不显示昵称、成就和地图明细。</p>
          </template>
          <template v-else-if="summary">
            <h4 class="player-sheet-section">地图 · 玩过 {{ mapRows.length }}<template v-if="summary.mapCount != null"> / {{ summary.mapCount }}</template> 张</h4>
            <template v-if="mapRows.length">
              <div class="player-sheet-tiers num">
                <div v-for="tier in tierSummary" :key="tier.label" :class="`t${tier.step}`"><b>{{ tier.count }}</b><span>{{ tier.label }}</span></div>
              </div>
              <div class="player-sheet-maps">
                <div v-for="row in shownMaps" :key="row.mapId" class="player-sheet-map-row">
                  <span class="player-sheet-map-name">{{ row.mapName }} <span v-if="row.gameVersion" class="sec">{{ row.gameVersion }}</span></span>
                  <span class="player-sheet-map-badges">
                    <span v-if="row.tier" :class="['tier', `t${row.tier}`]">{{ tiers[row.tier - 1]!.label }}</span>
                    <span v-for="title in row.plain" :key="title.titleKey" class="tier">{{ title.label }}</span>
                  </span>
                  <span class="player-sheet-map-xp num"><template v-if="row.xp != null"><b>{{ row.xp.toLocaleString() }}</b> XP</template><template v-else>—</template></span>
                </div>
              </div>
              <button v-if="mapRows.length > MAP_SHOW && !mapsExpanded" type="button" class="more" @click="mapsExpanded = true">展开其余 {{ mapRows.length - MAP_SHOW }} 张地图</button>
            </template>
            <p v-else class="notice">还没有通关记录</p>

            <h4 class="player-sheet-section">成就 · {{ achievements.length }}</h4>
            <template v-if="achievements.length">
              <div class="player-sheet-titles">
                <span v-for="title in shownAchievements" :key="title.titleKey" class="title-pill">{{ title.label }}</span>
              </div>
              <button v-if="achievements.length > ACHIEVEMENT_SHOW && !achievementsExpanded" type="button" class="more" @click="achievementsExpanded = true">展开其余 {{ achievements.length - ACHIEVEMENT_SHOW }} 个</button>
            </template>
            <p v-else class="notice">还没有解锁成就</p>
          </template>
        </template>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
.player-sheet-head { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-5); }
.player-sheet-avatar { display: grid; flex: none; place-items: center; width: 3.5rem; height: 3.5rem; border: 2px solid var(--accent); border-radius: 50%; background: var(--accent-surface); color: var(--accent); font-size: 1.4rem; font-weight: 700; }
.player-sheet-head--anonymous .player-sheet-avatar { border-color: var(--line-strong); background: var(--surface-raised); color: var(--quiet); }
.player-sheet-name { margin: 0 0 var(--space-1); font-size: var(--type-card-title-size); font-weight: 600; }
.player-sheet-identity { min-width: 0; }
.player-sheet-loading { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.player-sheet-stat { height: 4.5rem; border-radius: var(--radius-card); }
.player-sheet-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--line); }
.player-sheet-stat-cell { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); background: var(--surface); }
.player-sheet-stat-cell b { font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.player-sheet-stat-cell span { color: var(--muted); font-size: var(--type-label-sm-size); }
.player-sheet-section { margin: var(--space-6) 0 var(--space-2); color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 500; }
.player-sheet-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin-bottom: var(--space-2); }
.player-sheet-tiers div { display: flex; align-items: baseline; justify-content: center; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-control); }
.player-sheet-tiers b { font-size: var(--type-card-title-size); font-weight: 700; }
.player-sheet-tiers span { color: var(--muted); font-size: var(--type-caption-size); }
.player-sheet-tiers .t3, .tier.t3 { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 24%, var(--surface)); }
.player-sheet-tiers .t2, .tier.t2 { border-color: color-mix(in oklch, var(--accent) 58%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 14%, var(--surface)); }
.player-sheet-tiers .t1, .tier.t1 { border-color: color-mix(in oklch, var(--accent) 32%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 7%, var(--surface)); }
.player-sheet-map-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 5.5rem; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--line); font-size: var(--type-body-sm-size); }
.player-sheet-map-name { min-width: 0; overflow: hidden; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
.player-sheet-map-badges { display: flex; gap: var(--space-1); }
.player-sheet-map-xp { color: var(--muted); text-align: right; }
.player-sheet-map-xp b { color: var(--text); font-weight: 600; }
.tier { padding: 0 var(--space-2); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.6; white-space: nowrap; }
.more { margin-top: var(--space-2); padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: var(--type-label-sm-size); font-weight: 600; cursor: pointer; }
.more:hover { text-decoration: underline; }
.sec { color: var(--muted); }
.player-sheet-titles { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.title-pill { display: inline-block; max-width: 100%; padding: 0 var(--space-2); border: 1px solid color-mix(in oklch, var(--accent) 32%, var(--line-strong)); border-radius: var(--radius-pill); background: color-mix(in oklch, var(--accent) 7%, var(--surface)); color: var(--text); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
.notice { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-control); background: var(--surface-raised); color: var(--muted); font-size: var(--type-body-sm-size); }
</style>
