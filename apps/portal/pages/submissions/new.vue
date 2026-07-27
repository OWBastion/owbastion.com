<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import type { FormError, FormSubmitEvent } from "@nuxt/ui";
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交挑战 · 躲避堡垒 3" });

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

const toast = useToast();
const { loading, error, submit } = useSubmissionUpload();

const state = reactive<{ screenshot: File | null }>({ screenshot: null });
const previewUrl = shallowRef("");

watch(() => state.screenshot, (next) => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = next ? URL.createObjectURL(next) : "";
});
onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});

const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const clearScreenshot = () => { state.screenshot = null; };

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
    toast.add({ title: "已收到，正在识别。", color: "success" });
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
              <UFileUpload v-model="state.screenshot" class="upload-control" label="点击上传或拖拽截图到此处" :accept="ACCEPT_ATTR" :multiple="false" description="支持 JPEG、PNG、WebP 格式，文件大小不超过 10MB" :disabled="loading" />
            </UFormField>
            <UCard v-if="state.screenshot && previewUrl" class="selected-file" variant="subtle">
              <img :src="previewUrl" :alt="`已选择的截图：${state.screenshot.name}`" />
              <div class="file-meta"><strong>{{ state.screenshot.name }}</strong><span>{{ fileSize(state.screenshot.size) }}</span></div>
              <UButton type="button" icon="i-lucide-x" color="neutral" variant="soft" size="sm" aria-label="移除已选择的截图" @click="clearScreenshot" />
            </UCard>
            <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
            <UButton class="submit-button" :label="loading ? '上传中…' : '上传并识别截图'" icon="i-lucide-sparkles" :loading="loading" :disabled="!state.screenshot" type="submit" block />
            <p class="privacy-note"><UIcon name="i-lucide-lock-keyhole" aria-hidden="true" /> 截图仅用于挑战核对，我们会严格保护您的隐私</p>
          </UForm>
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
.selected-file { display: grid; grid-template-columns: 126px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-width: 0; padding: 8px; border-color: var(--line); background: var(--surface-raised); box-shadow: none; }
.selected-file img { display: block; width: 126px; height: 68px; border-radius: 8px; background: var(--text); object-fit: cover; }
.file-meta { display: grid; min-width: 0; gap: 4px; }
.file-meta strong { overflow: hidden; color: var(--text); font-size: .8rem; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.file-meta span { color: var(--muted); font-size: .75rem; }
.submit-button { min-height: 44px; }
.privacy-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin: -2px 0 0; color: var(--quiet); font-size: .74rem; }
.privacy-note > svg { width: 14px; height: 14px; }
.process-card { margin-top: 22px; }
@media (max-width: 820px) { .submit-page { padding-bottom: 56px; }.submission-columns { grid-template-columns: 1fr; gap: 34px; } }
@media (max-width: 430px) {
  .submit-intro { margin-bottom: 32px; }
  .submission-card { padding: 18px; }
  .selected-file { grid-template-columns: 88px minmax(0, 1fr) auto; gap: 8px; }
  .selected-file img { width: 88px; height: 58px; }
}
@media (prefers-reduced-transparency: reduce) {
  .submission-card, .process-card { background: var(--surface); }
}
</style>
