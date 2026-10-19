<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { reviewQueueStatuses } from "~/utils/reviewQueue";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "待办 · 躲避堡垒 3" });

type TodoState = { count: number | null; error: string };
const api = useAdminApi();
const reviews = reactive<TodoState>({ count: null, error: "" });
const migration = reactive<TodoState>({ count: null, error: "" });

// Each count comes from the list endpoint that already owns the queue, so the number always matches the page it links to.
// The two reads settle independently: one failing must not hide the other count.
const fetchReviews = async () => (await api<{ total: number }>(`/v1/submissions?page=1&pageSize=1&status=${reviewQueueStatuses}`)).total;
const fetchMigration = async () => (await api<{ stats: { pendingHolderCount: number } }>("/v1/title-grants?filter=pending&page=1&pageSize=1")).stats.pendingHolderCount;

async function settle(state: TodoState, read: () => Promise<number>, message: string) {
  state.error = "";
  try {
    state.count = await read();
  } catch (error) {
    state.count = null;
    state.error = portalErrorDetails(error, message).description;
  }
}
const loadReviews = () => settle(reviews, fetchReviews, "无法读取待审核数量。");
const loadMigration = () => settle(migration, fetchMigration, "无法读取未迁移玩家数量。");

const { loading } = useAdminAsyncData("admin-overview", async () => { await Promise.all([loadReviews(), loadMigration()]); return true; }, {  });

const todos = [
  { key: "reviews", title: "待审核", to: "/admin/reviews", icon: "i-lucide-scan-eye", state: reviews, retry: loadReviews },
  { key: "migration", title: "未迁移", to: "/admin/title-migration", icon: "i-lucide-history", state: migration, retry: loadMigration },
];
</script>

<template>
  <AdminWorkspace title="待办">
    <section class="queue" aria-label="待处理">
      <div v-for="todo in todos" :key="todo.key" class="queue-item">
        <UAlert v-if="todo.state.error" color="error" variant="subtle" :title="todo.title">
          <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="todo.retry" /></template>
        </UAlert>
        <NuxtLink v-else :to="todo.to" class="queue-tile" :class="{ 'is-hot': (todo.state.count ?? 0) > 0 }">
          <span class="queue-tile__label"><UIcon :name="todo.icon" aria-hidden="true" />{{ todo.title }}</span>
          <USkeleton v-if="loading && todo.state.count === null" class="queue-tile__skeleton" role="status" aria-label="读取中…" />
          <strong v-else class="queue-tile__count num">{{ todo.state.count ?? "—" }}</strong>
        </NuxtLink>
      </div>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.queue { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: var(--space-4); }
.queue-tile { position: relative; display: grid; gap: var(--space-3); padding: var(--space-6); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); color: var(--muted); text-decoration: none; transition: border-color 160ms ease; }
.queue-tile:hover, .queue-tile:focus-visible { border-color: var(--line-strong); }
.queue-tile.is-hot { border-color: color-mix(in oklch, var(--signal) 50%, var(--line)); background: radial-gradient(80% 120% at 100% 0%, color-mix(in oklch, var(--signal) 14%, transparent), transparent 65%), var(--surface); }
.queue-tile.is-hot::before { position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--signal); content: ""; }
.queue-tile__label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--type-label-size); font-weight: 600; }
.queue-tile__count { color: var(--text); font-family: var(--font-display); font-size: 4rem; font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.queue-tile.is-hot .queue-tile__count { color: var(--signal); }
.queue-tile__skeleton { height: 4rem; }
@media (prefers-reduced-motion: reduce) { .queue-tile { transition: none; } }
</style>
