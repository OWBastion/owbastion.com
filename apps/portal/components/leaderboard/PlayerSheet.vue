<script setup lang="ts">
import type { LeaderboardEntry, LeaderboardPlayerSummary } from "@owbastion/contracts";
import { portalErrorDetails } from "~/utils/portal-error";

const props = defineProps<{ entry: LeaderboardEntry | null }>();
const open = defineModel<boolean>("open", { required: true });

const api = usePortalApi();
const summary = shallowRef<LeaderboardPlayerSummary | null>(null);
const pending = ref(false);
const errorMessage = ref("");

const playerKey = computed(() => props.entry?.player?.playerKey ?? null);
const playerName = computed(() => props.entry?.player?.displayName ?? "匿名玩家");
const initial = computed(() => (props.entry?.player ? props.entry.player.displayName.charAt(0) : "?"));

async function load() {
  summary.value = null;
  errorMessage.value = "";
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
            <h4 class="player-sheet-section">各地图精通 XP（当前版本）</h4>
            <template v-if="summary.perMapXp?.length">
              <div v-for="row in summary.perMapXp" :key="row.mapId" class="player-sheet-map-row">
                <span>{{ row.mapName }} <span class="sec">{{ row.gameVersion }}</span></span>
                <span class="num">{{ row.xp.toLocaleString() }} XP · {{ row.runCount }} 次</span>
              </div>
            </template>
            <p v-else class="notice">还没有通关记录</p>

            <h4 class="player-sheet-section">地图称号</h4>
            <div v-if="summary.titles?.map.length" class="player-sheet-titles">
              <span v-for="title in summary.titles.map" :key="title.titleKey" class="title-pill">{{ title.label }}</span>
            </div>
            <p v-else class="notice">还没有地图称号</p>

            <h4 class="player-sheet-section">成就 · {{ summary.titles?.general.length ?? 0 }}</h4>
            <div v-if="summary.titles?.general.length" class="player-sheet-titles">
              <span v-for="title in summary.titles.general" :key="title.titleKey" class="title-pill">{{ title.label }}</span>
            </div>
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
.player-sheet-map-row { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--line); font-size: var(--type-body-sm-size); }
.sec { color: var(--muted); }
.player-sheet-titles { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.title-pill { display: inline-block; max-width: 100%; padding: 0 var(--space-2); border: 1px solid color-mix(in oklch, var(--accent) 32%, var(--line-strong)); border-radius: var(--radius-pill); background: color-mix(in oklch, var(--accent) 7%, var(--surface)); color: var(--text); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
.notice { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-control); background: var(--surface-raised); color: var(--muted); font-size: var(--type-body-sm-size); }
</style>
