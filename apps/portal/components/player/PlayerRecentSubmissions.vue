<script setup lang="ts">
defineProps<{
  submissions: Array<{ submissionId: string; mapName: string; status: string; updatedAt: number }>;
}>();

const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
</script>

<template>
  <div v-if="submissions.length" class="submission-list">
    <NuxtLink v-for="submission in submissions" :key="submission.submissionId" :to="`/submissions/${submission.submissionId}`" class="submission-row">
      <div><strong>{{ submission.mapName }}</strong><span>{{ formatTime(submission.updatedAt) }}</span></div>
      <SubmissionStatusBadge :status="submission.status" />
    </NuxtLink>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.submission-list { display: grid; gap: 10px; }
.submission-row { display: flex; align-items: center; justify-content: space-between; gap: 22px; min-width: 0; padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; color: inherit; background: var(--surface); text-decoration: none; transition: transform 160ms ease, border-color 160ms ease; }
.submission-row > div { min-width: 0; }.submission-row:hover { transform: translateY(-1px); border-color: var(--line-strong); }.submission-row strong { display: block; overflow-wrap: anywhere; letter-spacing: -.02em; }.submission-row span { display: block; margin-top: 5px; color: var(--quiet); font-size: .78rem; }
@media (max-width: 620px) { .submission-row { align-items: flex-start; flex-direction: column; gap: 12px; padding: 16px; } }
</style>
