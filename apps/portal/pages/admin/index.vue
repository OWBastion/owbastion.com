<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { reviewQueueStatuses } from "~/utils/reviewQueue";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "待办总览 · 躲避堡垒 3" });

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
  { key: "reviews", title: "待审核截图", unit: "条", hint: "等待维护者决定的提交", to: "/admin/reviews", icon: "i-lucide-scan-eye", state: reviews, retry: loadReviews },
  { key: "migration", title: "未迁移玩家", unit: "人", hint: "仍有历史称号未认领的玩家", to: "/admin/title-migration", icon: "i-lucide-history", state: migration, retry: loadMigration },
];
</script>

<template>
  <AdminWorkspace title="待办总览">
    <ul class="todo-list">
      <li v-for="todo in todos" :key="todo.key">
        <article class="todo-card surface-card" :aria-labelledby="`todo-${todo.key}`">
          <header class="todo-heading">
            <UIcon :name="todo.icon" aria-hidden="true" />
            <h2 :id="`todo-${todo.key}`">{{ todo.title }}</h2>
          </header>
          <UAlert v-if="todo.state.error" color="error" variant="subtle" :description="todo.state.error">
            <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="todo.retry" /></template>
          </UAlert>
          <USkeleton v-else-if="loading && todo.state.count === null" class="todo-skeleton" role="status" aria-label="读取中…" />
          <template v-else>
            <p class="todo-count"><strong class="num">{{ todo.state.count ?? "—" }}</strong><span>{{ todo.unit }}</span></p>
            <p class="todo-hint">{{ todo.hint }}</p>
          </template>
          <UButton :to="todo.to" label="查看" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right" />
        </article>
      </li>
    </ul>
  </AdminWorkspace>
</template>

<style scoped>
.todo-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
.todo-card { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-5); }
.todo-heading { display: flex; align-items: center; gap: var(--space-2); color: var(--muted); }
.todo-heading h2 { margin: 0; font-size: var(--type-label-size); font-weight: 600; }
.todo-count { display: flex; align-items: baseline; gap: var(--space-2); margin: 0; }
.todo-count strong { font-size: 2rem; letter-spacing: -.04em; }
.todo-count span, .todo-hint { color: var(--quiet); }
.todo-hint { margin: 0; font-size: var(--type-caption-size); }
.todo-skeleton { height: 3.25rem; }
.todo-card > :last-child { justify-self: start; }
</style>
