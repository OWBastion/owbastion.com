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

// Lazy reads let navigation switch immediately; the page renders its own loading states.
const { data: catalog } = useAsyncData("leaderboard-map-catalog", () => usePublicCatalog<{ items: Map[] }>("maps"), { lazy: true });
const maps = computed(() => catalog.value?.items ?? []);

// Seasons are an optional scope: a failed read just hides the season controls.
const seasons = useAsyncData("leaderboard-seasons", () => api<PublicSeasonListResponse>("/v1/public/seasons").catch(() => ({ contractVersion: "1" as const, items: [] })), { lazy: !seasonId.value, getCachedData: () => undefined });
const seasonList = computed(() => seasons.data.value?.items ?? []);
// Only a season in the URL blocks navigation: it must be checked before the board is read.
if (seasonId.value) await seasons;
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
const { data: boardData, pending: loading, error: boardError, refresh: refreshBoard } = useAsyncData(
  boardKey,
  async () => {
    const params = new URLSearchParams({ board: board.value, page: String(page.value), pageSize: String(PAGE_SIZE) });
    if (board.value === "mastery" && mapId.value) params.set("mapId", mapId.value);
    if (activeSeasonId.value) params.set("seasonId", activeSeasonId.value);
    const response = await api<LeaderboardResponse>(`/v1/public/leaderboard?${params}`);
    return response;
  },
  { lazy: true, getCachedData: () => undefined },
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

/* Ladder: page 1 lifts the top three onto a podium; every row measures itself against the leader. */
const podium = computed(() => page.value === 1 && items.value.length >= 3 ? [items.value[1]!, items.value[0]!, items.value[2]!] : []);
const ladder = computed(() => podium.value.length ? items.value.slice(3) : items.value);
// The leader's score is only on page 1, so it is remembered per board scope for later pages.
const leaderScores = ref<Record<string, number>>({});
const scopeKey = computed(() => boardKey.value.replace(/:\d+$/, ""));
watch(boardData, (data) => { if (data?.page === 1 && data.items[0]) leaderScores.value = { ...leaderScores.value, [scopeKey.value]: data.items[0].score }; }, { immediate: true });
const leaderScore = computed(() => leaderScores.value[scopeKey.value] ?? null);
const share = (entry: LeaderboardEntry) => leaderScore.value ? Math.max(4, Math.round(entry.score / leaderScore.value * 100)) : null;
const entryMeta = (entry: LeaderboardEntry) => board.value === "mastery"
  ? [entry.runCount === undefined ? null : `${entry.runCount} 次`, entry.topDifficulty ?? null].filter(Boolean).join(" · ")
  : entry.latestTitle?.label ?? "";
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
      <div v-if="loading && !items.length" class="board-skeletons" role="status" aria-label="读取中…">
        <USkeleton class="board-skeleton-podium" />
        <USkeleton v-for="index in 6" :key="index" class="board-skeleton-row" />
      </div>
      <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取排行榜">
        <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="refreshBoard()" /></template>
      </UAlert>
      <p v-else-if="!items.length" class="lb-empty">还没有人上榜</p>
      <template v-else>
        <ol v-if="podium.length" class="podium" aria-label="前三名">
          <li v-for="entry in podium" :key="entry.rank" :class="`podium__spot place${entry.rank}`">
            <button type="button" class="podium__player board-row" :class="{ me: isMe(entry) }" @click="openPlayer(entry)">
              <span class="podium__badge podium__badge--empty" aria-hidden="true"><UIcon v-if="entry.rank === 1" name="i-lucide-crown" class="podium__crown" />{{ entryName(entry).charAt(0) }}</span>
              <strong class="podium__name">{{ entryName(entry) }}</strong>
              <span class="podium__score num">{{ entry.score.toLocaleString() }}<small>{{ board === "mastery" ? "XP" : "" }}</small></span>
            </button>
            <span class="podium__plinth num" aria-label="名次">{{ entry.rank }}</span>
          </li>
        </ol>

        <ol class="ladder">
          <li v-for="entry in ladder" :key="entry.rank" :class="{ 'ladder__cut': entry.rank === 11 }">
            <button type="button" class="rung board-row" :class="{ me: isMe(entry) }" @click="openPlayer(entry)">
              <span class="rung__rank num">{{ entry.rank }}</span>
              <span class="rung__badge rung__badge--empty" aria-hidden="true">{{ entryName(entry).charAt(0) }}</span>
              <span class="rung__who">
                <strong>{{ entryName(entry) }}</strong>
                <small v-if="entryMeta(entry)">{{ entryMeta(entry) }}</small>
              </span>
              <span class="rung__score num">{{ entry.score.toLocaleString() }}</span>
              <span v-if="share(entry)" class="rung__bar" aria-hidden="true"><i :style="{ width: `${share(entry)}%` }" /></span>
            </button>
          </li>
        </ol>
      </template>

      <div v-if="totalPages > 1" class="pager">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" aria-label="上一页" :disabled="page === 1" @click="page -= 1" />
        <span class="num">{{ page }} / {{ totalPages }}</span>
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" aria-label="下一页" :disabled="page >= totalPages" @click="page += 1" />
      </div>

      <button v-if="player && mine?.rank" type="button" class="mine" @click="jumpToMe">
        <span class="mine__rank num">#{{ mine.rank }}</span>
        <span class="mine__label">我的位置</span>
        <span v-if="mine.gapToNextRank" class="mine__gap num"><UIcon name="i-lucide-chevrons-up" aria-hidden="true" />{{ mine.gapToNextRank.toLocaleString() }}</span>
        <b class="num">{{ mine.score.toLocaleString() }}</b>
      </button>
      <NuxtLink v-else-if="!player && !minePending" to="/login" class="mine mine--login">登录看我的排名</NuxtLink>
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
.lb-board { display: grid; gap: var(--space-4); }

/* Podium: second, first, third; plinth height and metal tone mark the place. */
.podium { --gold: oklch(82% .14 85); --silver: oklch(84% .02 250); --bronze: oklch(68% .11 55); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: var(--space-2); margin: var(--space-4) 0 0; padding: 0; list-style: none; }
.podium__spot { --metal: var(--bronze); --plinth: 3.5rem; display: grid; justify-items: center; gap: var(--space-2); min-width: 0; }
.podium__spot.place1 { --metal: var(--gold); --plinth: 6rem; isolation: isolate; }
.podium__spot.place2 { --metal: var(--silver); --plinth: 4.5rem; }
.podium__player { display: grid; justify-items: center; gap: var(--space-1); width: 100%; min-width: 0; padding: var(--space-2) var(--space-1); border: 0; border-radius: var(--radius-card); background: none; color: var(--text); font: inherit; cursor: pointer; }
.podium__badge { --avatar-size: 3.75rem; display: grid; width: var(--avatar-size); height: var(--avatar-size); place-items: center; margin-bottom: var(--space-1); }
.place1 .podium__badge { --avatar-size: 5rem; margin-top: var(--space-6); }
.podium__badge { position: relative; }
.place1 .podium__badge::before { position: absolute; z-index: -1; inset: -35%; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in oklch, var(--gold) 55%, transparent), color-mix(in oklch, var(--gold) 14%, transparent) 60%, transparent); content: ""; animation: podium-glow 4.5s ease-in-out infinite; }
.place1 .podium__badge::after { position: absolute; inset: -.25rem; border: 2px solid var(--gold); border-radius: 50%; content: ""; opacity: 0; animation: podium-ring 3.6s ease-out infinite; }
.podium__crown { position: absolute; top: -1.6rem; left: 50%; width: 1.75rem; height: 1.75rem; color: var(--gold); filter: drop-shadow(0 0 .4rem color-mix(in oklch, var(--gold) 70%, transparent)); transform: translateX(-50%); animation: podium-crown 4.5s ease-in-out infinite; }
@keyframes podium-glow { 0%, 100% { opacity: .6; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
@keyframes podium-ring { 0% { opacity: .7; transform: scale(1); } 100% { opacity: 0; transform: scale(1.35); } }
@keyframes podium-crown { 0%, 100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .place1 .podium__badge::before, .place1 .podium__badge::after, .podium__crown { animation: none; } }
.podium__badge--empty { border: 2px solid var(--metal); border-radius: 50%; color: var(--metal); font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; }
.podium__name { max-width: 100%; overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.podium__score { color: var(--metal); font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.place1 .podium__score { font-size: 1.5rem; }
.podium__score small { margin-left: .2em; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.podium__plinth { display: grid; width: 100%; height: var(--plinth); place-items: start center; padding-top: var(--space-2); border-top: 3px solid var(--metal); border-radius: var(--radius-control) var(--radius-control) 0 0; background: linear-gradient(color-mix(in oklch, var(--metal) 22%, transparent), color-mix(in oklch, var(--metal) 4%, transparent)); color: var(--metal); font-family: var(--font-display); font-size: 1.75rem; font-weight: 800; line-height: 1; }
.podium__player.me .podium__name { color: var(--accent); }

/* Ladder rows: rank, badge, who, score, and a bar measuring the gap to the leader. */
.ladder { display: grid; margin: 0; padding: 0; list-style: none; }
.ladder > li + li { border-top: 1px solid var(--line); }
.ladder > li.ladder__cut { position: relative; margin-top: var(--space-5); border-top: 1px dashed color-mix(in oklch, var(--accent) 50%, var(--line)); }
.ladder > li.ladder__cut::before { position: absolute; top: -.7rem; left: 0; padding-right: var(--space-2); background: var(--page); color: var(--accent); content: "前 10"; font-size: var(--type-caption-size); font-weight: 600; }
.rung { display: grid; grid-template-columns: 2.75rem 2.25rem minmax(0, 1fr) auto; grid-template-areas: "rank badge who score" "rank badge bar bar"; align-items: center; column-gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-2); border: 0; border-radius: var(--radius-control); background: none; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.rung:hover, .rung:focus-visible { background: var(--surface-raised); }
.rung.me { background: var(--accent-surface); box-shadow: inset 3px 0 0 var(--accent); }
.rung__rank { grid-area: rank; color: var(--muted); font-family: var(--font-display); font-size: 1.375rem; font-weight: 700; text-align: center; }
.rung__badge { display: grid; grid-area: badge; place-items: center; width: 2.25rem; height: 2.25rem; border: 1px solid var(--line-strong); border-radius: 50%; color: var(--muted); font-family: var(--font-display); font-weight: 700; }
.rung__who { display: grid; grid-area: who; min-width: 0; }
.rung__who strong { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.rung__who small { overflow: hidden; color: var(--quiet); font-size: var(--type-caption-size); text-overflow: ellipsis; white-space: nowrap; }
.rung__score { grid-area: score; font-family: var(--font-display); font-weight: 700; }
.rung__bar { grid-area: bar; height: 3px; margin-top: var(--space-2); border-radius: var(--radius-pill); background: var(--line); overflow: hidden; }
.rung__bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in oklch, var(--accent) 40%, transparent), var(--accent)); }

/* My standing stays in reach while scrolling: rank, gap to the next place, score. */
.mine { position: sticky; z-index: 1; bottom: calc(var(--tab-bar-height, 0px) + var(--space-3)); display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid color-mix(in oklch, var(--accent) 55%, var(--line)); border-radius: var(--radius-card); background: color-mix(in oklch, var(--surface) 88%, var(--accent)); box-shadow: 0 .75rem 2rem -1rem rgb(0 0 0 / .6); color: var(--text); font: inherit; text-align: left; text-decoration: none; cursor: pointer; backdrop-filter: blur(12px); }
.mine__rank { color: var(--accent); font-family: var(--font-display); font-size: 1.375rem; font-weight: 800; }
.mine__label { color: var(--muted); font-size: var(--type-label-sm-size); }
.mine__gap { display: inline-flex; align-items: center; gap: .15rem; margin-left: auto; color: var(--quiet); font-size: var(--type-caption-size); }
.mine b { font-family: var(--font-display); font-size: 1.125rem; }
.mine__gap + b { margin-left: var(--space-2); }
.mine__label + b { margin-left: auto; }
.mine--login { justify-content: center; color: var(--accent); font-weight: 600; }
.lb-empty { margin: 0; padding: var(--space-12) 0; color: var(--quiet); text-align: center; }
.board-skeletons { display: grid; gap: var(--space-2); }
.board-skeleton-podium { height: 13rem; border-radius: var(--radius-card); }
.board-skeleton-row { height: 3.75rem; border-radius: var(--radius-control); }
.pager { display: flex; align-items: center; justify-content: center; gap: var(--space-3); color: var(--muted); font-size: var(--type-label-sm-size); }
@media (max-width: 47.99rem) { .lb { padding-block: var(--space-8) var(--space-12); } }
</style>
