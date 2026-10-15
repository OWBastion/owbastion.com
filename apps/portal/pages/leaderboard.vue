<script setup lang="ts">
import type {
  CurrentPlayerLeaderboardRank,
  LeaderboardBoard,
  LeaderboardEntry,
  LeaderboardResponse,
  Map,
} from "@owbastion/contracts";
import { verifiedRunXpRuleV1 } from "@owbastion/domain";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({
  title: "排行榜 · 躲避堡垒 3",
  description: "查看地图精通与成就排行榜。上传通关截图、审核通过后获得精通 XP，满足条件还会解锁成就。",
});

const PAGE_SIZE = 20;

const api = usePortalApi();
const route = useRoute();
const { player, refresh } = useCurrentPlayer();

const board = ref<LeaderboardBoard>(route.query.board === "achievement" ? "achievement" : "mastery");
const mapId = ref<string | undefined>(typeof route.query.mapId === "string" ? route.query.mapId : undefined);
const page = ref(1);
const fetchedAt = ref<number | null>(null);

const { data: catalog } = await useAsyncData("leaderboard-map-catalog", () => usePublicCatalog<{ items: Map[] }>("maps"));
const maps = computed(() => catalog.value?.items ?? []);

// Reactive key: board/map/page changes are distinct fetches. Rankings change
// underneath navigation, so payload reuse is off — each key fetches live.
const boardKey = computed(() => `leaderboard-board:${board.value}:${board.value === "mastery" ? (mapId.value ?? "all") : "—"}:${page.value}`);
const { data: boardData, pending: loading, error: boardError, refresh: refreshBoard } = await useAsyncData(
  boardKey,
  async () => {
    const params = new URLSearchParams({ board: board.value, page: String(page.value), pageSize: String(PAGE_SIZE) });
    if (board.value === "mastery" && mapId.value) params.set("mapId", mapId.value);
    const response = await api<LeaderboardResponse>(`/v1/public/leaderboard?${params}`);
    fetchedAt.value = Date.now();
    return response;
  },
  { getCachedData: () => undefined },
);

const items = computed(() => boardData.value?.items ?? []);
const error = computed(() => boardError.value ? portalErrorDetails(boardError.value, "请稍后重试。").description : "");

const setBoard = (next: LeaderboardBoard) => { if (board.value !== next) { board.value = next; page.value = 1; } };
const setMap = (next: string | undefined) => { if (mapId.value !== next) { mapId.value = next; page.value = 1; } };
const selectedMap = computed(() => maps.value.find((map) => map.mapId === mapId.value));

const boardTitle = computed(() => {
  if (board.value === "achievement") return "成就排行榜";
  return mapId.value && selectedMap.value ? `${selectedMap.value.mapName} 精通排行榜` : "地图精通排行榜";
});
const boardMeta = computed(() => {
  const total = boardData.value?.total ?? 0;
  const stamp = fetchedAt.value ? formatDateTime(fetchedAt.value) : "…";
  return `${total} 名玩家 · 更新于 ${stamp}`;
});
const mapNote = computed(() => {
  if (board.value !== "mastery") return "";
  if (!mapId.value) return "所有地图、所有版本获得的精通 XP 总和";
  const version = boardData.value?.mapGameVersion ?? selectedMap.value?.gameVersion ?? "";
  return `当前版本 ${version}，地图更新后重新累计`;
});

/* Own standing: a signed-in Player's rank rides the same board and scope. */
const mine = shallowRef<CurrentPlayerLeaderboardRank | null>(null);
const minePending = ref(false);
async function loadMine() {
  if (!player.value) { mine.value = null; return; }
  minePending.value = true;
  try {
    const params = new URLSearchParams({ board: board.value });
    if (board.value === "mastery" && mapId.value) params.set("mapId", mapId.value);
    mine.value = await api<CurrentPlayerLeaderboardRank>(`/v1/me/leaderboard?${params}`);
  } catch {
    mine.value = null;
  } finally {
    minePending.value = false;
  }
}
onMounted(async () => {
  try { await refresh(); }
  catch { player.value = null; }
  await loadMine();
});
watch([board, mapId], () => { if (import.meta.client) void loadMine(); });

