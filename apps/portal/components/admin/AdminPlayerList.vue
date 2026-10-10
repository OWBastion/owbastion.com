<script setup lang="ts">
import type { AdminPlayer } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";

defineProps<{ selectedId?: string }>();

const pageSize = 20;
const api = useAdminApi();
const revision = useState("admin-players-revision", () => 0);
const players = ref<AdminPlayer[]>([]);
const query = ref("");
const status = ref<"all" | "active" | "banned">("all");
const page = ref(1);
const total = ref(0);
const errorMessage = ref("");
const statusFilters = [{ value: "all", label: "全部" }, { value: "active", label: "正常" }, { value: "banned", label: "已封禁" }] as const;

const listQuery = computed(() => `query=${encodeURIComponent(query.value.trim())}&page=${page.value}&pageSize=${pageSize}${status.value === "all" ? "" : `&status=${status.value}`}`);
const { loading, refresh } = useAdminAsyncData("players", () => api<{ items: AdminPlayer[]; total: number }>(`/v1/player-accounts?${listQuery.value}`), {
  cacheKey: listQuery,
  onStart: () => { errorMessage.value = ""; },
  onData: (response) => { players.value = response.items; total.value = response.total; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取玩家帐号，请确认当前账号有管理员权限。").description; },
});

watch([query, status], () => { page.value = 1; }, { flush: "sync" });
function moveFocus(event: KeyboardEvent) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const links = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("a")];
  const next = links[links.indexOf(document.activeElement as HTMLElement) + (event.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

watch(revision, () => { void refresh(); });
</script>

<template>
  <section class="player-list" aria-label="玩家列表">
    <div class="player-list__tools">
      <UInput v-model="query" class="player-list__search" size="md" icon="i-lucide-search" aria-label="搜索玩家" placeholder="搜索战网 ID 或 QQ 标识" />
      <div class="player-list__chips" role="group" aria-label="筛选玩家状态">
        <button v-for="filter in statusFilters" :key="filter.value" type="button" class="chip" :aria-pressed="status === filter.value" @click="status = filter.value">{{ filter.label }}</button>
        <span class="player-list__count">{{ loading ? "读取中…" : `${total} 位` }}</span>
      </div>
    </div>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    <ul v-if="players.length" class="player-list__rows" @keydown="moveFocus">
      <li v-for="player in players" :key="player.playerAccountId">
        <NuxtLink :to="`/admin/players/${player.playerAccountId}`" class="player-row" :aria-current="player.playerAccountId === selectedId ? 'page' : undefined">
          <span class="player-row__name"><strong>{{ player.playerName }}</strong><small>#{{ player.playerId }}</small></span>
          <span class="player-row__tags">
            <span v-if="player.pendingSubmissionCount" class="tag tag--attention">待审 {{ player.pendingSubmissionCount }}</span>
            <span v-if="player.status === 'banned'" class="tag tag--warning">已封禁</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
    <p v-else-if="!loading" class="player-list__empty">暂无匹配玩家。</p>
    <div v-if="total > pageSize" class="player-list__pager">
      <UButton label="上一页" size="sm" color="neutral" variant="outline" :disabled="page <= 1" @click="page -= 1" />
      <span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <UButton label="下一页" size="sm" color="neutral" variant="outline" :disabled="page * pageSize >= total" @click="page += 1" />
    </div>
  </section>
</template>

<style scoped>
.player-list { display: grid; align-content: start; gap: var(--space-3); min-width: 0; }
.player-list__tools { display: grid; gap: var(--space-2); }
.player-list__search { width: 100%; }
.player-list__chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.chip { transition: background-color 120ms ease, transform 100ms ease-out; min-height: 2rem; padding: 0 var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-pill); background: transparent; color: var(--muted); font-size: var(--type-caption-size); font-weight: 600; cursor: pointer; }
.chip:active { transform: scale(.96); }
.chip[aria-pressed="true"] { border-color: transparent; background: var(--accent); color: var(--on-accent); }
.player-list__count { margin-left: auto; color: var(--quiet); font-size: var(--type-caption-size); }
.player-list__rows { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.player-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); color: var(--text); text-decoration: none; transition: background-color 120ms ease, transform 100ms ease-out; }
.player-row:active { transform: scale(.985); background: var(--accent-surface); }
.player-row:hover { background: color-mix(in oklch, var(--surface-raised) 70%, transparent); }
.player-row[aria-current="page"] { background: var(--accent-surface); }
.player-row__name { display: flex; align-items: baseline; gap: var(--space-1); min-width: 0; overflow-wrap: anywhere; }
.player-row__name small { color: var(--quiet); }
.player-row__tags { display: flex; flex: none; gap: var(--space-1); }
.tag { padding: 0 var(--space-2); border-radius: var(--radius-pill); font-size: var(--type-caption-size); font-weight: 700; line-height: 1.6; white-space: nowrap; }
.tag--attention { background: var(--accent-surface); color: var(--accent); }
.tag--warning { background: color-mix(in oklch, var(--danger) 14%, var(--surface)); color: var(--danger); }
.player-list__empty { margin: 0; padding: var(--space-5); color: var(--quiet); text-align: center; }
.player-list__pager { display: flex; align-items: center; justify-content: space-between; color: var(--quiet); font-size: var(--type-caption-size); }
@media (prefers-reduced-motion: reduce) { .chip, .player-row { transition: none; } .chip:active, .player-row:active { transform: none; } }
</style>
