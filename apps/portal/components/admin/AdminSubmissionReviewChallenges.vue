<script setup lang="ts">
import type { AdminSubmission, AdminSubmissionReviewCandidate, AdminSubmissionReviewPreview } from "~/composables/useAdminApi";
import { reviewCandidateScopeLabel, reviewCandidateSearchText, reviewCandidateStatus, reviewFieldList } from "~/utils/submissionReview";

const props = defineProps<{ submission: AdminSubmission; preview?: AdminSubmissionReviewPreview | null; previewLoading?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ "confirmed-challenges": [value: string[]] }>();

const confirmedChallengeIds = ref<string[]>([]);
const withdrawnConfirmations = ref(0);
watch(confirmedChallengeIds, (value) => emit("confirmed-challenges", value), { immediate: true });
const setChallengeConfirmation = (challengeId: string, confirmed: boolean) => {
  withdrawnConfirmations.value = 0;
  confirmedChallengeIds.value = confirmed ? [...new Set([...confirmedChallengeIds.value, challengeId])] : confirmedChallengeIds.value.filter((id) => id !== challengeId);
};
const candidates = computed(() => props.preview?.candidates ?? []);
// Corrected evidence can change which Challenges are eligible (for example another map);
// confirmations that no longer apply are withdrawn so they cannot block approval invisibly.
watch(() => props.preview, (preview) => {
  if (!preview) return;
  const eligible = new Set(preview.candidates.map((candidate) => candidate.challengeId));
  const kept = confirmedChallengeIds.value.filter((id) => eligible.has(id));
  if (kept.length === confirmedChallengeIds.value.length) return;
  withdrawnConfirmations.value = confirmedChallengeIds.value.length - kept.length;
  confirmedChallengeIds.value = kept;
});
const isProposed = (candidate: AdminSubmissionReviewCandidate) => candidate.evidence === "matched" || candidate.evidence === "needs_confirmation";
// Proposed candidates stay listed after confirmation; manually added ones join them while confirmed.
const listedCandidates = computed(() => candidates.value.filter((candidate) => isProposed(candidate) || confirmedChallengeIds.value.includes(candidate.challengeId)));
const challengeQuery = ref("");
const searchResults = computed(() => {
  const query = challengeQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  const listed = new Set(listedCandidates.value.map((candidate) => candidate.challengeId));
  return candidates.value.filter((candidate) => !listed.has(candidate.challengeId) && reviewCandidateSearchText(candidate).includes(query)).slice(0, 8);
});
const addChallenge = (challengeId: string) => {
  setChallengeConfirmation(challengeId, true);
  challengeQuery.value = "";
};
const candidateDetail = (candidate: AdminSubmissionReviewCandidate) => [candidate.mapName && candidate.kind !== "title_achievement" ? candidate.mapName : null, candidate.difficulty].filter(Boolean).join(" · ");
// One quiet line under the name: where it applies, its condition, and which fields it rests on.
const candidateNote = (candidate: AdminSubmissionReviewCandidate) => [candidateDetail(candidate), candidate.condition, candidate.requiredFields.length ? `依据：${reviewFieldList(candidate.requiredFields)}` : null].filter(Boolean).join(" · ");
const searchOpen = ref(false);
// With nothing proposed, searching is the only way forward, so it is open from the start.
const searchVisible = computed(() => searchOpen.value || !listedCandidates.value.length);

const matchOutcomeLabel = (outcome?: string) => outcome === "automatic" ? "证据满足条件" : outcome === "review" ? "证据需人工确认" : outcome === "resubmit" ? "未匹配 Challenge" : "等待判定";
</script>