const mineGap = computed(() => {
  const standing = mine.value;
  if (!standing?.rank) return "";
  if (standing.gapToNextRank === null) return "你是第一名";
  if (standing.gapToNextRank === 0) return "与上一名同分";
  return board.value === "mastery" ? `距上一名差 ${standing.gapToNextRank.toLocaleString()} XP` : `距上一名差 ${standing.gapToNextRank} 个`;
});

/* Jump-to-me only scrolls after the explicit "查看" click; loading or paging
   alone must never move the scroll position. */
const pendingJump = ref(false);
const boardSection = useTemplateRef<HTMLElement>("boardSection");
const scrollToMe = async () => {
  await nextTick();
  boardSection.value?.querySelector<HTMLElement>(".board-row.me")?.scrollIntoView({ block: "center", behavior: "smooth" });
};
const jumpToMe = () => {
  const rank = mine.value?.rank;
  if (!rank) return;
  pendingJump.value = true;
  const targetPage = Math.ceil(rank / PAGE_SIZE);
  if (page.value !== targetPage) page.value = targetPage;
  else { pendingJump.value = false; void scrollToMe(); }
};
watch(items, () => {
  if (!pendingJump.value) return;
  const rank = mine.value?.rank;
  if (!rank || Math.ceil(rank / PAGE_SIZE) !== page.value) { pendingJump.value = false; return; }
  if (!items.value.some((entry) => entry.rank === rank)) return;
  pendingJump.value = false;
  void scrollToMe();
});

/* Player drawer: public rows resolve the opaque key; anonymous rows render inline. */
const selectedEntry = shallowRef<LeaderboardEntry | null>(null);
const sheetOpen = ref(false);
const openPlayer = (entry: LeaderboardEntry) => { selectedEntry.value = entry; sheetOpen.value = true; };

const podium = computed(() => (page.value === 1 ? items.value.slice(0, 3) : []));
const { style: tiltStyle, handlers: tiltHandlers } = useIconTilt(6);

const totalPages = computed(() => Math.max(1, Math.ceil((boardData.value?.total ?? 0) / PAGE_SIZE)));
const pageNumbers = computed(() => {
  const pages = totalPages.value;
  const current = page.value;
  const marks: Array<number | "…"> = [];
  for (let index = 1; index <= pages; index += 1) {
    if (index === 1 || index === pages || Math.abs(index - current) <= 1) marks.push(index);
    else if (marks[marks.length - 1] !== "…") marks.push("…");
  }
  return marks;
});
const pageRange = computed(() => {
  const total = boardData.value?.total ?? 0;
  if (!total) return "";
  const start = (page.value - 1) * PAGE_SIZE + 1;
  return `第 ${start}–${Math.min(total, page.value * PAGE_SIZE)} 名，共 ${total} 名`;
});

const scoreUnit = computed(() => board.value === "mastery" ? "XP" : "个成就");
const formatScore = (score: number) => board.value === "mastery" ? score.toLocaleString() : String(score);
const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};
const formatDateTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const difficultyTiers = Object.entries(verifiedRunXpRuleV1.baseDifficultyXp) as Array<[string, number]>;
const entryInitial = (entry: LeaderboardEntry) => entry.player ? entry.player.displayName.charAt(0) : "?";
const entryName = (entry: LeaderboardEntry) => entry.player?.displayName ?? "匿名玩家";
const isMe = (entry: LeaderboardEntry) => mine.value?.rank !== null && entry.rank === mine.value?.rank;
</script>

