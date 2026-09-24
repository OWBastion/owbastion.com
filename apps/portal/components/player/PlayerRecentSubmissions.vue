<script setup lang="ts">
import type { MasterySubmissionOutcome } from "~/composables/usePortalApi";
import { masteryOutcomePresentation } from "~/utils/mastery";

defineProps<{
  submissions: Array<{ submissionId: string; mapName: string; status: string; updatedAt: number; masteryOutcome?: MasterySubmissionOutcome }>;
}>();

const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
</script>

<template>
  <div v-if="submissions.length" class="submission-list">
    <NuxtLink v-for="submission in submissions" :key="submission.submissionId" :to="`/submissions/${submission.submissionId}`" class="submission-row interactive-card pressable-soft">
      <div><strong>{{ submission.mapName }}</strong><span>{{ formatTime(submission.updatedAt) }}<template v-if="masteryOutcomePresentation(submission.masteryOutcome)"> · {{ masteryOutcomePresentation(submission.masteryOutcome)?.inline }}</template></span></div>
      <SubmissionStatusBadge :status="submission.status" />
    </NuxtLink>
  </div>
  <UEmpty v-else title="暂无提交记录" description="提交完成截图，开始记录你的地图精通进度。" variant="naked">
    <template #actions>
      <UButton to="/submissions/new" icon="i-lucide-upload" label="提交截图" color="primary" />
    </template>
  </UEmpty>
</template>

<style scoped>
.submission-list { container-type: inline-size; display: grid; gap: var(--space-2); }
.submission-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); min-width: 0; padding: var(--space-4) var(--space-5); border-radius: var(--radius-card); }
.submission-row > div { min-width: 0; }
.submission-row strong { display: block; overflow-wrap: anywhere; letter-spacing: var(--type-headline-tracking); font-weight: 600; }
.submission-row span { display: block; margin-top: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
@container (max-width: 23.99rem) {
  .submission-row { align-items: flex-start; flex-direction: column; gap: var(--space-3); padding: var(--space-4); }
}
</style>
