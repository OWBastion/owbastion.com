<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import SubmissionRequirements from "~/components/submissions/SubmissionRequirements.vue";

definePageMeta({ middleware: "auth" });
useSeoMeta({ title: "提交截图 · 躲避堡垒 3" });

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

const { loading, phaseLabel, error, submit } = useSubmissionUpload();

const state = reactive<{ screenshot: File | null }>({ screenshot: null });

// Validated as soon as a file is chosen, so a bad file is caught before the player presses upload.
const fileError = computed(() => {
  const file = state.screenshot;
  if (!file) return undefined;
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "仅支持 JPG / PNG / WebP";
  if (file.size > MAX_BYTES) return "超过 10MB";
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
    // The detail page shows the outcome, so no toast repeats it.
    await navigateTo(`/me/submissions/${encodeURIComponent(result.submissionId)}`);
  } catch {
    // useSubmissionUpload already shows the failure inline, with retry guidance, in a role="alert" region.
  }
};
</script>

<template>
  <main class="submit page-shell">
    <h1 id="submit-title" class="submit__title">提交截图</h1>
    <UForm :state="state" :disabled="loading" class="submit__form" aria-labelledby="submit-title" @submit="send">
      <UFormField name="screenshot" :error="fileError">
        <UFileUpload
          v-model="state.screenshot"
          class="w-full"
          label="拖入、粘贴或点击"
          :accept="ACCEPT_ATTR"
          :multiple="false"
          layout="grid"
          position="outside"
          :preview="true"
          :ui="{ base: 'min-h-64 border-dashed', files: 'w-full', file: 'w-full', fileLeadingAvatar: 'size-full rounded-lg object-contain', fileTrailingButton: 'absolute top-2 end-2 rounded-full border-2 border-bg' }"
          :disabled="loading"
        >
          <template #leading><SubmissionRequirements class="submit__sketch" /></template>
        </UFileUpload>
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
      <UButton
        v-if="state.screenshot"
        size="xl"
        block
        :label="loading ? `${phaseLabel}…` : '提交'"
        :loading="loading"
        :disabled="loading || !!fileError"
        type="submit"
      />
      <p class="submit__privacy"><UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />用于核对、识别和改进识别模型，不公开</p>
    </UForm>
  </main>
</template>

<style scoped>
.submit { display: grid; align-content: start; gap: var(--space-6); max-width: 40rem; padding-block: clamp(3rem, 10vh, 6rem) 4.5rem; }
.submit__title { margin: 0; font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3rem); font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.submit__sketch { width: min(22rem, 100%); margin-bottom: var(--space-2); }
.submit__form { display: grid; gap: var(--space-4); }
.submit__privacy { display: flex; align-items: center; justify-content: center; gap: var(--space-2); margin: 0; color: var(--quiet); font-size: var(--type-caption-size); }
@media (max-width: 47.99rem) { .submit { padding-block: var(--space-8) var(--space-12); } }
</style>
