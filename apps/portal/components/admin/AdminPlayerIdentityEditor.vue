<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";

const props = withDefaults(defineProps<{
  player: AdminPlayerDetail;
  loading?: boolean;
}>(), { loading: false });
const emit = defineEmits<{ save: [playerName: string] }>();
const open = defineModel<boolean>("open", { required: true });
const draftName = shallowRef("");
const trimmedName = computed(() => draftName.value.trim());
const battleTagPreview = computed(() => `${trimmedName.value || props.player.playerName}#${props.player.playerId}`);
const canSave = computed(() => Boolean(trimmedName.value) && trimmedName.value !== props.player.playerName && !props.loading);

watch(() => open.value, (isOpen) => {
  if (isOpen) draftName.value = props.player.playerName;
}, { immediate: true });

function save() {
  if (!canSave.value) return;
  emit("save", trimmedName.value);
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="open" title="编辑战网 ID" :description="`${player.playerName}#${player.playerId}`" size="sm" :dismissible="!loading">
    <template #body>
      <form id="player-identity-editor" class="identity-editor" @submit.prevent="save">
        <UFormField label="玩家名称" required>
          <UInput v-model="draftName" maxlength="64" autocomplete="off" :disabled="loading" />
        </UFormField>
        <UFormField label="玩家 ID" hint="数字 ID 保持不变。">
          <UInput :model-value="player.playerId" readonly class="identity-editor__readonly" />
        </UFormField>
        <output class="identity-editor__preview" aria-live="polite">
          <span>预览</span>
          <strong>{{ battleTagPreview }}</strong>
        </output>
      </form>
    </template>
    <template #footer>
      <UButton label="取消" color="neutral" variant="outline" :disabled="loading" @click="open = false" />
      <UButton label="保存战网 ID" type="submit" form="player-identity-editor" :loading="loading" :disabled="!canSave" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.identity-editor { display: grid; gap: 1rem; }
.identity-editor__readonly :deep(input) { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.identity-editor__preview { display: grid; gap: 5px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--accent-surface); }
.identity-editor__preview span { color: var(--quiet); font-size: .72rem; }
.identity-editor__preview strong { overflow-wrap: anywhere; color: var(--text); font-size: .9rem; }
</style>
