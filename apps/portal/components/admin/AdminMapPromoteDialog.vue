<script setup lang="ts">
import type { AdminMapEditorRevision, AdminMapRevisionReplacementLifecycle } from "~/composables/useAdminMapEditor";

const open = defineModel<boolean>("open", { required: true });
defineProps<{ revisionName: string; replaced: AdminMapEditorRevision | null; replacedName: string; saving?: boolean }>();
const emit = defineEmits<{ confirm: [replacedLifecycle: AdminMapRevisionReplacementLifecycle | null] }>();

const keep = shallowRef<AdminMapRevisionReplacementLifecycle>("selectable");
watch(open, (value) => { if (value) keep.value = "selectable"; });
const options: Array<{ value: AdminMapRevisionReplacementLifecycle; label: string; description: string }> = [
  { value: "selectable", label: "保留为可选版本", description: "玩家仍可选择它游玩，适合限时版本并行。" },
  { value: "historical", label: "归档为历史版本", description: "不再开放，已有记录全部保留。" },
];
</script>

<template>
  <AdminResponsiveDialog v-model:open="open" :title="`把「${revisionName}」设为正式版？`" description="同一时间只有一个正式版。设置后，新的挑战、称号和精通进度都会记在它上面，不会复制或清除任何玩家进度。" size="md" :dismissible="!saving">
    <template #body>
      <div v-if="replaced" class="promote" role="radiogroup" :aria-label="`原正式版「${replacedName}」改为`">
        <p>原正式版「{{ replacedName }} · {{ replaced.gameVersion }}」改为：</p>
        <button v-for="option in options" :key="option.value" type="button" role="radio" class="promote__option" :aria-checked="keep === option.value" @click="keep = option.value">
          <strong>{{ option.label }}</strong>
          <span>{{ option.description }}</span>
        </button>
      </div>
    </template>
    <template #footer>
      <UButton class="pressable" label="确认设为正式版" :loading="saving" :disabled="saving" @click="emit('confirm', replaced ? keep : null)" />
      <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="open = false" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.promote { display: grid; gap: 0.5rem; }
.promote p { margin: 0 0 0.25rem; color: var(--muted); font-size: 0.875rem; }
.promote__option { display: grid; gap: 0.15rem; padding: 0.75rem 0.875rem; border: 1.5px solid var(--line); border-radius: var(--radius-control); background: var(--surface); text-align: left; color: var(--text); }
.promote__option span { color: var(--muted); font-size: var(--type-caption-size); }
.promote__option[aria-checked="true"] { border-color: var(--accent); background: var(--accent-surface); }
</style>
