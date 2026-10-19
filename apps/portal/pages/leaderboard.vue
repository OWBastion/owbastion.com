<script setup lang="ts">
import type {
  CurrentPlayerLeaderboardRank,
  LeaderboardBoard,
  LeaderboardEntry,
  LeaderboardResponse,
  Map,
  PublicSeasonListResponse,
} from "@owbastion/contracts";
import { verifiedRunXpRuleV3 } from "@owbastion/domain";
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
const seasonId = ref<string | undefined>(typeof route.query.seasonId === "string" ? route.query.seasonId : undefined);
const page = ref(1);

const { data: catalog } = await useAsyncData("leaderboard-map-catalog", () => usePublicCatalog<{ items: Map[] }>("maps"));
const maps = computed(() => catalog.value?.items ?? []);

// Seasons are an optional scope: a failed read just hides the season controls.
const { data: seasonCatalog } = await useAsyncData("leaderboard-seasons", () => api<PublicSeasonListResponse>("/v1/public/seasons").catch(() => ({ contractVersion: "1" as const, items: [] })), { getCachedData: () => undefined });
const seasonList = computed(() => seasonCatalog.value?.items ?? []);
if (seasonId.value && !seasonList.value.some((season) => season.seasonId === seasonId.value)) seasonId.value = undefined;
const activeSeasonId = computed(() => board.value === "mastery" ? seasonId.value : undefined);
// One select carries both scopes; "all" stands for all-time because a select item needs a value.
const seasonItems = computed(() => [{ label: "全部时间", value: "all" }, ...seasonList.value.map((season) => ({ label: season.name, value: season.seasonId }))]);
const seasonValue = computed({ get: () => seasonId.value ?? "all", set: (value: string) => setSeasonScope(value === "all" ? undefined : value) });
const mapItems = computed(() => [{ label: "全部地图", value: "all" }, ...maps.value.map((map) => ({ label: map.mapName, value: map.mapId }))]);
const mapValue = computed({ get: () => mapId.value ?? "all", set: (value: string) => setMap(value === "all" ? undefined : value) });

// Reactive key: board/map/page changes are distinct fetches. Rankings change
// underneath navigation, so payload reuse is off — each key fetches live.
const boardKey = computed(() => `leaderboard-board:${board.value}:${board.value === "mastery" ? (mapId.value ?? "all") : "—"}:${activeSeasonId.value ?? "all-time"}:${page.value}`);
const { data: boardData, pending: loading, error: boardError, refresh: refreshBoard } = await useAsyncData(
  boardKey,
  async () => {
    const params = new URLSearchParams({ board: board.value, page: String(page.value), pageSize: String(PAGE_SIZE) });
    if (board.value === "mastery" && mapId.value) params.set("mapId", mapId.value);
    if (activeSeasonId.value) params.set("seasonId", activeSeasonId.value);
    const response = await api<LeaderboardResponse>(`/v1/public/leaderboard?${params}`);
    return response;
  },
  { getCachedData: () => undefined },
);

const items = computed(() => boardData.value?.items ?? []);
const error = computed(() => boardError.value ? portalErrorDetails(boardError.value, "请稍后重试。").description : "");

