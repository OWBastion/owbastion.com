<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

type FeedbackField = { key: string; value: string | null };
type FeedbackState = {
  mode: "none" | "targeted" | "grouped";
  promptOrigin: "uncertainty" | "conflict" | "grouped" | "calibration" | null;
  promptFieldKeys: string[];
  fields: FeedbackField[];
  ocrResultId: string;
  submitted: boolean;
  available: boolean;
};

const props = defineProps<{
  submissionId: string;
  feedback: FeedbackState;
}>();
const emit = defineEmits<{ recorded: []; stale: [] }>();

const api = usePortalApi();
const busy = ref(false);
const errorMessage = ref("");
const message = ref("");
const corrections = reactive<Record<string, string>>({});
const confirming = reactive<Record<string, boolean>>({});
const passiveOpen = ref(false);
const passiveField = ref<string | undefined>(undefined);
const passiveValue = ref("");
const compact = ref(false);
let compactQuery: MediaQueryList | null = null;

const updateCompact = (event: MediaQueryListEvent | MediaQueryList) => { compact.value = event.matches; };
onMounted(() => {
  compactQuery = window.matchMedia("(max-width: 480px)");
  updateCompact(compactQuery);
  compactQuery.addEventListener("change", updateCompact);
});
onBeforeUnmount(() => { compactQuery?.removeEventListener("change", updateCompact); });

