<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

type AccuracyMark = "accurate" | "inaccurate";
type FeedbackState = { ocrResultId: string; accuracy: AccuracyMark | null };

const props = defineProps<{
  submissionId: string;
  feedback: FeedbackState;
}>();
const emit = defineEmits<{ recorded: []; stale: [] }>();

const api = usePortalApi();
const busy = ref(false);
const errorMessage = ref("");
const message = ref("");

const mark = async (accuracy: AccuracyMark) => {
  if (busy.value || props.feedback.accuracy === accuracy) return;
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    await api<{ contractVersion: "1"; submissionId: string; ocrResultId: string; accuracy: AccuracyMark; alreadySubmitted: boolean }>(`/v1/me/submissions/${encodeURIComponent(props.submissionId)}/ocr-feedback`, {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", ocrResultId: props.feedback.ocrResultId, accuracy },
    });
    message.value = "已记录";
    emit("recorded");
  } catch (cause) {
    const details = portalErrorDetails(cause, "无法记录标记，请稍后重试。");
    errorMessage.value = details.description;
    if (details.code === "OCR_PROMPT_STALE") emit("stale");
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="ocr-feedback" :aria-busy="busy || undefined">
    <span class="ocr-feedback__ask">识别准确吗</span>
    <UButton
      icon="i-lucide-thumbs-up"
      aria-label="识别准确"
      :aria-pressed="feedback.accuracy === 'accurate'"
      :color="feedback.accuracy === 'accurate' ? 'primary' : 'neutral'"
      :variant="feedback.accuracy === 'accurate' ? 'soft' : 'ghost'"
      size="sm"
      :disabled="busy"
      @click="mark('accurate')"
    />
    <UButton
      icon="i-lucide-thumbs-down"
      aria-label="识别有误"
      :aria-pressed="feedback.accuracy === 'inaccurate'"
      :color="feedback.accuracy === 'inaccurate' ? 'primary' : 'neutral'"
      :variant="feedback.accuracy === 'inaccurate' ? 'soft' : 'ghost'"
      size="sm"
      :disabled="busy"
      @click="mark('inaccurate')"
    />
    <span class="ocr-feedback__note" :class="{ 'is-error': errorMessage }" role="status" aria-live="polite">{{ errorMessage || message }}</span>
  </div>
</template>

<style scoped>
.ocr-feedback { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
.ocr-feedback__ask { margin-right: var(--space-2); color: var(--muted); font-size: var(--type-label-sm-size); }
.ocr-feedback__note { margin-left: var(--space-2); color: var(--muted); font-size: var(--type-caption-size); }
.ocr-feedback__note.is-error { color: var(--danger); }
</style>
