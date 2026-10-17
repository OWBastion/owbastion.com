<script setup lang="ts">
import type { PlayerPublicHandleResponse } from "@owbastion/contracts";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

const props = defineProps<{ publicHandle: string | null; publicProfile: boolean }>();
const emit = defineEmits<{ updated: [value: string] }>();
const api = usePortalApi();
const draft = ref(props.publicHandle ?? "");
const saving = ref(false);
const error = ref("");
const saved = ref(false);
watch(() => props.publicHandle, (value) => { draft.value = value ?? ""; });

async function save() {
  if (saving.value) return;
  error.value = "";
  saved.value = false;
  const publicHandle = draft.value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{2,23}$/.test(publicHandle)) {
    error.value = "ID 需为 3–24 位，以字母开头，只能使用小写字母、数字、下划线和连字符。";
    return;
  }
  saving.value = true;
  try {
    const result = await api<PlayerPublicHandleResponse>("/v1/me/profile/handle", {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", publicHandle },
    });
    draft.value = result.publicHandle;
    emit("updated", result.publicHandle);
    saved.value = true;
  } catch (cause) {
    const details = portalErrorDetails(cause, "保存失败，请稍后重试。");
    error.value = details.statusCode === 409 ? "这个 ID 已被其他玩家使用。" : details.description;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UCard variant="subtle">
    <form class="handle-form" @submit.prevent="save">
      <div class="handle-copy">
        <strong>平台 ID</strong>
        <p>设置后可通过专属地址分享主页。修改 ID 后，旧地址将不再可用。</p>
      </div>
      <div class="handle-controls">
        <span class="handle-prefix">owbastion.com/u/</span>
        <UInput v-model="draft" name="publicHandle" aria-label="平台 ID" placeholder="your-id" :maxlength="24" autocomplete="off" autocapitalize="off" spellcheck="false" :disabled="saving" />
        <UButton type="submit" :loading="saving" :disabled="saving || !draft.trim()" label="保存 ID" />
      </div>
      <p v-if="error" class="handle-error" role="alert">{{ error }}</p>
      <p v-else-if="saved" class="handle-message" role="status">已保存。</p>
      <NuxtLink v-if="publicHandle && publicProfile" class="handle-link" :to="`/u/${publicHandle}`">查看公开主页 <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" /></NuxtLink>
      <p v-else-if="publicHandle" class="handle-message">你的主页当前未公开。开启下方开关后，其他人才能访问。</p>
    </form>
  </UCard>
</template>

<style scoped>
.handle-form, .handle-copy { display: grid; gap: var(--space-2); }
.handle-copy strong { color: var(--text); font-size: .85rem; }
.handle-copy p, .handle-message { margin: 0; color: var(--quiet); font-size: .75rem; }
.handle-controls { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.handle-prefix { color: var(--muted); font-size: var(--type-body-sm-size); }
.handle-controls :deep(input) { min-width: 10rem; }
.handle-link { display: inline-flex; align-items: center; gap: var(--space-1); justify-self: start; color: var(--accent); font-size: var(--type-body-sm-size); }
.handle-error { margin: 0; color: var(--danger); font-size: var(--type-body-sm-size); }
</style>