<template>
  <main class="leaderboard-page page-shell">
    <header class="page-intro" aria-labelledby="leaderboard-title">
      <h1 id="leaderboard-title" class="page-title">排行榜</h1>
      <p class="body-copy">上传通关截图、审核通过后获得精通 XP，满足条件还会解锁成就。精通 XP 和成就会一直保留，不会清零。</p>
    </header>

    <div class="controls">
      <div class="ctl-row">
        <div class="seg" role="group" aria-label="排行榜">
          <button type="button" :aria-pressed="board === 'mastery'" @click="setBoard('mastery')">地图精通</button>
          <button type="button" :aria-pressed="board === 'achievement'" @click="setBoard('achievement')">成就</button>
        </div>
      </div>
      <div v-if="board === 'mastery'" class="ctl-row">
        <div class="chips" role="group" aria-label="地图">
          <button type="button" class="chip pressable" :aria-pressed="!mapId" @click="setMap(undefined)">全部地图</button>
          <button
            v-for="map in maps"
            :key="map.mapId"
            type="button"
            class="chip pressable"
            :aria-pressed="mapId === map.mapId"
            @click="setMap(map.mapId)"
          >{{ map.mapName }}</button>
        </div>
        <span class="note">{{ mapNote }}</span>
      </div>
    </div>

    <div class="leaderboard-grid">
      <section ref="boardSection" :aria-busy="loading || undefined">
        <div class="section-head">
          <h2 class="section-title">{{ boardTitle }}</h2>
          <span class="note num">{{ boardMeta }}</span>
        </div>

        <section class="mine surface-card" aria-label="你的排名">
          <template v-if="minePending"><USkeleton class="mine-skeleton" /></template>
          <template v-else-if="!player">
            <span class="mine-rank">—</span>
            <span class="mine-text"><NuxtLink to="/login" class="mine-login">登录</NuxtLink>后可以看到你的排名</span>
          </template>
          <template v-else-if="!mine?.rank">
            <span class="mine-rank">—</span>
            <span class="mine-text">{{ board === "mastery" ? "你还没有上榜，上传一张通关截图就能出现在这里" : "你还没有上榜，解锁第一个成就就能出现在这里" }}</span>
          </template>
          <template v-else>
            <span class="mine-rank num">#{{ mine.rank }}</span>
            <span class="mine-text">你的排名 · <b class="num">{{ board === "mastery" ? `${mine.score.toLocaleString()} 精通 XP` : `${mine.score} 个成就` }}</b><template v-if="mineGap"> · {{ mineGap }}</template></span>
            <button type="button" class="btn pressable" @click="jumpToMe">查看</button>
          </template>
        </section>

        <div v-if="loading && !items.length" class="board-skeletons" role="status" aria-label="读取中…">
          <USkeleton v-for="index in 8" :key="index" class="board-skeleton-row" />
        </div>
        <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取排行榜" :description="error">
          <template #actions>
            <UButton label="重试" color="neutral" variant="outline" size="sm" @click="refreshBoard()" />
          </template>
        </UAlert>
        <template v-else>
          <div v-if="podium.length" class="podium">
            <button
              v-for="entry in podium"
              :key="entry.rank"
              type="button"
              class="pod pressable"
              :class="[`p${entry.rank}`, { anon: !entry.player }]"
              v-on="entry.rank === 1 ? tiltHandlers : {}"
              :style="entry.rank === 1 ? tiltStyle : undefined"
              @click="openPlayer(entry)"
            >
              <span v-if="entry.rank === 1" class="big num" aria-hidden="true">1</span>
              <span class="rk"><UIcon :name="entry.rank === 1 ? 'i-lucide-crown' : 'i-lucide-medal'" aria-hidden="true" />第 {{ entry.rank }} 名</span>
              <span class="av" aria-hidden="true">{{ entryInitial(entry) }}</span>
              <span class="nm">{{ entryName(entry) }}</span>
              <span class="ttl"><span v-if="entry.player?.equippedTitle" class="title-pill">{{ entry.player.equippedTitle.label }}</span></span>
              <span class="v num">{{ formatScore(entry.score) }}<small>{{ scoreUnit }}</small></span>
            </button>
          </div>

          <section class="board surface-card">
            <table>
              <thead>
                <tr v-if="board === 'mastery'">
                  <th>名次</th><th>玩家</th><th>精通 XP</th><th class="c-hide">通关次数</th><th class="c-hide">最高难度</th>
                </tr>
                <tr v-else>
                  <th>名次</th><th>玩家</th><th>成就</th><th class="c-hide">最近解锁</th><th class="c-hide">精通 XP</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!items.length"><td colspan="5" class="empty">这里还没有人上榜</td></tr>
                <tr
                  v-for="entry in items"
                  :key="entry.rank"
                  class="board-row"
                  :class="{ me: isMe(entry) }"
                  @click="openPlayer(entry)"
                >
                  <td class="rank num">
                    <span v-if="entry.rank <= 3" class="rmark" :class="`m${entry.rank}`">{{ entry.rank }}</span>
                    <template v-else>{{ entry.rank }}</template>
                  </td>
                  <td>
                    <div class="pl">
                      <span class="mini" aria-hidden="true">{{ entryInitial(entry) }}</span>
                      <div class="pn">
                        <div class="n">{{ entryName(entry) }}<span v-if="isMe(entry)" class="you">你</span></div>
                        <div v-if="entry.player?.equippedTitle" class="t">{{ entry.player.equippedTitle.label }}</div>
                      </div>
                    </div>
                  </td>
                  <template v-if="board === 'mastery'">
                    <td class="num"><span class="prim">{{ entry.score.toLocaleString() }}</span></td>
                    <td class="num c-hide">{{ entry.runCount ?? 0 }}</td>
                    <td class="c-hide">{{ entry.topDifficulty ?? "—" }}</td>
                  </template>
                  <template v-else>
                    <td class="num"><span class="prim">{{ entry.score }}</span></td>
                    <td class="num c-hide"><span class="sec">{{ entry.latestTitle ? `${entry.latestTitle.label} · ` : "" }}{{ formatDate(entry.reachedAt) }}</span></td>
                    <td class="num c-hide">{{ (entry.masteryXp ?? 0).toLocaleString() }}</td>
                  </template>
                </tr>
              </tbody>
            </table>
            <div v-if="items.length" class="pager">
              <span class="num">{{ pageRange }}</span>
              <div class="pg">
                <button type="button" :disabled="page === 1" aria-label="上一页" @click="page -= 1">‹</button>
                <button
                  v-for="(mark, index) in pageNumbers"
                  :key="index"
                  type="button"
                  :disabled="mark === '…'"
                  :aria-current="mark === page || undefined"
                  @click="typeof mark === 'number' && (page = mark)"
                >{{ mark }}</button>
                <button type="button" :disabled="page >= totalPages" aria-label="下一页" @click="page += 1">›</button>
              </div>
            </div>
          </section>
        </template>
      </section>

      <aside class="side">
        <div v-if="board === 'mastery'" class="card surface-card">
          <h3>精通 XP 怎么算</h3>
          <p>每张审核通过的通关截图按难度获得精通 XP：</p>
          <table class="xpt num">
            <tbody>
              <tr v-for="[difficulty, xp] in difficultyTiers" :key="difficulty"><td>{{ difficulty }}</td><td>{{ xp }} XP</td></tr>
            </tbody>
          </table>
          <ul>
            <li>无死亡 +5%，无跳过 +5%，最多 +10%</li>
            <li>同一局重复上传只算一次</li>
            <li>解锁成就不额外加 XP</li>
            <li>没有每日奖励，不用天天上线</li>
            <li>XP 相同时，先达到的玩家排在前面</li>
          </ul>
        </div>
        <div v-else class="card surface-card">
          <h3>成就排行怎么算</h3>
          <p>按你解锁的通用成就数量排名。地图称号算在地图精通里，开发者称号不参与任何排名。</p>
          <ul>
            <li>成就解锁后永久持有，不按赛季统计</li>
            <li>数量相同时，先解锁最后一个成就的玩家排在前面</li>
            <li>成就排行和地图精通排行互不影响</li>
          </ul>
        </div>
      </aside>
    </div>

    <LeaderboardPlayerSheet v-model:open="sheetOpen" :entry="selectedEntry" />
  </main>
