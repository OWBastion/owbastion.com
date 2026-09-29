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
    message.value = "已记录标记，感谢核对。标记不会影响挑战核对结果。";
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
  <div class="ocr-feedback">
    <div v-if="message" class="feedback-live" role="status" aria-live="polite">
      <UAlert color="success" variant="subtle" :description="message" />
    </div>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" class="feedback-error" />

    <UCard class="feedback-card elevation-2" :aria-busy="busy || undefined" :inert="busy || undefined">
      <template #header>
        <div class="card-heading">
          <h2>识别是否准确</h2>
          <span v-if="feedback.accuracy">当前标记：{{ feedback.accuracy === "accurate" ? "识别准确" : "识别有误" }}</span>
        </div>
      </template>
      <p class="feedback-hint">请对照截图判断识别结果整体是否正确。标记仅用于改进识别质量，不会改变本次提交的处理结果。</p>
      <div class="feedback-actions">
        <UButton
          label="识别准确"
          icon="i-lucide-check"
          :color="feedback.accuracy === 'accurate' ? 'primary' : 'neutral'"
          :variant="feedback.accuracy === 'accurate' ? 'solid' : 'outline'"
          size="sm"
          :loading="busy"
          :disabled="busy"
          @click="mark('accurate')"
        />
        <UButton
          label="识别有误"
          icon="i-lucide-flag"
          :color="feedback.accuracy === 'inaccurate' ? 'primary' : 'neutral'"
          :variant="feedback.accuracy === 'inaccurate' ? 'solid' : 'outline'"
          size="sm"
          :loading="busy"
          :disabled="busy"
          @click="mark('inaccurate')"
        />
      </div>
    </UCard>
  </div>
</template>

<style scoped>
.ocr-feedback { display: grid; gap: var(--space-3); }
.feedback-live { display: grid; }
.feedback-error { margin: 0; }
.feedback-card { border-color: var(--line); }
.feedback-hint { margin: 0 0 var(--space-3); color: var(--muted); font-size: .8rem; line-height: 1.6; }
.feedback-actions { display: flex; gap: var(--space-2); }
</style>
