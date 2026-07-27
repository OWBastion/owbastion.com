<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交挑战 · 躲避堡垒 3" });

const toast = useToast();
const { loading, error, submit } = useSubmissionUpload();
const file = ref<File | null>(null);
const previewUrl = shallowRef("");

watch(file, (next) => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = next ? URL.createObjectURL(next) : "";
});
onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});

const send = async () => {
  if (!file.value) return;
  try {
    const result = await submit(file.value);
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

    <UCard class="upload-panel" variant="subtle" as="form" aria-labelledby="upload-title" @submit.prevent="send">
        <div class="panel-heading">
          <h2 id="upload-title">上传截图</h2>
        </div>
        <UFileUpload class="upload-control" v-model="file" label="选择截图" accept="image/jpeg,image/png,image/webp" :multiple="false" />
        <section v-if="file && previewUrl" class="image-preview" aria-label="已选择的截图">
          <div class="preview-heading">
            <div><span class="preview-label">已选择截图</span><strong>{{ file.name }}</strong></div>
            <UButton type="button" label="重新选择" color="neutral" variant="ghost" size="sm" @click="file = null" />
          </div>
          <img :src="previewUrl" :alt="`已选择的截图：${file.name}`" />
        </section>
        <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
        <UButton :label="loading ? '上传中…' : '上传并识别'" :loading="loading" :disabled="!file" type="submit" block />
      </UCard>
  </main>
</template>

<style scoped>
.submit-page { padding-block: clamp(56px, 8vw, 88px) 72px; }
.submit-intro { max-width: 650px; margin-bottom: 42px; }
.submit-intro .body-copy { margin-bottom: 0; }
.upload-panel { max-width: 560px; padding: 22px; overflow: hidden; }
.upload-panel > * { min-width: 0; max-width: 100%; }
.upload-panel :deep([data-slot="body"]) { display: grid; gap: 24px; }
.panel-heading { display: grid; gap: 6px; }
.panel-heading h2 { margin: 0; color: var(--text); font-size: 1.3rem; letter-spacing: -.04em; }
.catalog-loading { padding: 22px 0; color: var(--muted); }
.upload-control { width: 100%; }
.image-preview { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-raised); }
.preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.preview-heading > div { display: grid; gap: 3px; min-width: 0; }
.preview-label { color: var(--muted); font-size: .76rem; }
.preview-heading strong { overflow: hidden; color: var(--text); font-size: .84rem; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.image-preview img { display: block; width: 100%; max-height: min(62svh, 560px); border-radius: 9px; background: #111; object-fit: contain; }
.upload-panel :deep(button[type="submit"]) { min-height: 46px; }
@media (max-width: 820px) { .submit-page { padding-bottom: 56px; } }
@media (max-width: 430px) {
  .submit-intro { margin-bottom: 32px; }
  .upload-panel { padding: 18px; }
  .upload-panel :deep([data-slot="body"]) { gap: 20px; }
}
@media (prefers-reduced-transparency: reduce) {
  .upload-panel { background: var(--surface); }
}
</style>