</template>

<style scoped>
.leaderboard-page { padding-bottom: var(--space-12); }
.page-intro { margin-bottom: var(--space-8); }
.page-intro .body-copy { margin: var(--space-2) 0 0; max-width: 40rem; }
.num { font-variant-numeric: tabular-nums; }
.note { color: var(--quiet); font-size: var(--type-caption-size); }

/* controls */
.controls { display: grid; gap: var(--space-3); margin-bottom: var(--space-5); }
.ctl-row { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; min-width: 0; }
.seg { display: inline-flex; gap: 0.125rem; padding: 0.1875rem; border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface-raised); }
.seg button { min-height: var(--control-md); padding: 0 var(--space-4); border: 0; border-radius: calc(var(--radius-control) / 1.5); background: none; color: var(--muted); font-size: var(--type-body-sm-size); font-weight: 500; white-space: nowrap; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: var(--elevation-1); }
.chips { display: flex; flex: 1 1 0; gap: var(--space-2); min-width: 0; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chip { min-height: var(--control-sm); padding: 0 var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: var(--surface); color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 500; white-space: nowrap; cursor: pointer; }
.chip[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-surface); color: var(--text); font-weight: 600; }

.leaderboard-grid { display: grid; grid-template-columns: minmax(0, 1fr) 18.5rem; gap: var(--space-6); align-items: start; }
@media (max-width: 63.99rem) { .leaderboard-grid { grid-template-columns: 1fr; } }
.section-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
.section-title { margin: 0; font-size: var(--type-card-title-size); font-weight: 600; letter-spacing: -0.01em; }

