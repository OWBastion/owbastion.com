<script setup lang="ts">
import type { AdminAnnotationProposal, AdminSubmission } from "~/composables/useAdminApi";
import { annotationFieldItems, annotationOcrFieldValue, looksLikeSubmissionId } from "~/utils/annotation-labels";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import { submissionStatusText } from "~/utils/submissionStatus";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ initialSubmissionId?: string }>();
const emit = defineEmits<{ created: [] }>();

const api = useAdminApi();
const candidates = shallowRef<AdminSubmission[]>([]);
const selectedId = shallowRef<string | undefined>(undefined);
const selected = shallowRef<AdminSubmission | null>(null);
const searchTerm = shallowRef("");
const fieldKey = shallowRef<AdminAnnotationProposal["fieldKey"]>("map_name");
const reviewedValue = shallowRef("");
const note = shallowRef("");
const loadingList = shallowRef(false);
const loadingLookup = shallowRef(false);
const saving = shallowRef(false);
const errorMessage = shallowRef("");

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const statusLabel = (status: string) => submissionStatusText[status] ?? status;

type SubmissionItem = { label: string; value: string; submission: AdminSubmission };
const toItem = (submission: AdminSubmission): SubmissionItem => ({
  label: [submission.mapName, submission.playerName].filter(Boolean).join(" · ") || submission.submissionId,
  value: submission.submissionId,
  submission,
});

const upsertCandidate = (submission: AdminSubmission) => {
  if (candidates.value.some((item) => item.submissionId === submission.submissionId)) {
    candidates.value = candidates.value.map((item) => item.submissionId === submission.submissionId ? submission : item);
    return;
  }
  candidates.value = [submission, ...candidates.value];
};

const items = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  const source = candidates.value.map(toItem);
  if (!query) return source;
  return source.filter((item) => {
    const haystack = [item.label, item.submission.playerName, item.submission.submissionId, statusLabel(item.submission.status)].join(" ").toLowerCase();
    return haystack.includes(query);
  });
});

const ocrPreview = computed(() => annotationFieldItems.map((item) => ({
  ...item,
  value: annotationOcrFieldValue(selected.value?.ocr, item.value) || "未识别",
})));

function applyFieldValue(submission: AdminSubmission | null, key: AdminAnnotationProposal["fieldKey"]) {
  reviewedValue.value = annotationOcrFieldValue(submission?.ocr, key);
}

async function loadCandidates() {
  loadingList.value = true;
  errorMessage.value = "";
  try {
    const response = await api<{ items: AdminSubmission[] }>("/v1/submissions?page=1&pageSize=50");
    candidates.value = response.items;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取最近提交。").description;
  } finally {
    loadingList.value = false;
  }
}

async function lookupSubmission(submissionId: string) {
  const id = submissionId.trim();
  if (!id || loadingLookup.value) return;
  loadingLookup.value = true;
  errorMessage.value = "";
  try {
    const submission = await api<AdminSubmission>(`/v1/submissions/${encodeURIComponent(id)}`);
    upsertCandidate(submission);
    selectedId.value = submission.submissionId;
    selected.value = submission;
    applyFieldValue(submission, fieldKey.value);
  } catch (error) {
    selected.value = null;
    errorMessage.value = portalErrorDetails(error, "无法读取提交记录。").description;
  } finally {
    loadingLookup.value = false;
  }
}

async function selectById(submissionId: string | undefined) {
  selectedId.value = submissionId;
  if (!submissionId) {
    selected.value = null;
    reviewedValue.value = "";
    return;
  }
  const existing = candidates.value.find((item) => item.submissionId === submissionId);
  if (existing) {
    selected.value = existing;
    applyFieldValue(existing, fieldKey.value);
    return;
  }
  await lookupSubmission(submissionId);
}

watch(fieldKey, (key) => { applyFieldValue(selected.value, key); });

watch(searchTerm, (value, _previous, onCleanup) => {
  const query = value.trim();
  if (!looksLikeSubmissionId(query) || selectedId.value === query) return;
  if (candidates.value.some((item) => item.submissionId === query)) return;
  const timer = setTimeout(() => { void lookupSubmission(query); }, 250);
  onCleanup(() => clearTimeout(timer));
});