const fieldLabel = (key: string) => ({ map_name: "地图", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记", achievement_titles: "成就" })[key] ?? key;
const fieldValue = (value: string | null) => value === null ? "未识别" : value === "true" ? "已识别完成" : value === "false" ? "未识别完成" : value;
const promptedField = (key: string) => props.feedback.promptFieldKeys.includes(key);

const submit = async (items: Array<{ fieldKey: string; action: "confirmed" | "corrected"; proposedValue?: string }>) => {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    const response = await api<{ contractVersion: "1"; submissionId: string; recorded: Array<{ fieldKey: string; action: string; status: string }>; alreadySubmitted: boolean }>(`/v1/me/submissions/${encodeURIComponent(props.submissionId)}/ocr-feedback`, {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", ocrResultId: props.feedback.ocrResultId, items },
    });
    message.value = response.alreadySubmitted ? "该反馈已记录，重复提交不会产生重复记录。" : "已记录反馈，感谢核对。";
    emit("recorded");
  } catch (cause) {
    const details = portalErrorDetails(cause, "无法记录反馈，请稍后重试。");
    errorMessage.value = details.description;
    if (details.code === "OCR_PROMPT_STALE") emit("stale");
  } finally {
    busy.value = false;
  }
};

const confirmField = (key: string) => {
  confirming[key] = true;
  void submit([{ fieldKey: key, action: "confirmed" }]).finally(() => { confirming[key] = false; });
};

const confirmAll = () => {
  void submit(props.feedback.promptFieldKeys.map((key) => ({ fieldKey: key, action: "confirmed" })));
};

const correctField = (key: string) => {
  const value = corrections[key]?.trim();
  if (!value) return;
  void submit([{ fieldKey: key, action: "corrected", proposedValue: value }]).finally(() => { corrections[key] = ""; });
};

const openPassive = () => {
  passiveOpen.value = true;
  passiveField.value = props.feedback.fields[0]?.key ?? undefined;
  passiveValue.value = "";
};

const submitPassive = () => {
  const fieldKey = passiveField.value;
  const value = passiveValue.value.trim();
  if (!fieldKey || !value) return;
  void submit([{ fieldKey, action: "corrected", proposedValue: value }]).finally(() => {
    passiveOpen.value = false;
    passiveField.value = undefined;
    passiveValue.value = "";
  });
};

const cancelPassive = () => {
  passiveOpen.value = false;
  passiveField.value = undefined;
  passiveValue.value = "";
};
</script>

<template>
  <div class="ocr-feedback" :class="{ 'ocr-feedback--compact': compact }">
    <div v-if="message" class="feedback-live" role="status" aria-live="polite">
      <UAlert color="success" variant="subtle" :description="message" />
    </div>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" class="feedback-error" />

    <UCard v-if="feedback.submitted" class="feedback-card elevation-2" aria-label="识别反馈已记录">
      <div class="feedback-recorded">
        <span class="feedback-recorded-icon"><UIcon name="i-lucide-check-circle-2" aria-hidden="true" /></span>
        <div>
          <strong>已记录反馈</strong>
          <p>你的核对已提交，不会影响挑战核对结果。</p>
        </div>
      </div>
    </UCard>

    <template v-else-if="feedback.mode !== 'none'">
      <UCard class="feedback-card elevation-2" :aria-busy="busy || undefined" :inert="busy || undefined">
        <template #header>
          <div class="card-heading">
            <h2>核对识别结果</h2>
            <span>仅需核对以下内容</span>
          </div>
        </template>
        <p class="feedback-hint">请对照截图确认识别是否正确。修正后不会影响挑战核对结果。</p>
        <div class="feedback-fields">
          <div v-for="key in feedback.promptFieldKeys" :key="key" class="feedback-row">
            <div class="feedback-fact">
              <span class="feedback-label">{{ fieldLabel(key) }}</span>
              <span class="feedback-value">{{ fieldValue(feedback.fields.find((item) => item.key === key)?.value ?? null) }}</span>
            </div>
            <div class="feedback-actions">
              <UButton
                label="确认无误"
                icon="i-lucide-check"
                color="primary"
                variant="outline"
                size="sm"
                :loading="confirming[key]"
                :disabled="busy"
                @click="confirmField(key)"
              />
              <div class="feedback-correct">
                <UInput v-model="corrections[key]" size="sm" :placeholder="`修正${fieldLabel(key)}`" aria-label="修正值" :disabled="busy" />
                <UButton label="提交修正" color="neutral" variant="outline" size="sm" :disabled="busy || !corrections[key]?.trim()" @click="correctField(key)" />
              </div>
            </div>
          </div>
        </div>
        <UButton v-if="feedback.mode === 'grouped'" label="全部确认无误" icon="i-lucide-check-check" color="primary" :loading="busy" :disabled="busy" @click="confirmAll" block />
      </UCard>
    </template>

    <div v-if="feedback.available" class="feedback-passive">
      <UButton
        v-if="!passiveOpen"
        label="识别有误"
        icon="i-lucide-flag"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="busy || feedback.submitted"
        @click="openPassive"
      />
      <UCard v-else class="feedback-passive-card elevation-1" aria-label="报告识别错误">
        <div class="card-heading"><h3>报告识别错误</h3></div>
        <div class="feedback-passive-form">
          <USelect v-model="passiveField" :items="feedback.fields.map((item) => ({ label: fieldLabel(item.key), value: item.key }))" aria-label="选择字段" :disabled="busy" />
          <UInput v-model="passiveValue" size="md" placeholder="填写截图中实际显示的内容" aria-label="正确内容" :disabled="busy" />
        </div>
        <div class="feedback-passive-actions">
          <UButton label="提交" color="primary" :loading="busy" :disabled="busy || !passiveValue.trim()" @click="submitPassive" />
          <UButton label="取消" color="neutral" variant="ghost" :disabled="busy" @click="cancelPassive" />
        </div>
      </UCard>
    </div>
  </div>
</template>

<style scoped>
.ocr-feedback { display: grid; gap: 12px; }
.feedback-live { display: grid; }
.feedback-error { margin: 0; }
.feedback-card { border-color: var(--line); }
.feedback-hint { margin: 0 0 14px; color: var(--muted); font-size: .8rem; line-height: 1.6; }
.feedback-fields { display: grid; gap: 10px; }
.feedback-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
/* Mobile widths stack the correction input below its action and the row
   collapses to one column; the class is driven by matchMedia so the compact
   interaction is testable. */
.ocr-feedback--compact .feedback-row { grid-template-columns: minmax(0, 1fr); }
.ocr-feedback--compact .feedback-correct { grid-template-columns: minmax(0, 1fr); }
.feedback-fact { display: grid; gap: 4px; min-width: 0; }
.feedback-label { color: var(--quiet); font-size: .74rem; }
.feedback-value { color: var(--text); font-size: .9rem; overflow-wrap: anywhere; }
.feedback-actions { display: grid; gap: 8px; }
.feedback-correct { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.feedback-recorded { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; align-items: start; }
.feedback-recorded-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid color-mix(in oklch, var(--success, #16a34a) 30%, var(--line));
  border-radius: 10px;
  color: var(--success, #16a34a);
  background: color-mix(in oklch, var(--success, #16a34a) 8%, var(--surface));
}
.feedback-recorded strong { display: block; font-size: .86rem; }
.feedback-recorded p { margin: 4px 0 0; color: var(--muted); font-size: .78rem; line-height: 1.5; }
.feedback-passive { display: flex; justify-content: flex-end; }
.feedback-passive-card { width: 100%; border-color: var(--line); }
.feedback-passive-card .card-heading h3 { font-size: .86rem; margin: 0 0 12px; }
.feedback-passive-form { display: grid; gap: 8px; }
.feedback-passive-actions { display: flex; gap: 8px; margin-top: 12px; }
@media (min-width: 640px) {
  .feedback-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); align-items: center; }
}
</style>