/* your position */
.mine { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5); margin-bottom: var(--space-5); }
.mine-rank { font-size: var(--type-headline-size); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; color: var(--accent); min-width: 3.5rem; }
.mine-text { flex: 1; min-width: 0; color: var(--muted); font-size: var(--type-body-sm-size); }
.mine-text b { color: var(--text); font-weight: 600; }
.mine-login { color: var(--accent); font-weight: 600; }
.mine-skeleton { width: 100%; height: 2.5rem; border-radius: var(--radius-control); }
.btn { min-height: var(--control-md); padding: 0 var(--space-4); border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface); font-size: var(--type-body-sm-size); font-weight: 600; white-space: nowrap; cursor: pointer; color: var(--text); }

/* podium: accent intensity ladder 7% / 14% / 24%; only #1 gets the radial gradient and glow */
.podium { display: grid; grid-template-columns: 1fr 1.2fr 1fr; align-items: end; gap: var(--space-3); margin-bottom: var(--space-5); }
.pod { position: relative; display: grid; justify-items: center; gap: var(--space-1); padding: var(--space-5) var(--space-4); border: 1px solid var(--line-strong); border-radius: var(--radius-card); text-align: center; color: var(--text); cursor: pointer; }
.pod .rk { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; }
.pod .rk svg, .pod .rk [class*="i-lucide-"] { width: 1rem; height: 1rem; }
.pod .av { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; margin: var(--space-2) 0; border: 2px solid color-mix(in oklch, var(--accent) 45%, var(--line-strong)); border-radius: 50%; background: var(--surface); color: var(--accent); font-size: 1.4rem; font-weight: 700; }
.pod .nm { max-width: 100%; font-size: var(--type-card-title-size); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pod .ttl { min-height: 1.4rem; max-width: 100%; }
.pod .v { margin-top: var(--space-2); font-size: var(--type-headline-size); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.pod .v small { margin-left: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; letter-spacing: 0; }
.pod.p3 { order: 3; border-color: color-mix(in oklch, var(--accent) 32%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 7%, var(--surface)); }
.pod.p2 { order: 1; border-color: color-mix(in oklch, var(--accent) 58%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 14%, var(--surface)); }
.pod.p1 { order: 2; padding: var(--space-6) var(--space-5); border-color: var(--accent);
  background: radial-gradient(120% 90% at 50% 0%, color-mix(in oklch, var(--accent) 24%, transparent), transparent 62%), var(--surface);
  box-shadow: var(--elevation-2), 0 0 2.5rem -0.5rem color-mix(in oklch, var(--accent) 34%, transparent);
  transition: transform 150ms ease-out;
  transform: perspective(60rem) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)); }