const setBoard = (next: LeaderboardBoard) => { if (board.value !== next) { board.value = next; page.value = 1; } };
const setMap = (next: string | undefined) => { if (mapId.value !== next) { mapId.value = next; page.value = 1; } };
const setSeasonScope = (season: string | undefined) => { if (seasonId.value !== season) { seasonId.value = season; page.value = 1; } };
/* Own standing: a signed-in Player's rank rides the same board and scope. */
const mine = shallowRef<CurrentPlayerLeaderboardRank | null>(null);
const minePending = ref(false);
async function loadMine() {
  if (!player.value) { mine.value = null; return; }
  minePending.value = true;
  try {
    const params = new URLSearchParams({ board: board.value });
    if (board.value === "mastery" && mapId.value) params.set("mapId", mapId.value);
    if (activeSeasonId.value) params.set("seasonId", activeSeasonId.value);
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
watch([board, mapId, activeSeasonId], () => { if (import.meta.client) void loadMine(); });

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

const totalPages = computed(() => Math.max(1, Math.ceil((boardData.value?.total ?? 0) / PAGE_SIZE)));
const difficultyTiers = (Object.entries(verifiedRunXpRuleV3.baseDifficultyXp) as Array<[string, number]>).filter(([, xp]) => xp > 0);
const ratingTiers = Object.entries(verifiedRunXpRuleV3.mapRatingBonus) as Array<[string, number]>;
const entryName = (entry: LeaderboardEntry) => entry.player?.displayName ?? "匿名玩家";
const isMe = (entry: LeaderboardEntry) => mine.value?.rank !== null && entry.rank === mine.value?.rank;
</script>

<template>
  <main class="lb page-shell">
    <header class="lb-head">
      <h1 class="lb-title">排行榜</h1>
      <div class="seg" role="group" aria-label="排行榜">
        <button type="button" :aria-pressed="board === 'mastery'" @click="setBoard('mastery')">精通</button>
        <button type="button" :aria-pressed="board === 'achievement'" @click="setBoard('achievement')">成就</button>
      </div>
    </header>

    <div v-if="board === 'mastery'" class="lb-filters">
      <USelect v-model="mapValue" :items="mapItems" aria-label="地图" class="lb-select" />
      <USelect v-if="seasonList.length" v-model="seasonValue" :items="seasonItems" aria-label="时间范围" class="lb-select" />
      <UPopover :content="{ align: 'end' }">
        <UButton icon="i-lucide-circle-help" color="neutral" variant="ghost" aria-label="精通 XP 怎么算" class="lb-help" />
        <template #content>
          <div class="rules">
            <div class="rules__base num">
              <div v-for="[difficulty, xp] in difficultyTiers" :key="difficulty"><span>{{ difficulty }}</span><b>{{ xp }}</b></div>
            </div>
            <p class="num">成就 +{{ Math.round(verifiedRunXpRuleV3.achievementBonus * 100) }}% · 每日首通 +{{ Math.round(verifiedRunXpRuleV3.dailyFirstClearBonus * 100) }}%</p>
            <p class="num">评级 <span v-for="[rating, bonus] in ratingTiers" :key="rating">{{ rating }} {{ bonus ? `+${Math.round(bonus * 100)}%` : "—" }} </span></p>
          </div>
        </template>
      </UPopover>
    </div>

    <section ref="boardSection" class="lb-board" :aria-busy="loading || undefined" aria-label="排名">
      <button v-if="player && mine?.rank" type="button" class="mine pressable" @click="jumpToMe">
        <span class="num">#{{ mine.rank }}</span>
        <span>你</span>
        <b class="num">{{ mine.score.toLocaleString() }}</b>
      </button>
      <NuxtLink v-else-if="!player && !minePending" to="/login" class="mine mine--login">登录看排名</NuxtLink>

      <div v-if="loading && !items.length" class="board-skeletons" role="status" aria-label="读取中…">
        <USkeleton v-for="index in 8" :key="index" class="board-skeleton-row" />
      </div>
      <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取排行榜">
        <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="refreshBoard()" /></template>
      </UAlert>
      <p v-else-if="!items.length" class="lb-empty">还没有人上榜</p>
      <ol v-else class="rows">
        <li v-for="entry in items" :key="entry.rank">
          <button type="button" class="row board-row" :class="{ me: isMe(entry), [`top${entry.rank}`]: entry.rank <= 3 }" @click="openPlayer(entry)">
            <span class="row__rank num">{{ entry.rank }}</span>
            <span class="row__name">{{ entryName(entry) }}</span>
            <span class="row__score num">{{ entry.score.toLocaleString() }}<small>{{ board === "mastery" ? "XP" : "" }}</small></span>
          </button>
        </li>
      </ol>
      <div v-if="totalPages > 1" class="pager">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" aria-label="上一页" :disabled="page === 1" @click="page -= 1" />
        <span class="num">{{ page }} / {{ totalPages }}</span>
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" aria-label="下一页" :disabled="page >= totalPages" @click="page += 1" />
      </div>
    </section>

    <LeaderboardPlayerSheet v-model:open="sheetOpen" :entry="selectedEntry" />
  </main>
</template>

<style scoped>
.lb { display: grid; align-content: start; gap: var(--space-6); max-width: 44rem; padding-block: clamp(3rem, 10vh, 6rem) 4.5rem; }
.lb-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4); }
.lb-title { margin: 0; font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3rem); font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.seg { display: inline-flex; gap: 0.125rem; padding: 0.1875rem; border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface-raised); }
.seg button { min-height: var(--control-md); padding: 0 var(--space-4); border: 0; border-radius: calc(var(--radius-control) / 1.5); background: none; color: var(--muted); font-size: var(--type-body-sm-size); font-weight: 500; white-space: nowrap; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: var(--elevation-1); }
.lb-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: calc(-1 * var(--space-2)); }
.lb-select { min-width: 9rem; }
.lb-help { margin-left: auto; }
.rules { display: grid; gap: var(--space-2); max-width: 18rem; padding: var(--space-4); font-size: var(--type-caption-size); }
.rules p { margin: 0; color: var(--muted); }
.rules__base { display: flex; gap: var(--space-4); }
.rules__base div { display: grid; }
.rules__base span { color: var(--quiet); }
.rules__base b { color: var(--accent); font-size: 1.125rem; }
.lb-board { display: grid; gap: var(--space-3); }
.mine { display: flex; align-items: baseline; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid color-mix(in oklch, var(--accent) 50%, var(--line)); border-radius: var(--radius-card); background: var(--accent-surface); color: var(--text); font: inherit; text-align: left; text-decoration: none; cursor: pointer; }
.mine > .num:first-child { color: var(--accent); font-family: var(--font-display); font-weight: 700; }
.mine b { margin-left: auto; }
.mine--login { justify-content: center; color: var(--accent); font-weight: 600; }
.rows { display: grid; margin: 0; padding: 0; list-style: none; }
.rows > li + li { border-top: 1px solid var(--line); }
.row { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); width: 100%; min-height: 3.25rem; padding: 0 var(--space-2); border: 0; border-radius: var(--radius-control); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.row:hover, .row:focus-visible { background: var(--surface-raised); }
.row.me { background: var(--accent-surface); }
.row__rank { color: var(--quiet); font-family: var(--font-display); font-weight: 700; }
.row.top1 .row__rank, .row.top2 .row__rank, .row.top3 .row__rank { color: var(--accent); font-size: 1.125rem; }
.row__name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.row__score { font-weight: 700; }
.row__score small { margin-left: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.lb-empty { margin: 0; padding: var(--space-12) 0; color: var(--quiet); text-align: center; }
.board-skeletons { display: grid; gap: var(--space-2); }
.board-skeleton-row { height: 3.25rem; border-radius: var(--radius-control); }
.pager { display: flex; align-items: center; justify-content: center; gap: var(--space-3); color: var(--muted); font-size: var(--type-label-sm-size); }
@media (max-width: 47.99rem) { .lb { padding-block: var(--space-8) var(--space-12); } }
</style>