watch(open, async (value) => {
  if (!value) return;
  errorMessage.value = "";
  note.value = "";
  fieldKey.value = "map_name";
  reviewedValue.value = "";
  selected.value = null;
  selectedId.value = undefined;
  searchTerm.value = "";
  await loadCandidates();
  const initialId = props.initialSubmissionId?.trim();
  if (initialId) await selectById(initialId);
}, { immediate: true });

async function createAnnotation() {
  const submission = selected.value;
  if (!submission?.ocrResultId || !reviewedValue.value.trim() || saving.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api("/v1/annotations/direct", {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: {
        contractVersion: "1",
        submissionId: submission.submissionId,
        ocrResultId: submission.ocrResultId,
        fieldKey: fieldKey.value,
        reviewedValue: reviewedValue.value.trim(),
        ...(note.value.trim() ? { note: note.value.trim() } : {}),
      },
    });
    open.value = false;
    emit("created");
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "标注创建未完成，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="open" title="直接创建审定标注" description="用于核对截图时发现识别错误、且无玩家反馈的情况。" size="md">
    <template #body>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" class="annotation-direct-error" />
      <div class="annotation-direct">
        <UFormField label="提交">
          <USelectMenu
            :model-value="selectedId"
            :search-term="searchTerm"
            :items="items"
            value-key="value"
            label-key="label"
            placeholder="搜索地图、玩家或粘贴提交 ID"
            :loading="loadingList || loadingLookup"
            ignore-filter
            aria-label="选择提交"
            :search-input="{ placeholder: '搜索地图、玩家或粘贴提交 ID' }"
            @update:model-value="selectById(String($event ?? ''))"
            @update:search-term="searchTerm = String($event ?? '')"
          >
            <template #item="{ item }">
              <div class="annotation-direct-option">
                <strong>{{ item.label }}</strong>
                <span class="table-meta">{{ statusLabel(item.submission.status) }} · {{ formatTime(item.submission.updatedAt) }}</span>
              </div>
            </template>
          </USelectMenu>
        </UFormField>

        <p v-if="selected" class="annotation-direct-fact">
          <NuxtLink class="annotation-direct-link" :to="`/admin/reviews/${encodeURIComponent(selected.submissionId)}`">查看审核详情</NuxtLink>
          <span v-if="!selected.ocrResultId" class="table-meta">无可用识别结果</span>
        </p>

        <dl v-if="selected?.ocrResultId" class="annotation-direct-ocr">
          <div v-for="field in ocrPreview" :key="field.value">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>

        <div v-if="selected?.ocrResultId" class="annotation-direct-form">
          <UFormField label="字段">
            <USelect v-model="fieldKey" aria-label="选择字段" :items="annotationFieldItems" />
          </UFormField>
          <UFormField label="审定值">
            <UInput v-model="reviewedValue" size="md" placeholder="审定后的准确值" aria-label="审定值" />
          </UFormField>
          <UFormField label="备注">
            <UInput v-model="note" size="md" placeholder="备注" aria-label="备注" />
          </UFormField>
        </div>
      </div>
    </template>
    <template v-if="selected?.ocrResultId" #footer>
      <UButton label="创建标注" color="primary" :loading="saving" :disabled="saving || !reviewedValue.trim()" @click="createAnnotation" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.annotation-direct { display: grid; gap: 12px; }
.annotation-direct-error { margin-bottom: 4px; }
.annotation-direct-option { display: grid; gap: 2px; min-width: 0; }
.annotation-direct-fact { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--text); font-size: .86rem; }
.annotation-direct-link { color: var(--accent); font-weight: 650; text-decoration: none; }
.annotation-direct-link:hover, .annotation-direct-link:focus-visible { text-decoration: underline; }
.annotation-direct-ocr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.annotation-direct-ocr > div { display: grid; gap: 2px; min-width: 0; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; }
.annotation-direct-ocr dt { color: var(--quiet); font-size: .72rem; }
.annotation-direct-ocr dd { margin: 0; overflow-wrap: anywhere; font-size: .82rem; }
.annotation-direct-form { display: grid; gap: 8px; }
.table-meta { display: block; color: var(--quiet); font-size: .78rem; overflow-wrap: anywhere; }
@media (max-width: 560px) {
  .annotation-direct-ocr { grid-template-columns: minmax(0, 1fr); }
}
</style>
