<script setup lang="ts">
import type { VerifiedRunSubmissionOutcome } from "~/composables/usePortalApi";
import { verifiedRunOutcomePresentation } from "~/utils/mastery";

defineProps<{
  submissions: Array<{ submissionId: string; mapName: string; difficulty?: string; status: string; resubmissionRequired?: boolean; updatedAt: number; verifiedRunOutcome?: VerifiedRunSubmissionOutcome }>;
}>();

</script>

<template>
  <ol v-if="submissions.length" class="submission-list">
    <li v-for="submission in submissions" :key="submission.submissionId">
      <NuxtLink :to="`/me/submissions/${submission.submissionId}`" class="submission-row pressable-soft" :data-tone="playerSubmissionStatusTone(submission.status, submission.resubmissionRequired)">
        <span class="submission-row__dot" aria-hidden="true" />
        <span class="submission-row__body">
          <strong>{{ submission.mapName }}<small v-if="submission.difficulty">{{ submission.difficulty }}</small></strong>
          <span>{{ formatTime(submission.updatedAt) }}<template v-if="verifiedRunOutcomePresentation(submission.verifiedRunOutcome)"> · {{ verifiedRunOutcomePresentation(submission.verifiedRunOutcome)?.inline }}</template></span>
        </span>
        <StatusBadge :label="playerSubmissionStatusLabel(submission.status, submission.resubmissionRequired)" :tone="playerSubmissionStatusTone(submission.status, submission.resubmissionRequired)" />
      </NuxtLink>
    </li>
  </ol>
  <UEmpty v-else title="暂无提交记录" description="提交完成截图，开始记录你的地图精通进度。" variant="naked">
    <template #actions>
      <UButton to="/me/submissions/new" icon="i-lucide-upload" label="提交截图" color="primary" />
    </template>
  </UEmpty>
</template>

<style scoped>
.submission-list { container-type: inline-size; display: grid; margin: 0; padding: 0; list-style: none; }
.submission-list > li + li { border-top: 1px solid var(--line); }
.submission-row { --tone: var(--quiet); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-2); border-radius: var(--radius-control); color: inherit; text-decoration: none; }
.submission-row:hover, .submission-row:focus-visible { background: var(--surface-raised); }
.submission-row[data-tone="success"] { --tone: var(--success); }
.submission-row[data-tone="info"] { --tone: var(--info); }
.submission-row[data-tone="warning"] { --tone: var(--warning); }
.submission-row[data-tone="error"] { --tone: var(--danger); }
.submission-row__dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--tone); box-shadow: 0 0 0 3px color-mix(in oklch, var(--tone) 22%, transparent); }
.submission-row__body { display: grid; gap: 2px; min-width: 0; }
.submission-row strong { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.submission-row strong small { color: var(--muted); font-size: var(--type-caption-size); font-weight: 500; }
.submission-row__body > span { color: var(--quiet); font-size: var(--type-caption-size); }
@container (max-width: 23.99rem) {
  .submission-row { grid-template-columns: auto minmax(0, 1fr); }
  .submission-row > :last-child { grid-column: 2; justify-self: start; }
}
</style>
