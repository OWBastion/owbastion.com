<script setup lang="ts">
import type { AdminGroup, AdminSubmission } from "~/composables/useAdminApi";
import { submissionStatusText } from "~/utils/submissionStatus";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "管理后台 · 躲避堡垒 3" });

const api = useAdminApi();
const groups = ref<AdminGroup[]>([]);
const submissions = ref<AdminSubmission[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const enabledGroups = computed(() => groups.value.filter((group) => group.enabled).length);
const disabledGroups = computed(() => groups.value.length - enabledGroups.value);
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const metrics = computed(() => {
  const value = (count: number) => loading.value ? "读取中…" : `${count}`;
  return [
    { label: "待核对", value: value(submissions.value.length), detail: "截图提交", tone: "accent" as const },
    { label: "已开放群组", value: value(enabledGroups.value), detail: "可接收提交", tone: "accent" as const },
    { label: "已关闭群组", value: value(disabledGroups.value), detail: "当前不接收", tone: "quiet" as const },
    { label: "群组总数", value: value(groups.value.length), detail: "已登记渠道", tone: "quiet" as const },
  ];
});
const reviewQueue = computed(() => submissions.value.map((submission) => ({
  submissionId: submission.submissionId,
  mapName: submission.mapName,
  difficulty: submission.difficulty,
  playerName: submission.playerName,
  status: submissionStatusText[submission.status] ?? submission.status,
  updatedAt: formatTime(submission.updatedAt),
})));

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
    <AdminDashboardMetrics :metrics="metrics" />
    <AdminReviewQueue class="dashboard-queue" :loading="loading" :reviews="reviewQueue" />
    <AdminManagementLinks class="dashboard-tools" />
  </main>
</template>

<style scoped>
.admin-dashboard { display:grid; gap:clamp(24px,4vw,38px); padding-block:clamp(46px,7vh,72px); max-width:1100px; }.dashboard-tools { margin-top:clamp(12px,2vw,24px); }.admin-alert { margin:0; padding:12px 14px; border-radius:11px; color:color-mix(in oklch,var(--danger) 82%,var(--text)); background:color-mix(in oklch,var(--danger) 16%,var(--surface)); font-size:.82rem; }
</style>
