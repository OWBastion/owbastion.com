<script setup lang="ts">
import type { AdminBindingClaim, AdminSubmission } from "~/composables/useAdminApi";
import { adminSectionGroups } from "~/utils/admin-sections";
import { portalErrorDetails } from "~/utils/portal-error";
import { reviewQueueStatuses } from "~/utils/reviewQueue";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "总览 · 躲避堡垒 3" });

type Metric = { count: number | null; error: string };
const api = useAdminApi();
const waitingLimit = 5;

// Every figure comes from the list endpoint that already owns it, so a number always matches the page it links to.
// Reads settle independently: one failing must not hide the others.
const metrics = {
  reviews: reactive<Metric>({ count: null, error: "" }),
  migration: reactive<Metric>({ count: null, error: "" }),
  claims: reactive<Metric>({ count: null, error: "" }),
  players: reactive<Metric>({ count: null, error: "" }),
  runs: reactive<Metric>({ count: null, error: "" }),
  maps: reactive<Metric>({ count: null, error: "" }),
  events: reactive<Metric>({ count: null, error: "" }),
};
const waiting = reactive<{ items: AdminSubmission[] | null; error: string }>({ items: null, error: "" });

const sources: Record<keyof typeof metrics, { read: () => Promise<number>; message: string }> = {
  reviews: { read: async () => (await api<{ total: number }>(`/v1/submissions?page=1&pageSize=1&status=${reviewQueueStatuses}`)).total, message: "无法读取待核对截图数量。" },
  migration: { read: async () => (await api<{ stats: { pendingHolderCount: number } }>("/v1/title-grants?filter=pending&page=1&pageSize=1")).stats.pendingHolderCount, message: "无法读取未迁移玩家数量。" },
  claims: { read: async () => (await api<{ items: AdminBindingClaim[] }>("/v1/binding-claims")).items.filter((claim) => claim.status === "pending_review").length, message: "无法读取待处理绑定例外。" },
  players: { read: async () => (await api<{ total: number }>("/v1/player-accounts?status=active&page=1&pageSize=1")).total, message: "无法读取玩家数量。" },
  runs: { read: async () => (await api<{ total: number }>("/v1/verified-runs?page=1&pageSize=1")).total, message: "无法读取通关记录数量。" },
  maps: { read: async () => (await api<{ items: unknown[] }>("/v1/maps")).items.length, message: "无法读取地图数量。" },
  events: { read: async () => (await api<{ items: unknown[] }>("/v1/events?archived=false")).items.length, message: "无法读取随机事件数量。" },
};

async function settle(key: keyof typeof metrics) {
  const metric = metrics[key];
  metric.error = "";
  try {
    metric.count = await sources[key].read();
  } catch (error) {
    metric.count = null;
    metric.error = portalErrorDetails(error, sources[key].message).description;
  }
}
async function loadWaiting() {
  waiting.error = "";
  try {
    waiting.items = (await api<{ items: AdminSubmission[] }>(`/v1/submissions?page=1&pageSize=${waitingLimit}&status=${reviewQueueStatuses}&order=oldest`)).items;
  } catch (error) {
    waiting.items = null;
    waiting.error = portalErrorDetails(error, "无法读取待核对截图。").description;
  }
}

const { loading, refresh } = useAdminAsyncData("admin-overview", async () => {
  await Promise.all([...(Object.keys(metrics) as (keyof typeof metrics)[]).map(settle), loadWaiting()]);
  return true;
});

const todos = [
  { key: "reviews", title: "截图待核对", to: "/admin/reviews", icon: "i-lucide-scan-eye" },
  { key: "migration", title: "称号待迁移", to: "/admin/title-migration", icon: "i-lucide-history" },
  { key: "claims", title: "绑定例外", to: "/admin/bindings", icon: "i-lucide-link" },
] as const;
const totals = [
  { key: "players", title: "活跃玩家", to: "/admin/players", icon: "i-lucide-users" },
  { key: "runs", title: "通关记录", to: "/admin/verified-runs", icon: "i-lucide-trophy" },
  { key: "maps", title: "地图", to: "/admin/maps", icon: "i-lucide-map" },
  { key: "events", title: "随机事件", to: "/admin/events", icon: "i-lucide-zap" },
] as const;

