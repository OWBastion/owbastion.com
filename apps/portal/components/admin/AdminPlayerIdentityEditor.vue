<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";

const props = withDefaults(defineProps<{
  player: AdminPlayerDetail;
  loading?: boolean;
}>(), { loading: false });
const emit = defineEmits<{ save: [playerName: string, playerId: string] }>();
const open = defineModel<boolean>("open", { required: true });
const draftName = shallowRef("");
const draftId = shallowRef("");
const trimmedName = computed(() => draftName.value.trim());
const trimmedId = computed(() => draftId.value.trim());
const idValid = computed(() => /^\d{1,10}$/.test(trimmedId.value));
const previewName = computed(() => trimmedName.value || props.player.playerName);
const previewId = computed(() => trimmedId.value || props.player.playerId);
const changed = computed(() => trimmedName.value !== props.player.playerName || trimmedId.value !== props.player.playerId);
const canSave = computed(() => Boolean(trimmedName.value) && idValid.value && changed.value && !props.loading);

watch(() => open.value, (isOpen) => {
  if (isOpen) {
    draftName.value = props.player.playerName;
    draftId.value = props.player.playerId;
  }
}, { immediate: true });

function save() {
  if (!canSave.value) return;
  emit("save", trimmedName.value, trimmedId.value);
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="open" title="编辑战网 ID" size="sm" :dismissible="!loading">
    <template #body>
      <form id="player-identity-editor" class="identity-editor" @submit.prevent="save">
        <UFormField label="玩家名称" required>
          <UInput v-model="draftName" maxlength="64" autocomplete="off" :disabled="loading" />
        </UFormField>
        <UFormField label="数字 ID" required :error="trimmedId && !idValid ? '数字 ID 为 1–10 位数字。' : undefined">
          <UInput v-model="draftId" maxlength="10" inputmode="numeric" autocomplete="off" :disabled="loading" class="identity-editor__number" />
        </UFormField>
        <output class="identity-editor__preview" aria-live="polite">
          <span>预览</span>
          <strong><PlayerBattleTag :player-name="previewName" :player-id="previewId" /></strong>
        </output>
        <p class="identity-editor__note">游戏内称号在下一次 Bastion 构建同步后按新名称生效。</p>
      </form>
    </template>
    <template #footer>
      <UButton label="保存战网 ID" type="submit" form="player-identity-editor" :loading="loading" :disabled="!canSave" />
      <UButton label="取消" color="neutral" variant="outline" :disabled="loading" @click="open = false" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.identity-editor { display: grid; gap: 1rem; }
.identity-editor__number :deep(input) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.identity-editor__preview { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--accent-surface); }
.identity-editor__preview span { color: var(--quiet); font-size: var(--type-caption-size); }
.identity-editor__preview strong { overflow-wrap: anywhere; color: var(--text); font-size: var(--type-body-sm-size); }
.identity-editor__note { margin: 0; color: var(--muted); font-size: var(--type-caption-size); line-height: 1.55; }
</style>
