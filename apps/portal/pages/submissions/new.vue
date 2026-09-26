<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import type { FormSubmitEvent } from "@nuxt/ui";
import SubmissionProcess from "~/components/submissions/SubmissionProcess.vue";
import SubmissionRequirements from "~/components/submissions/SubmissionRequirements.vue";
import SubmissionSectionHeading from "~/components/submissions/SubmissionSectionHeading.vue";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交挑战 · 躲避堡垒 3" });

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

const toast = useToast();
const { loading, phaseLabel, error, submit } = useSubmissionUpload();

const state = reactive<{ screenshot: File | null }>({ screenshot: null });

// Validated as soon as a file is chosen, so a bad file is caught before the player presses upload.
const fileError = computed(() => {
  const file = state.screenshot;
  if (!file) return undefined;
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "仅支持 JPEG、PNG 或 WebP 格式。";
  if (file.size > MAX_BYTES) return "截图不能超过 10MB，请使用游戏内截图，或降低截图分辨率后重试。";
  return undefined;
});

// Players usually capture with a screenshot tool that copies to the clipboard, so paste works anywhere on the page.
const onPaste = (event: ClipboardEvent) => {
  if (loading.value) return;
  const image = Array.from(event.clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
  if (image) state.screenshot = image;
};
onMounted(() => document.addEventListener("paste", onPaste));
onBeforeUnmount(() => document.removeEventListener("paste", onPaste));

const send = async (_event: FormSubmitEvent<typeof state>) => {
  if (loading.value || !state.screenshot || fileError.value) return;
  try {
    const result = await submit(state.screenshot);
    const title = result.status === "awaiting_player_confirmation"
      ? "识别完成，请确认挑战。"
      : result.status === "ready_for_review"
        ? "识别通过，等待核对。"
        : result.status === "resubmission_required"
          ? "截图未通过识别，请重新提交。"
          : "截图已上传，等待识别。";
    toast.add({ title, color: result.status === "resubmission_required" ? "warning" : "success" });
    await navigateTo(`/submissions/${encodeURIComponent(result.submissionId)}`);
  } catch (cause) {
    toast.add({ title: "截图提交失败", description: portalErrorDetails(cause, error.value || "请检查截图后重试。").description, color: "error" });
  }
};
</script>

<template>
  <main class="submit-page page-shell">
    <section class="submit-intro" aria-labelledby="submit-title">
      <h1 id="submit-title" class="page-title">提交完成截图</h1>
    </section>

    <UCard class="submission-card elevation-2" variant="subtle">
      <div class="submission-columns">
        <section class="upload-section" aria-labelledby="upload-title">
          <SubmissionSectionHeading title="上传截图" heading-id="upload-title" />
          <UForm :state="state" :disabled="loading" aria-labelledby="upload-title" @submit="send">
            <UFormField name="screenshot" :error="fileError">
              <UFileUpload
                v-model="state.screenshot"
                class="upload-control"
                label="点击选择、拖拽或直接粘贴截图"
                :accept="ACCEPT_ATTR"
                :multiple="false"
                layout="grid"
                position="outside"
                :preview="true"
                :ui="{ files: 'w-full', file: 'w-full', fileLeadingAvatar: 'size-full rounded-lg object-contain', fileTrailingButton: 'absolute top-2 end-2 rounded-full border-2 border-bg' }"
                description="支持 JPEG、PNG、WebP，不超过 10MB；截图后可直接按 Ctrl / ⌘ + V 粘贴"
                :disabled="loading"
              />
            </UFormField>
            <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
            <div class="action-row">
              <UButton
                size="lg"
                :label="loading ? `${phaseLabel}…` : '上传并识别截图'"
                icon="i-lucide-upload"
                :loading="loading"
                :disabled="loading || !state.screenshot || !!fileError"
                type="submit"
              />
            </div>
          </UForm>
          <div class="privacy-note">
            <div class="privacy-header">
              <UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />
              <span>截图用途</span>
            </div>
            <ul class="privacy-details">
              <li>截图仅用于挑战核对与截图识别</li>
              <li>提交截图不会对外公开</li>
              <li>原始识别结果仅平台内部使用</li>
            </ul>
          </div>
        </section>
        <SubmissionRequirements />
      </div>
    </UCard>
    <SubmissionProcess />
  </main>
</template>

<style scoped>
.submit-page { padding-block: clamp(3.5rem, 8vw, 5.5rem) 4.5rem; }
.submit-intro { max-width: 650px; margin-bottom: var(--space-6); }
.submission-card { border-color: var(--line); padding: clamp(var(--space-5), 3vw, var(--space-8)); }
.submission-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(var(--space-6), 5vw, var(--space-16));
}
.upload-section { min-width: 0; }
.upload-section :deep(form) { display: grid; gap: var(--space-3); }
.upload-control { width: 100%; }
.privacy-note {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface-raised);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.privacy-header { display: flex; align-items: center; gap: var(--space-1); color: var(--text); font-weight: 600; }
.privacy-header > svg { flex: 0 0 auto; width: 14px; height: 14px; color: var(--muted); }
.privacy-details { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); color: var(--muted); }
.privacy-details li::marker { color: var(--quiet); }
@media (max-width: 63.99rem) {
  .submit-page { padding-bottom: 3.5rem; }
  .submission-columns { grid-template-columns: minmax(0, 1fr); gap: var(--space-8); }
}
@media (max-width: 47.99rem) {
  .submit-page { padding-block: var(--space-12) var(--space-12); }
  .submit-intro { margin-bottom: var(--space-8); }
  .submission-card { padding: var(--space-4); }
}
@media (prefers-reduced-transparency: reduce) {
  .submission-card { background: var(--surface); }
}
</style>