<template>
  <div class="challenges">
    <AdminSignalPanel title="Challenge 判定" title-id="auto-match-title">
      <template #aside>
        <StatusBadge v-if="preview" :label="matchOutcomeLabel(preview.evidenceOutcome)" :tone="preview.evidenceOutcome === 'automatic' ? 'success' : 'warning'" />
      </template>
      <p v-if="submission.reason" class="signal-reason">{{ submission.reason }}</p>
      <ul v-if="listedCandidates.length" class="match-list" aria-label="候选 Challenge">
        <li v-for="candidate in listedCandidates" :key="candidate.challengeId" class="match-candidate" :class="{ 'match-candidate--selected': candidate.selectedBy !== null }">
          <div class="match-candidate__main">
            <p class="match-candidate__title">
              <strong>{{ candidate.label }}</strong>
              <span class="candidate-scope">{{ reviewCandidateScopeLabel(candidate) }}</span>
            </p>
            <p v-if="candidateNote(candidate)" class="candidate-reasons">{{ candidateNote(candidate) }}</p>
          </div>
          <div class="match-candidate__side">
            <StatusBadge :label="reviewCandidateStatus(candidate).label" :tone="reviewCandidateStatus(candidate).tone" />
            <UCheckbox
              v-if="candidate.evidence !== 'matched'"
              :model-value="confirmedChallengeIds.includes(candidate.challengeId)"
              label="截图可证明"
              :disabled="disabled"
              @update:model-value="setChallengeConfirmation(candidate.challengeId, Boolean($event))"
            />
          </div>
        </li>
      </ul>
      <p v-if="withdrawnConfirmations" class="signal-note" role="status">{{ withdrawnConfirmations }} 项人工确认已不适用于当前识别结果，已取消。</p>
      <p v-if="!listedCandidates.length && previewLoading && !preview" class="signal-empty">正在计算 Challenge…</p>
      <p v-else-if="!listedCandidates.length && preview" class="signal-empty">当前证据没有匹配到 Challenge，可以搜索添加。已拥有或已被管理员撤销的称号不会出现在列表中。</p>
      <p v-else-if="!listedCandidates.length" class="signal-empty">暂无可判定的识别结果。</p>
      <div v-if="candidates.length" class="manual-add">
        <UButton v-if="!searchVisible" type="button" icon="i-lucide-plus" label="添加其他 Challenge" size="sm" color="neutral" variant="ghost" @click="searchOpen = true" />
        <template v-else>
          <UInput v-model="challengeQuery" icon="i-lucide-search" aria-label="搜索 Challenge" placeholder="输入称号、地图或条件" :disabled="disabled" />
          <ul v-if="searchResults.length" class="manual-add__results">
            <li v-for="candidate in searchResults" :key="candidate.challengeId" class="manual-add__result">
              <div>
                <strong>{{ candidate.label }}</strong>
                <span class="candidate-scope">{{ reviewCandidateScopeLabel(candidate) }}<template v-if="candidateDetail(candidate)"> · {{ candidateDetail(candidate) }}</template></span>
              </div>
              <UButton type="button" label="添加" size="sm" color="neutral" variant="outline" :disabled="disabled" :aria-label="`添加 ${candidate.label}`" @click="addChallenge(candidate.challengeId)" />
            </li>
          </ul>
          <p v-else-if="challengeQuery.trim()" class="signal-empty">没有匹配的 Challenge。</p>
        </template>
      </div>
    </AdminSignalPanel>
  </div>
</template>

<style scoped>
.challenges {
  container-type: inline-size;
  min-width: 0;
}
.signal-reason {
  margin: 0 0 var(--space-3);
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  line-height: 1.5;
}
.match-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.match-candidate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}
.match-candidate:first-child {
  padding-top: 0;
  border-top: 0;
}
.match-candidate__main {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}
.match-candidate__title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  margin: 0;
}
.match-candidate__title strong {
  overflow-wrap: anywhere;
  font-size: var(--type-label-size);
}
.match-candidate--selected .match-candidate__title strong {
  color: var(--accent);
}
.match-candidate__side {
  display: grid;
  flex: none;
  justify-items: end;
  gap: var(--space-2);
}
.candidate-scope {
  color: var(--muted);
  font-size: var(--type-caption-size);
}
.candidate-reasons {
  margin: 0;
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.manual-add {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line);
}
.manual-add__results {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.manual-add__result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface);
}
.manual-add__result > div {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}
.manual-add__result strong {
  overflow-wrap: anywhere;
  font-size: var(--type-label-sm-size);
}
@container (max-width: 26rem) {
  .match-candidate {
    flex-direction: column;
    align-items: stretch;
  }
  .match-candidate__side {
    grid-auto-flow: column;
    justify-content: space-between;
    justify-items: start;
    align-items: center;
  }
}
</style>
