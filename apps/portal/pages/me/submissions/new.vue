<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import SubmissionProgress from "~/components/submissions/SubmissionProgress.vue";
import SubmissionRequirements from "~/components/submissions/SubmissionRequirements.vue";

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
    const title = result.status === "needs_review"
      ? "截图已处理，等待核对。"
      : result.status === "rejected"
        ? "截图未通过处理，请查看提交详情。"
        : result.status === "completed"
          ? "截图处理完成。"
          : "截图已上传，等待处理。";
    toast.add({ title, color: result.status === "rejected" ? "warning" : "success" });
    await navigateTo(`/me/submissions/${encodeURIComponent(result.submissionId)}`);
  } catch {
    // useSubmissionUpload already shows the failure inline, with retry guidance, in a role="alert" region.
  }
};
</script>

<template>
  <main class="submit-page page-shell">
    <PageMasthead title-id="submit-title" eyebrow="Submit a run" title="提交完成截图" description="上传一张游戏内完成截图，系统识别后会进入核对，通过后自动记入精通与称号。" />

    <div class="submit-grid">
      <section class="upload-panel" aria-labelledby="upload-title">
        <h2 id="upload-title" class="upload-panel__title">上传截图</h2>
        <UForm :state="state" :disabled="loading" aria-labelledby="upload-title" @submit="send">
          <UFormField name="screenshot" :error="fileError">
            <UFileUpload
              v-model="state.screenshot"
              class="upload-control"
              icon="i-lucide-image-up"
              label="拖入截图，或点击选择"
              :accept="ACCEPT_ATTR"
              :multiple="false"
              layout="grid"
              position="outside"
              :preview="true"
              :ui="{ base: 'min-h-72 border-dashed', files: 'w-full', file: 'w-full', fileLeadingAvatar: 'size-full rounded-lg object-contain', fileTrailingButton: 'absolute top-2 end-2 rounded-full border-2 border-bg' }"
              description="JPEG、PNG、WebP，不超过 10MB · 也可以直接 Ctrl/⌘ + V 粘贴"
              :disabled="loading"
            />
          </UFormField>
          <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
          <UButton
            size="xl"
            block
            :label="loading ? `${phaseLabel}…` : '上传并识别截图'"
            icon="i-lucide-scan-line"
            :loading="loading"
            :disabled="loading || !state.screenshot || !!fileError"
            type="submit"
          />
          <ul class="privacy-note" aria-label="截图用途">
            <li><UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />截图用于挑战核对、截图识别，以及改进截图识别模型</li>
            <li><UIcon name="i-lucide-eye-off" aria-hidden="true" />提交截图不会对外公开</li>
            <li><UIcon name="i-lucide-shield" aria-hidden="true" />原始识别结果仅平台内部使用</li>
          </ul>
        </UForm>
      </section>
      <div class="guide-panel"><SubmissionRequirements /></div>
    </div>
    <SubmissionProgress />
  </main>
</template>

<style scoped>
.submit-page { display: grid; gap: var(--space-5); padding-block: clamp(2.5rem, 7vh, 4.5rem) 4.5rem; }
.submit-page :deep(.masthead) { margin-bottom: var(--space-2); }
.submit-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: var(--space-5); }
.upload-panel, .guide-panel { min-width: 0; padding: clamp(var(--space-4), 3vw, var(--space-6)); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.upload-panel { display: grid; align-content: start; gap: var(--space-4); border-color: color-mix(in oklch, var(--accent) 30%, var(--line)); background: radial-gradient(80% 60% at 50% 0%, color-mix(in oklch, var(--accent) 8%, transparent), transparent 70%), var(--surface); }
.upload-panel__title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.upload-panel :deep(form) { display: grid; gap: var(--space-4); }
.upload-control { width: 100%; }
.privacy-note { display: grid; gap: var(--space-1); margin: 0; padding: 0; color: var(--quiet); font-size: var(--type-caption-size); line-height: 1.5; list-style: none; }
.privacy-note li { display: flex; align-items: center; gap: var(--space-2); }
.privacy-note svg { flex: none; width: .875rem; height: .875rem; }
@media (max-width: 63.99rem) { .submit-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 47.99rem) { .submit-page { padding-block: var(--space-6) var(--space-12); } }
</style>