const now = useState("admin-overview-now", () => Date.now());
onMounted(() => { now.value = Date.now(); });
function waitingFor(createdAt: number) {
  const minutes = Math.max(0, Math.floor((now.value - createdAt) / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} 小时` : `${Math.floor(hours / 24)} 天`;
}
</script>

<template>
  <AdminWorkspace title="总览">
    <template #actions>
      <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="loading" @click="refresh" />
    </template>

    <section class="dash-section" aria-labelledby="dash-todo">
      <h2 id="dash-todo" class="dash-heading">待处理</h2>
      <div class="dash-grid dash-grid--todo">
        <template v-for="todo in todos" :key="todo.key">
          <UAlert v-if="metrics[todo.key].error" color="error" variant="subtle" :title="todo.title" :description="metrics[todo.key].error">
            <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="settle(todo.key)" /></template>
          </UAlert>
          <NuxtLink v-else :to="todo.to" class="tile tile--todo" :class="{ 'is-hot': (metrics[todo.key].count ?? 0) > 0 }">
            <span class="tile__label"><UIcon :name="todo.icon" aria-hidden="true" />{{ todo.title }}</span>
            <USkeleton v-if="metrics[todo.key].count === null" class="tile__skeleton tile__skeleton--lg" role="status" aria-label="读取中…" />
            <strong v-else class="tile__count tile__count--lg num">{{ metrics[todo.key].count }}</strong>
          </NuxtLink>
        </template>
      </div>
    </section>

    <section class="dash-section" aria-labelledby="dash-totals">
      <h2 id="dash-totals" class="dash-heading">平台概况</h2>
      <div class="dash-grid dash-grid--totals">
        <template v-for="total in totals" :key="total.key">
          <UAlert v-if="metrics[total.key].error" color="error" variant="subtle" :title="total.title" :description="metrics[total.key].error">
            <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="settle(total.key)" /></template>
          </UAlert>
          <NuxtLink v-else :to="total.to" class="tile">
            <span class="tile__label"><UIcon :name="total.icon" aria-hidden="true" />{{ total.title }}</span>
            <USkeleton v-if="metrics[total.key].count === null" class="tile__skeleton" role="status" aria-label="读取中…" />
            <strong v-else class="tile__count num">{{ metrics[total.key].count }}</strong>
          </NuxtLink>
        </template>
      </div>
    </section>

    <div class="dash-columns">
      <section class="panel" aria-labelledby="dash-waiting">
        <header class="panel__header">
          <h2 id="dash-waiting" class="dash-heading">等待最久的截图</h2>
          <UButton label="全部审核" to="/admin/reviews" trailing-icon="i-lucide-arrow-right" color="neutral" variant="link" size="sm" />
        </header>
        <UAlert v-if="waiting.error" color="error" variant="subtle" title="待核对截图" :description="waiting.error">
          <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="loadWaiting" /></template>
        </UAlert>
        <div v-else-if="waiting.items === null" class="panel__list" role="status" aria-label="读取中…">
          <USkeleton v-for="n in waitingLimit" :key="n" class="row-skeleton" />
        </div>
        <p v-else-if="!waiting.items.length" class="panel__empty">没有等待核对的截图。</p>
        <ul v-else class="panel__list">
          <li v-for="item in waiting.items" :key="item.submissionId">
            <NuxtLink :to="`/admin/reviews/${encodeURIComponent(item.submissionId)}`" class="row">
              <span class="row__main"><strong>{{ item.mapName }}</strong><small>{{ item.difficulty }} · {{ item.playerName }}</small></span>
              <span class="row__wait num">已等 {{ waitingFor(item.createdAt) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section class="panel" aria-labelledby="dash-directory">
        <header class="panel__header"><h2 id="dash-directory" class="dash-heading">全部管理项</h2></header>
        <div class="directory">
          <div v-for="group in adminSectionGroups" :key="group.label" class="directory__group">
            <h3 class="directory__title"><UIcon :name="group.icon" aria-hidden="true" />{{ group.label }}</h3>
            <ul>
              <li v-for="section in group.sections" :key="section.to"><NuxtLink :to="section.to">{{ section.label }}</NuxtLink></li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  </AdminWorkspace>
</template>

<style scoped>
.dash-section { display: grid; gap: var(--space-3); }
.dash-heading { margin: 0; color: var(--muted); font-size: var(--type-label-size); font-weight: 600; }
.dash-grid { display: grid; gap: var(--space-4); }
.dash-grid--todo { grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); }
.dash-grid--totals { grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); }
.tile { position: relative; display: grid; gap: var(--space-2); padding: var(--space-5); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); color: var(--muted); text-decoration: none; transition: border-color 160ms ease; }
.tile:hover, .tile:focus-visible { border-color: var(--line-strong); }
.tile.is-hot { border-color: color-mix(in oklch, var(--signal) 50%, var(--line)); background: radial-gradient(80% 120% at 100% 0%, color-mix(in oklch, var(--signal) 14%, transparent), transparent 65%), var(--surface); }
.tile.is-hot::before { position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--signal); content: ""; }
.tile__label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--type-label-size); font-weight: 600; }
.tile__count { color: var(--text); font-family: var(--font-display); font-size: 2rem; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
.tile__count--lg { font-size: 3.5rem; line-height: 1; letter-spacing: -.03em; }
.tile.is-hot .tile__count { color: var(--signal); }
.tile__skeleton { height: 2.2rem; }
.tile__skeleton--lg { height: 3.5rem; }
.dash-columns { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--space-4); align-items: start; }
.panel { display: grid; gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.panel__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.panel__list { display: grid; margin: 0; padding: 0; list-style: none; }
.panel__list > li + li { border-top: 1px solid var(--line); }
.panel__empty { margin: 0; padding: var(--space-4) 0; color: var(--quiet); text-align: center; }
.row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-1); color: var(--text); text-decoration: none; }
.row:hover .row__main strong, .row:focus-visible .row__main strong { text-decoration: underline; }
.row__main { display: grid; min-width: 0; }
.row__main small { color: var(--quiet); overflow-wrap: anywhere; }
.row__wait { flex: none; color: var(--muted); font-size: var(--type-caption-size); }
.row-skeleton { height: 2.75rem; margin-block: var(--space-1); }
.directory { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 9rem), 1fr)); gap: var(--space-4); }
.directory__title { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-2); color: var(--muted); font-size: var(--type-caption-size); font-weight: 600; }
.directory ul { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.directory a { color: var(--text); font-size: var(--type-label-size); text-decoration: none; }
.directory a:hover, .directory a:focus-visible { text-decoration: underline; }
@media (max-width: 63.99rem) { .dash-columns { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .tile { transition: none; } }
</style>
