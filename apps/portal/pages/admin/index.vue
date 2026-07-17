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
const totalPlayers = ref(0);
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const metrics = computed(() => {
  const value = (count: number) => loading.value ? "读取中…" : `${count}`;
  return [
    { label: "待核对", value: value(submissions.value.length), detail: "截图提交", tone: "accent" as const },
    { label: "已开放群组", value: value(enabledGroups.value), detail: "可接收提交", tone: "accent" as const },
	    { label: "玩家总数", value: value(totalPlayers.value), detail: "已登记账号", tone: "quiet" as const },
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
	    const [groupResponse, submissionResponse, playerResponse] = await Promise.all([
	      api<{ items: AdminGroup[] }>("/v1/qq/groups"),
	      api<{ items: AdminSubmission[] }>("/v1/submissions?status=ready_for_review"),
	      api<{ total: number }>("/v1/player-accounts?page=1&pageSize=1"),
	    ]);
	    groups.value = groupResponse.items;
	    submissions.value = submissionResponse.items;
	    totalPlayers.value = playerResponse.total;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取管理概览，请确认当前账号有管理员权限。";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AdminWorkspace title="管理概览">
    <template #messages><p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p></template>
    <AdminDashboardMetrics :metrics="metrics" />
    <AdminReviewQueue class="dashboard-queue" :loading="loading" :reviews="reviewQueue" />
    <AdminManagementLinks class="dashboard-tools" />
  </AdminWorkspace>
</template>

<style scoped>
.dashboard-tools { margin-top:clamp(12px,2vw,24px); }
</style>
