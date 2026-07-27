<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
import SubmissionProcess from "~/components/submissions/SubmissionProcess.vue";
import SubmissionRequirements from "~/components/submissions/SubmissionRequirements.vue";
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交挑战 · 躲避堡垒 3" });

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

const toast = useToast();
const { loading, error, submit } = useSubmissionUpload();

const state = reactive<{ screenshot: File | null }>({ screenshot: null });

const validate = (s: typeof state): FormError[] => {
  const errs: FormError[] = [];
  if (!s.screenshot) {
    errs.push({ name: "screenshot", message: "请选择一张截图。" });
  } else if (!(ACCEPTED_TYPES as readonly string[]).includes(s.screenshot.type)) {
    errs.push({ name: "screenshot", message: "仅支持 JPEG、PNG 或 WebP 格式。" });
  }
  return errs;
};

const send = async (_event: FormSubmitEvent<typeof state>) => {
  if (!state.screenshot) return;
  try {
    const result = await submit(state.screenshot);
    const title = result.status === "awaiting_player_confirmation" ? "识别完成，请确认挑战。" : result.status === "ready_for_review" ? "识别通过，已提交管理员核对。" : result.status === "resubmission_required" ? "截图未通过识别，请重新提交。" : "截图已上传，识别仍在进行。";
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
      <p class="eyebrow">挑战提交</p>
      <h1 id="submit-title" class="page-title">提交完成截图</h1>
      <p class="body-copy">上传一张完整截图，识别后再确认对应的挑战。</p>
    </section>

    <UCard class="submission-card" variant="subtle">
      <div class="submission-columns">
        <section class="upload-section" aria-labelledby="upload-title">
          <div class="section-heading">
            <p class="section-number">1.</p>
            <div>
              <h2 id="upload-title">上传截图</h2>
              <p>请确保截图清晰，包含以下必要信息</p>
            </div>
          </div>
          <UForm :state="state" :validate="validate" aria-labelledby="upload-title" @submit="send">
            <UFormField name="screenshot">
              <UFileUpload v-model="state.screenshot" class="upload-control" label="点击上传或拖拽截图到此处" :accept="ACCEPT_ATTR" :multiple="false" layout="grid" position="outside" :preview="true" :ui="{ base: 'aspect-video !flex-none', files: 'w-full', file: 'w-full aspect-video overflow-hidden rounded-lg', fileLeadingAvatar: 'size-full rounded-lg object-contain', fileTrailingButton: 'absolute top-2 end-2 rounded-full border-2 border-bg' }" description="支持 JPEG、PNG、WebP 格式，文件大小不超过 10MB" :disabled="loading" />
            </UFormField>
            <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
            <UButton class="submit-button" :label="loading ? '上传中…' : '上传并识别截图'" icon="i-lucide-sparkles" :loading="loading" :disabled="loading || !state.screenshot" type="submit" block />
          </UForm>
          <div class="privacy-note">
            <div class="privacy-header">
              <UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />
              <span>截图仅用于挑战核对与模型训练，你的隐私会得到严格保护</span>
            </div>
            <ul class="privacy-details">
              <li>截图将用于模型训练，以提升该项目的识别能力</li>
              <li>模型训练在非云端且不经任何第三方介入的情况下完成</li>
              <li>训练数据不会对外公开访问，训练模型仅用于该项目的截图识别</li>
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
.submit-page { padding-block: clamp(56px, 8vw, 88px) 72px; }
.submit-intro { max-width: 650px; margin-bottom: 28px; }
.submit-intro .body-copy { margin-bottom: 0; }
.submission-card, .process-card { border-color: var(--line); box-shadow: 0 16px 40px -34px var(--shadow); }
.submission-card { padding: clamp(20px, 3vw, 30px); }
.submission-columns { display: grid; grid-template-columns: minmax(0, 1.02fr) minmax(320px, .98fr); gap: clamp(28px, 5vw, 64px); }
.upload-section { min-width: 0; }
.section-heading { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 18px; }
.section-number { margin: 0; color: var(--text); font-size: 1.1rem; font-weight: 760; }
.section-heading h2 { margin: 0; color: var(--text); font-size: 1.1rem; letter-spacing: -.03em; }
.section-heading p:last-child { margin: 5px 0 0; color: var(--muted); font-size: .84rem; }
.upload-section :deep(form) { display: grid; gap: 14px; }
.upload-control { width: 100%; }
.submit-button { min-height: 44px; }
.privacy-note { display: grid; gap: 6px; margin: 8px 0 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-raised); font-size: .74rem; line-height: 1.5; }
.privacy-header { display: flex; align-items: center; gap: 6px; color: var(--text); font-weight: 600; }
.privacy-header > svg { flex: 0 0 auto; width: 14px; height: 14px; color: var(--muted); }
.privacy-details { margin: 0; padding-left: 18px; display: grid; gap: 3px; color: var(--muted); }
.privacy-details li::marker { color: var(--quiet); }
.process-card { margin-top: 22px; }
@media (max-width: 820px) { .submit-page { padding-bottom: 56px; }.submission-columns { grid-template-columns: 1fr; gap: 34px; } }
@media (max-width: 430px) {
  .submit-intro { margin-bottom: 32px; }
  .submission-card { padding: 18px; }
}
@media (prefers-reduced-transparency: reduce) {
  .submission-card, .process-card { background: var(--surface); }
}
</style>
