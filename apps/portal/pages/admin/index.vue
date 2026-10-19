<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { reviewQueueStatuses } from "~/utils/reviewQueue";
import { adminSectionGroups } from "~/utils/admin-sections";

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
    <section class="queue" aria-label="待处理">
      <article v-for="todo in todos" :key="todo.key" class="queue-tile" :class="{ 'is-hot': (todo.state.count ?? 0) > 0 }" :aria-labelledby="`todo-${todo.key}`">
        <header class="queue-tile__head">
          <UIcon :name="todo.icon" aria-hidden="true" />
          <h2 :id="`todo-${todo.key}`">{{ todo.title }}</h2>
          <span v-if="(todo.state.count ?? 0) > 0" class="queue-tile__flag">需处理</span>
        </header>
        <UAlert v-if="todo.state.error" color="error" variant="subtle" :description="todo.state.error">
          <template #actions><UButton label="重试" color="neutral" variant="outline" size="sm" @click="todo.retry" /></template>
        </UAlert>
        <USkeleton v-else-if="loading && todo.state.count === null" class="queue-tile__skeleton" role="status" aria-label="读取中…" />
        <p v-else class="queue-tile__count"><strong class="num">{{ todo.state.count ?? "—" }}</strong><span>{{ todo.unit }}</span></p>
        <p class="queue-tile__hint">{{ todo.hint }}</p>
        <NuxtLink :to="todo.to" class="queue-tile__link">进入队列<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></NuxtLink>
      </article>
    </section>

    <section class="directory" aria-labelledby="directory-title">
      <h2 id="directory-title" class="directory__title">全部模块</h2>
      <div class="directory__groups">
        <section v-for="group in adminSectionGroups" :key="group.label" class="directory-group" :aria-label="group.label">
          <h3 class="directory-group__label"><UIcon :name="group.icon" aria-hidden="true" />{{ group.label }}</h3>
          <ul>
            <li v-for="section in group.sections" :key="section.to">
              <NuxtLink :to="section.to" class="directory-link pressable-soft">
                <UIcon :name="section.icon" class="directory-link__icon" aria-hidden="true" />
                <span><strong>{{ section.label }}</strong><small>{{ section.description }}</small></span>
              </NuxtLink>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.queue { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); gap: var(--space-4); }
.queue-tile { position: relative; display: grid; align-content: start; gap: var(--space-2); padding: var(--space-5); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.queue-tile.is-hot { border-color: color-mix(in oklch, var(--signal) 50%, var(--line)); background: radial-gradient(80% 120% at 100% 0%, color-mix(in oklch, var(--signal) 14%, transparent), transparent 65%), var(--surface); }
.queue-tile.is-hot::before { position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--signal); content: ""; }
.queue-tile__head { display: flex; align-items: center; gap: var(--space-2); color: var(--muted); }
.queue-tile__head h2 { margin: 0; font-size: var(--type-label-size); font-weight: 600; }
.queue-tile__flag { margin-left: auto; padding: 0 var(--space-2); border-radius: calc(var(--radius-control) / 1.5); background: var(--signal); color: oklch(20% .03 75); font-size: var(--type-caption-size); font-weight: 700; line-height: 1.7; }
.queue-tile__count { display: flex; align-items: baseline; gap: var(--space-2); margin: var(--space-2) 0 0; }
.queue-tile__count strong { font-family: var(--font-display); font-size: 3.25rem; font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.queue-tile.is-hot .queue-tile__count strong { color: var(--signal); }
.queue-tile__count span, .queue-tile__hint { color: var(--quiet); }
.queue-tile__hint { margin: 0; font-size: var(--type-caption-size); }
.queue-tile__skeleton { height: 3.25rem; }
.queue-tile__link { display: inline-flex; align-items: center; gap: var(--space-1); width: fit-content; margin-top: var(--space-2); color: var(--text); font-size: var(--type-label-sm-size); font-weight: 600; text-decoration: none; }
.queue-tile__link:hover { color: var(--accent); }
.directory { display: grid; gap: var(--space-4); margin-top: var(--space-4); }
.directory__title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.directory__groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: var(--space-4); align-items: start; }
.directory-group { display: grid; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.directory-group__label { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-1); color: var(--quiet); font-family: var(--font-display); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .1em; }
.directory-group ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.directory-link { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--space-3); padding: var(--space-2); border-radius: var(--radius-control); color: inherit; text-decoration: none; }
.directory-link:hover, .directory-link:focus-visible { background: var(--surface-raised); }
.directory-link__icon { margin-top: 2px; color: var(--accent); }
.directory-link strong { display: block; font-size: var(--type-label-sm-size); font-weight: 600; }
.directory-link small { display: block; color: var(--quiet); font-size: var(--type-caption-size); line-height: 1.45; }
</style>