/* #1 only: a foil card (design-direction exception). The light sweeps the upper
   half on its own; reduced motion keeps it still at the top-left and tilt off. */
@property --mx { syntax: "<percentage>"; inherits: true; initial-value: 22%; }
@property --my { syntax: "<percentage>"; inherits: true; initial-value: 8%; }
.pod.p1 { isolation: isolate; overflow: hidden; animation: foil 5s ease-in-out infinite alternate; }
@keyframes foil { from { --mx: 14%; --my: 6%; } to { --mx: 86%; --my: 30%; } }
@media (prefers-reduced-motion: reduce) { .pod.p1 { animation: none; } }
.pod.p1 > * { position: relative; z-index: 2; }
.pod.p1::before, .pod.p1::after { content: ""; position: absolute; inset: 0; z-index: 1; border-radius: inherit; pointer-events: none; transition: opacity 200ms ease-out; }
.pod.p1::before {
  background:
    repeating-linear-gradient(115deg, transparent 0 3px, color-mix(in oklch, white 45%, transparent) 3px 4px, transparent 4px 7px),
    linear-gradient(115deg, oklch(84% .12 90), var(--accent) 30%, oklch(80% .12 65) 50%, oklch(86% .1 75) 70%, var(--accent));
  background-size: 100% 100%, 300% 300%; background-position: 0 0, calc(var(--mx) * 1.2) calc(var(--my) * 1.2);
  -webkit-mask: radial-gradient(48% 58% at var(--mx) var(--my), #000, transparent 100%); mask: radial-gradient(48% 58% at var(--mx) var(--my), #000, transparent 100%);
  opacity: .7; }
.pod.p1::after { background: radial-gradient(38% 46% at var(--mx) var(--my), color-mix(in oklch, white 38%, transparent), transparent 70%); mix-blend-mode: soft-light; opacity: 1; }
:global(html.dark) .pod.p1::after { mix-blend-mode: screen; opacity: .5; }
.pod.p1 .big { position: absolute; z-index: 0; left: -0.08em; top: -0.12em; font-size: 13rem; font-weight: 700; line-height: 1; letter-spacing: -0.06em; color: transparent;
  -webkit-text-stroke: 2px color-mix(in oklch, var(--accent) 30%, transparent);
  background: radial-gradient(60% 50% at var(--mx) var(--my), color-mix(in oklch, var(--accent) 40%, transparent), transparent 75%); background-size: 100% 100%;
  -webkit-background-clip: text; background-clip: text; pointer-events: none; user-select: none; }
.pod.p1 .av { width: 5rem; height: 5rem; border-color: var(--accent); background: var(--accent-surface); font-size: 2rem; box-shadow: 0 0 1.5rem color-mix(in oklch, var(--accent) 30%, transparent); }
.pod.p1 .nm { font-size: var(--type-headline-size); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; }
.pod.p1 .v { font-size: var(--type-title-size); color: var(--accent); letter-spacing: -0.03em; line-height: 1; }
.pod.p1 .rk { font-size: var(--type-label-size); }
.pod.p1 .rk svg, .pod.p1 .rk [class*="i-lucide-"] { width: 1.25rem; height: 1.25rem; }
.pod.anon .av { border-color: var(--line-strong); background: var(--surface-raised); color: var(--quiet); box-shadow: none; }
.title-pill { display: inline-block; max-width: 100%; padding: 0 var(--space-2); border: 1px solid color-mix(in oklch, var(--accent) 32%, var(--line-strong)); border-radius: var(--radius-pill); background: color-mix(in oklch, var(--accent) 7%, var(--surface)); color: var(--text); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
@media (max-width: 47.99rem) {
  .podium { grid-template-columns: 1fr; gap: var(--space-2); }
  .pod.p1 { order: 1; }
  .pod.p2 { order: 2; }
  .pod.p3 { order: 3; }
  .pod:not(.p1) { grid-template-columns: 4.5rem auto 1fr auto; justify-items: start; align-items: center; gap: 0 var(--space-3); padding: var(--space-3) var(--space-4); text-align: left; }
  .pod:not(.p1) .av { width: 2.75rem; height: 2.75rem; margin: 0; font-size: 1.1rem; }
  .pod:not(.p1) .ttl { display: none; }
  .pod:not(.p1) .nm { width: 100%; }
  .pod:not(.p1) .v { margin: 0; font-size: var(--type-card-title-size); }
}

/* table */
.board { overflow: hidden; }
.board table { width: 100%; border-collapse: collapse; }
.board th { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; text-align: right; white-space: nowrap; }
.board th:nth-child(-n+2) { text-align: left; }
.board td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-size: var(--type-body-sm-size); }
.board td:nth-child(-n+2) { text-align: left; }
.board-row { cursor: pointer; }
.board-row:hover td { background: color-mix(in oklch, var(--surface-raised) 60%, var(--surface)); }
.board-row.me td { background: var(--accent-surface) !important; }
.rank { width: 3.5rem; font-weight: 600; color: var(--muted); }
.rmark { display: inline-grid; place-items: center; width: 1.75rem; height: 1.75rem; border: 1px solid var(--line-strong); border-radius: var(--radius-control); color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 700; }
.rmark.m1 { border-color: var(--accent); background: color-mix(in oklch, var(--accent) 24%, var(--surface)); }
.rmark.m2 { border-color: color-mix(in oklch, var(--accent) 58%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 14%, var(--surface)); }
.rmark.m3 { border-color: color-mix(in oklch, var(--accent) 32%, var(--line-strong)); background: color-mix(in oklch, var(--accent) 7%, var(--surface)); }
.pl { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.mini { display: grid; place-items: center; flex: none; width: 2rem; height: 2rem; border: 1px solid var(--line-strong); border-radius: 50%; background: var(--surface-raised); color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 600; }
.pn .n { display: flex; align-items: center; gap: var(--space-2); font-size: var(--type-label-size); font-weight: 600; }
.pn .t { color: var(--quiet); font-size: var(--type-caption-size); }
.you { padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--accent); color: var(--on-accent); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.6; }
.prim { font-size: var(--type-label-size); font-weight: 600; color: var(--text); }
.sec { color: var(--muted); }
.empty { padding: var(--space-12) var(--space-4) !important; text-align: center !important; color: var(--muted); white-space: normal !important; }
.pager { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); color: var(--quiet); font-size: var(--type-caption-size); }
.pager .pg { display: flex; gap: var(--space-1); }
.pager button { min-width: var(--control-md); height: var(--control-md); padding: 0 var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); color: var(--text); font-size: var(--type-label-sm-size); cursor: pointer; }
.pager button[disabled] { color: var(--disabled-text); cursor: default; }
.pager button[aria-current="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }
@media (max-width: 47.99rem) { .c-hide { display: none; } .board td, .board th { padding: var(--space-3); } }
.board-skeletons { display: grid; gap: var(--space-2); }
.board-skeleton-row { height: 3.5rem; border-radius: var(--radius-card); }

/* side */
.side { display: grid; gap: var(--space-3); position: sticky; top: 5.5rem; }
@media (max-width: 63.99rem) { .side { position: static; } }
.card { padding: var(--space-4) var(--space-5); }
.card h3 { margin: 0 0 var(--space-2); font-size: var(--type-label-size); font-weight: 600; }
.card p, .card li { margin: 0; color: var(--muted); font-size: var(--type-body-sm-size); }
.card ul { display: grid; gap: var(--space-1); margin: var(--space-3) 0 0; padding-left: var(--space-5); }
.xpt { width: 100%; border-collapse: collapse; margin-top: var(--space-2); }
.xpt td { padding: var(--space-1) 0; border: 0; font-size: var(--type-body-sm-size); }
.xpt td:first-child { color: var(--muted); }
.xpt td:last-child { text-align: right; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
