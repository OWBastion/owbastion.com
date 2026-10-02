<script setup lang="ts">
const { status, draft, savedToken, loading, saving, errorMessage, feedback, refreshRequired, validDraft, canSave, refresh, generate, write, copy, clearSecret } = useOcrkitServiceToken();
const confirmation = shallowRef<'save' | 'disable' | null>(null);
const confirmationOpen = computed({ get: () => confirmation.value !== null, set: (value: boolean) => { if (!value) confirmation.value = null; } });
const formattedTime = computed(() => status.value?.updatedAt ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(status.value.updatedAt) : '暂无记录');
const tokenError = computed(() => draft.value && !validDraft.value ? '使用 32–256 位字母、数字、下划线或连字符。' : undefined);

async function confirmWrite() {
  const success = await write(confirmation.value === 'disable' ? null : draft.value);
  if (success || refreshRequired.value) confirmation.value = null;
}
</script>

<template>
  <AdminWorkspace title="内部服务凭据">
    <template #actions>
      <UButton color="neutral" variant="outline" :loading="loading" :disabled="saving" @click="refresh">刷新状态</UButton>
    </template>
    <template #messages>
      <UAlert v-if="errorMessage" color="error" :description="errorMessage" />
      <p v-if="feedback" role="status">{{ feedback }}</p>
    </template>
    <p v-if="loading && !status" role="status">读取中…</p>
    <UCard v-if="status">
      <template #header><h2 class="card-heading">OCRKit 截图集读取</h2></template>
      <div class="service-token-content">
        <dl class="detail-grid">
          <div class="detail-grid__row"><dt>状态</dt><dd>{{ status.configured ? '已配置' : '未配置' }}</dd></div>
          <div class="detail-grid__row"><dt>更新时间</dt><dd>{{ formattedTime }}</dd></div>
        </dl>
        <p>替换或停用后，旧凭据会失效。跨节点同步可能需要 60 秒或更久，服务还可能使用最多 30 秒的本地缓存。</p>
        <div v-if="savedToken" class="service-token-content" aria-label="本次保存的凭据">
          <UFormField label="本次保存的凭据" description="明文仅在本次操作中显示，关闭后无法再次读取。">
            <UInput :model-value="savedToken" readonly class="w-full" aria-label="本次保存的凭据" />
          </UFormField>
          <div class="action-row">
            <UButton color="neutral" variant="outline" @click="copy(savedToken)">复制凭据</UButton>
            <UButton color="neutral" variant="ghost" @click="clearSecret">关闭明文</UButton>
          </div>
        </div>
        <UForm :state="{ token: draft }" @submit="confirmation = 'save'">
          <UFormField label="新凭据" :error="tokenError" description="使用 32–256 位字母、数字、下划线或连字符。" required>
            <UInput v-model="draft" type="password" autocomplete="off" :disabled="saving" class="w-full" aria-label="新凭据" />
          </UFormField>
          <div class="action-row service-token-actions">
            <UButton type="submit" :disabled="!canSave" :loading="saving">{{ saving ? '保存中…' : '保存凭据' }}</UButton>
            <UButton color="neutral" variant="outline" :disabled="saving" @click="generate">生成新凭据</UButton>
            <UButton v-if="draft" color="neutral" variant="outline" :disabled="saving" @click="copy(draft)">复制草稿</UButton>
            <UButton v-if="draft" color="neutral" variant="ghost" :disabled="saving" @click="clearSecret">清除草稿</UButton>
            <UButton v-if="status.configured" color="error" variant="soft" :disabled="saving || loading || refreshRequired" @click="confirmation = 'disable'">停用凭据</UButton>
          </div>
        </UForm>
      </div>
    </UCard>
    <AdminResponsiveDialog v-model:open="confirmationOpen" :dismissible="!saving" :title="confirmation === 'disable' ? '确认停用凭据' : '确认保存凭据'">
      <template #body><p>{{ confirmation === 'disable' ? '停用后，Studio 将无法读取截图集。' : status?.configured ? '保存后将替换当前凭据，请同步更新 Studio 配置。' : '保存后可将此凭据配置到 Studio。' }}</p></template>
      <template #footer>
        <UButton :color="confirmation === 'disable' ? 'error' : 'primary'" :loading="saving" :disabled="refreshRequired" @click="confirmWrite">{{ confirmation === 'disable' ? '确认停用' : '确认保存' }}</UButton>
        <UButton color="neutral" variant="outline" :disabled="saving" @click="confirmation = null">取消</UButton>
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.service-token-content { display: grid; gap: var(--space-4); min-width: 0; }
.service-token-actions { margin-top: var(--space-4); }
</style>
