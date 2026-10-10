<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

const props = defineProps<{ player: AdminPlayerDetail }>();
const open = defineModel<boolean>("open", { required: true });
const api = useAdminApi();
const verified = shallowRef(false);
const loading = shallowRef(false);
const requestId = shallowRef("");
const errorMessage = shallowRef("");
const link = shallowRef("");
const expiresAt = shallowRef<number | null>(null);
const copied = shallowRef(false);

watch(open, (isOpen) => {
  if (!isOpen) return;
  verified.value = false;
  errorMessage.value = "";
  link.value = "";
  expiresAt.value = null;
  requestId.value = createRequestId();
});

async function issue() {
  if (!verified.value || !requestId.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await api<{ contractVersion: "1"; recoveryUrl: string; expiresAt: number }>(`/v1/player-accounts/${encodeURIComponent(props.player.playerAccountId)}/passkey-recovery`, {
      method: "POST",
      headers: { "Idempotency-Key": requestId.value },
      body: { contractVersion: "1", identityVerified: true },
    });
    link.value = result.recoveryUrl;
    expiresAt.value = result.expiresAt;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法签发恢复链接，请稍后重试。").description;
  } finally { loading.value = false; }
}

async function copy() {
  if (!link.value || !navigator.clipboard) return;
  await navigator.clipboard.writeText(link.value);
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1600);
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="open" title="签发 Passkey 恢复链接" :description="`${player.playerName}#${player.playerId}`" size="sm" :dismissible="!loading">
    <template #body>
      <div v-if="link" class="recovery">
        <UAlert color="success" variant="subtle" title="一次性恢复链接已签发" :description="expiresAt ? `有效至 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(expiresAt)}` : undefined" />
        <code>{{ link }}</code>
      </div>
      <div v-else class="recovery">
        <p>签发后会立即移除此帐号现有 Passkey，并撤销其所有 Portal 会话。玩家完成新 Passkey 注册后仍使用原 Player Account，提交、称号和精通记录继续保留。</p>
        <UCheckbox v-model="verified" label="我已通过独立方式核验玩家身份，并确认恢复到此帐号。" :disabled="loading" />
        <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
      </div>
    </template>
    <template #footer>
      <template v-if="link">
        <UButton :label="copied ? '已复制' : '复制恢复链接'" icon="i-lucide-copy" @click="copy" />
        <UButton label="完成" color="neutral" variant="outline" @click="open = false" />
      </template>
      <template v-else>
        <UButton label="签发一次性链接" color="warning" variant="soft" :loading="loading" :disabled="loading || !verified" @click="issue" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="loading" @click="open = false" />
      </template>
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.recovery { display: grid; gap: var(--space-4); }
.recovery p { margin: 0; color: var(--muted); line-height: 1.6; }
.recovery code { padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); overflow-wrap: anywhere; background: var(--surface-raised); }
</style>
