<script setup lang="ts">
defineProps<{
  submissions: Array<{ submissionId: string; mapName: string; status: string; updatedAt: number }>;
}>();

const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
</script>

<template>
  <div v-if="submissions.length" class="submission-list">
    <NuxtLink v-for="submission in submissions" :key="submission.submissionId" :to="`/submissions/${submission.submissionId}`" class="submission-row interactive-card pressable-soft">
      <div><strong>{{ submission.mapName }}</strong><span>{{ formatTime(submission.updatedAt) }}</span></div>
      <SubmissionStatusBadge :status="submission.status" />
    </NuxtLink>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.submission-list { display: grid; gap: 10px; }
.submission-row { display: flex; align-items: center; justify-content: space-between; gap: 22px; min-width: 0; padding: 18px 20px; border-radius: 18px; }
.submission-row > div { min-width: 0; }
.submission-row strong { display: block; overflow-wrap: anywhere; letter-spacing: var(--type-headline-tracking); font-weight: 650; }
.submission-row span { display: block; margin-top: 5px; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; }
@media (max-width: 620px) { .submission-row { align-items: flex-start; flex-direction: column; gap: 12px; padding: 16px; } }
</style>
