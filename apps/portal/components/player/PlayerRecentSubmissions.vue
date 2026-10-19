<script setup lang="ts">
defineProps<{
  submissions: Array<{ submissionId: string; mapName: string; difficulty?: string; status: string; resubmissionRequired?: boolean; updatedAt: number }>;
}>();

const relative = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
const ago = (timestamp: number) => {
  const days = Math.round((timestamp - Date.now()) / 86_400_000);
  if (days === 0) return "今天";
  return Math.abs(days) < 30 ? relative.format(days, "day") : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(timestamp);
};
</script>

<template>
  <ol v-if="submissions.length" class="submission-list">
    <li v-for="submission in submissions" :key="submission.submissionId">
      <NuxtLink :to="`/me/submissions/${submission.submissionId}`" class="submission-row pressable-soft" :data-tone="playerSubmissionStatusTone(submission.status, submission.resubmissionRequired)">
        <span class="submission-row__dot" aria-hidden="true" />
        <strong>{{ submission.mapName }}<small v-if="submission.difficulty">{{ submission.difficulty }}</small></strong>
        <span class="submission-row__status">{{ playerSubmissionStatusLabel(submission.status, submission.resubmissionRequired) }}</span>
        <time class="submission-row__time" :datetime="new Date(submission.updatedAt).toISOString()">{{ ago(submission.updatedAt) }}</time>
      </NuxtLink>
    </li>
  </ol>
  <p v-else class="submission-empty">还没有提交</p>
</template>

<style scoped>
.submission-list { display: grid; margin: 0; padding: 0; list-style: none; }
.submission-list > li + li { border-top: 1px solid var(--line); }
.submission-row { --tone: var(--quiet); display: grid; grid-template-columns: auto minmax(0, 1fr) auto 4.5rem; align-items: center; gap: var(--space-3); min-height: 3.25rem; padding: 0 var(--space-2); border-radius: var(--radius-control); color: inherit; text-decoration: none; }
.submission-row:hover, .submission-row:focus-visible { background: var(--surface-raised); }
.submission-row[data-tone="success"] { --tone: var(--success); }
.submission-row[data-tone="info"] { --tone: var(--info); }
.submission-row[data-tone="warning"] { --tone: var(--warning); }
.submission-row[data-tone="error"] { --tone: var(--danger); }
.submission-row__dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--tone); }
.submission-row strong { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; overflow: hidden; font-weight: 600; white-space: nowrap; }
.submission-row strong small { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.submission-row__status { color: var(--tone); font-size: var(--type-caption-size); font-weight: 600; }
.submission-row__time { color: var(--quiet); font-size: var(--type-caption-size); text-align: right; }
.submission-empty { margin: 0; color: var(--quiet); font-size: var(--type-body-sm-size); }
</style>
