<script setup lang="ts">
import type { AdminGroup, AdminSubmission } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "管理后台 · 躲避堡垒 3" });

const api = useAdminApi();
const groups = ref<AdminGroup[]>([]);
const submissions = ref<AdminSubmission[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const enabledGroups = computed(() => groups.value.filter((group) => group.enabled).length);

onMounted(async () => {
  try {
    const [groupResponse, submissionResponse] = await Promise.all([
      api<{ items: AdminGroup[] }>("/v1/qq/groups"),
      api<{ items: AdminSubmission[] }>("/v1/submissions?status=ready_for_review"),
    ]);
    groups.value = groupResponse.items;
    submissions.value = submissionResponse.items;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取管理概览，请确认当前账号有管理员权限。";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="admin-dashboard page-shell">
    <h1 class="sr-only">管理后台概览</h1>
    <p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p>

    <section class="dashboard-work" aria-labelledby="work-title">
      <div class="section-heading"><p class="eyebrow">当前工作</p><h2 id="work-title">待处理</h2></div>
      <div class="work-list">
        <NuxtLink class="work-item surface-card" to="/admin/reviews"><span><strong>截图核对</strong><small>{{ loading ? "读取中…" : submissions.length ? `${submissions.length} 条待核对` : "暂无待核对" }}</small></span><span aria-hidden="true">→</span></NuxtLink>
        <NuxtLink class="work-item surface-card" to="/admin/channels"><span><strong>QQ 渠道</strong><small>{{ loading ? "读取中…" : `${enabledGroups} / ${groups.length} 个已开放` }}</small></span><span aria-hidden="true">→</span></NuxtLink>
      </div>
    </section>

    <section class="dashboard-tools" aria-labelledby="tools-title">
      <div class="section-heading"><p class="eyebrow">功能</p><h2 id="tools-title">管理项目</h2></div>
      <div class="tool-list">
        <NuxtLink class="tool-link" to="/admin/players"><strong>玩家</strong><span>帐号、绑定与状态</span></NuxtLink>
        <NuxtLink class="tool-link" to="/admin/achievements"><strong>成就</strong><span>挑战目录与规则</span></NuxtLink>
        <NuxtLink class="tool-link" to="/admin/titles"><strong>称号迁移</strong><span>历史称号关联</span></NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.admin-dashboard { padding-block: clamp(46px, 7vh, 72px); max-width: 920px; }.section-heading { margin-bottom: 14px; }.section-heading .eyebrow { margin-bottom: 6px; }.section-heading h2 { margin: 0; font-size: clamp(1.4rem, 3vw, 2rem); letter-spacing: -.045em; }.dashboard-tools { margin-top: clamp(42px, 7vw, 72px); }.work-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.work-item { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 124px; padding: 22px; color: var(--text); text-decoration: none; transition: transform 160ms ease, border-color 160ms ease; }.work-item:hover, .work-item:focus-visible { transform: translateY(-2px); border-color: var(--line-strong); }.work-item strong, .work-item small { display: block; }.work-item small, .tool-link span { margin-top: 7px; color: var(--quiet); font-size: .8rem; }.work-item > span:last-child { color: var(--accent); font-size: 1.25rem; }.tool-list { display: grid; border-top: 1px solid var(--line); }.tool-link { display: grid; grid-template-columns: minmax(120px, .42fr) 1fr auto; align-items: baseline; gap: 18px; padding: 17px 4px; border-bottom: 1px solid var(--line); color: var(--text); text-decoration: none; transition: color 160ms ease, padding 160ms ease; }.tool-link::after { content: "→"; color: var(--accent); }.tool-link:hover, .tool-link:focus-visible { padding-inline: 8px; }.tool-link span { margin: 0; }.admin-alert { margin: 0 0 24px; padding: 12px 14px; border-radius: 11px; color: color-mix(in oklch, var(--danger) 82%, var(--text)); background: color-mix(in oklch, var(--danger) 16%, var(--surface)); font-size: .82rem; }
@media (max-width: 580px) { .work-list { grid-template-columns: 1fr; }.tool-link { grid-template-columns: 1fr auto; gap: 5px 14px; }.tool-link span { grid-column: 1; }.tool-link::after { grid-column: 2; grid-row: 1 / span 2; } }
</style>
