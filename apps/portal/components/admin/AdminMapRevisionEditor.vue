<script setup lang="ts">
import type {
  AdminMapEditorChallengeOption,
  AdminMapEditorRevision,
  AdminMapRevisionAssignmentInput,
  AdminMapRevisionChallengeFamily,
  AdminMapRevisionLifecycle,
  AdminMapRevisionReplacementLifecycle,
  AdminMapRevisionUpdateInput,
} from "~/composables/useAdminMapEditor";

const props = withDefaults(defineProps<{
  revision: AdminMapEditorRevision;
  replacedDefaultRevision?: AdminMapEditorRevision | null;
  challengeCatalog: AdminMapEditorChallengeOption[];
  saving?: boolean;
}>(), { saving: false, replacedDefaultRevision: null });
const emit = defineEmits<{ save: [input: AdminMapRevisionUpdateInput] }>();

const lifecycleLabels: Record<AdminMapRevisionLifecycle, string> = { preparing: "准备中", default: "默认", selectable: "可选", historical: "历史" };
const familyLabels: Record<AdminMapRevisionChallengeFamily, string> = { map_challenge: "地图挑战", map_title_rule: "地图称号规则", title_challenge: "称号挑战" };
const lifecycleItems = (Object.entries(lifecycleLabels) as Array<[AdminMapRevisionLifecycle, string]>).map(([value, label]) => ({ value, label }));
const mapVariantItems = [{ value: null, label: "正式版" }, { value: "classic", label: "经典版" }];
const replacementLifecycleItems = [{ value: "selectable", label: "保留为可选版本" }, { value: "historical", label: "归档为历史版本" }];

const lifecycle = shallowRef<AdminMapRevisionLifecycle>(props.revision.lifecycle);
const replacedDefaultLifecycle = shallowRef<AdminMapRevisionReplacementLifecycle>("selectable");
const mapVariant = shallowRef<"classic" | null>(props.revision.mapVariant);
const gameVersion = shallowRef(props.revision.gameVersion);
const spatialJson = shallowRef("");
const spatialError = shallowRef("");
const assignments = shallowRef<Record<string, AdminMapRevisionAssignmentInput>>({});

const assignmentKey = (family: AdminMapRevisionChallengeFamily, challengeId: string) => `${family}:${challengeId}`;
const sync = (revision: AdminMapEditorRevision) => {
  lifecycle.value = revision.lifecycle;
  replacedDefaultLifecycle.value = "selectable";
  mapVariant.value = revision.mapVariant;
  gameVersion.value = revision.gameVersion;
  spatialJson.value = revision.spatialConfig ? JSON.stringify(revision.spatialConfig, null, 2) : "";
  spatialError.value = "";
  assignments.value = Object.fromEntries(revision.challengeAssignments.map((assignment) => [assignmentKey(assignment.challengeFamily, assignment.challengeId), {
    challengeFamily: assignment.challengeFamily,
    challengeId: assignment.challengeId,
    enabled: assignment.enabled,
    condition: assignment.condition,
    evidenceRule: assignment.evidenceRule,
    submissionMode: assignment.submissionMode,
    slot: assignment.slot,
  }]));
};
watch(() => props.revision.revisionId, () => sync(props.revision), { immediate: true });

const isReplacingDefault = computed(() => lifecycle.value === "default" && props.replacedDefaultRevision !== null);

const isAssigned = (option: AdminMapEditorChallengeOption) => assignments.value[assignmentKey(option.challengeFamily, option.challengeId)]?.enabled === true;
const toggleAssignment = (option: AdminMapEditorChallengeOption, enabled: boolean) => {
  const key = assignmentKey(option.challengeFamily, option.challengeId);
  if (!enabled) {
    const existing = assignments.value[key];
    if (existing) assignments.value = { ...assignments.value, [key]: { ...existing, enabled: false } };
    return;
  }
  assignments.value = {
    ...assignments.value,
    [key]: assignments.value[key] ? { ...assignments.value[key], enabled: true } : {
      challengeFamily: option.challengeFamily,
      challengeId: option.challengeId,
      enabled: true,
      condition: null,
      evidenceRule: null,
      submissionMode: null,
      slot: null,
    },
  };
};

const parseSpatial = (): Record<string, unknown> | null | undefined => {
  const value = spatialJson.value.trim();
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      spatialError.value = "空间配置必须是 JSON 对象。";
      return undefined;
    }
    spatialError.value = "";
    return parsed as Record<string, unknown>;
  } catch {
    spatialError.value = "空间配置不是有效 JSON。";
    return undefined;
  }
};

function save() {
  const spatialConfig = parseSpatial();
  if (spatialConfig === undefined) return;
  emit("save", {
    contractVersion: "1",
    lifecycle: lifecycle.value,
    replacedDefaultLifecycle: isReplacingDefault.value ? replacedDefaultLifecycle.value : null,
    gameVersion: gameVersion.value.trim(),
    mapVariant: mapVariant.value,
    spatialConfig,
    challengeAssignments: Object.values(assignments.value),
  });
}

const optionLabel = (option: AdminMapEditorChallengeOption) => `${option.label} · ${familyLabels[option.challengeFamily]}`;
</script>

<template>
  <section class="revision-editor" aria-labelledby="revision-editor-title">
    <header class="revision-editor__header">
      <h2 id="revision-editor-title" class="type-headline">编辑当前边界</h2>
      <StatusBadge :label="lifecycleLabels[revision.lifecycle]" :tone="revision.lifecycle === 'default' ? 'success' : revision.lifecycle === 'selectable' ? 'info' : 'default'" />
    </header>

    <form class="revision-form" @submit.prevent="save">
      <div class="revision-form__grid">
        <UFormField label="生命周期" hint="平台服务端会校验可用的状态转换。">
          <USelect v-model="lifecycle" :items="lifecycleItems" :disabled="saving" />
        </UFormField>
        <UFormField label="游戏版本" required>
          <UInput v-model="gameVersion" required :disabled="saving" />
        </UFormField>
        <UFormField label="地图变体" hint="默认版本修订必须使用正式版。">
          <USelect v-model="mapVariant" :items="mapVariantItems" :disabled="saving" />
        </UFormField>
        <UFormField v-if="isReplacingDefault" label="原默认版本处理" :hint="`将 ${replacedDefaultRevision?.revisionId} 改为以下状态。`">
          <USelect v-model="replacedDefaultLifecycle" :items="replacementLifecycleItems" :disabled="saving" />
        </UFormField>
      </div>

      <fieldset class="assignment-fieldset">
        <legend>挑战分配</legend>
        <div v-if="challengeCatalog.length" class="assignment-list">
          <UCheckbox
            v-for="option in challengeCatalog"
            :key="assignmentKey(option.challengeFamily, option.challengeId)"
            :model-value="isAssigned(option)"
            :label="optionLabel(option)"
            :disabled="saving"
            @update:model-value="toggleAssignment(option, Boolean($event))"
          />
        </div>
        <p v-else class="empty-note">当前地图没有可分配的挑战定义。</p>
      </fieldset>

      <details class="spatial-advanced">
        <summary>空间配置</summary>
        <UFormField hint="使用平台 contract 的 JSON 表示；具体字段、坐标和引用由服务端统一校验。">
          <UTextarea v-model="spatialJson" :rows="10" class="spatial-input" :disabled="saving" spellcheck="false" />
          <p v-if="spatialError" class="field-error" role="alert">{{ spatialError }}</p>
        </UFormField>
      </details>

      <div class="revision-editor__actions glass elevation-1 scroll-edge-sticky">
        <p class="editor-note">保存不会复制或修改玩家进度。</p>
        <UButton type="submit" class="pressable" label="保存版本修订" :loading="saving" :disabled="saving" />
      </div>
    </form>
  </section>
</template>

<style scoped>
.revision-editor,
.revision-form {
  display: grid;
  gap: 1rem;
  min-width: 0;
}
.revision-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.revision-editor__header h2 { margin: 0; }
.revision-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem;
}
.spatial-advanced {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--line);
  border-radius: 0.8125rem;
}
.spatial-advanced summary {
  cursor: pointer;
  font-weight: 650;
}
.spatial-input :deep(textarea) {
  min-height: 10rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.55;
}
.field-error {
  margin: 0.375rem 0 0;
  color: var(--danger);
  font-size: var(--type-caption-size);
}
.empty-note,
.editor-note {
  margin: 0;
  color: var(--quiet);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.assignment-fieldset {
  display: grid;
  gap: 0.5625rem;
  min-width: 0;
  padding: 0.875rem;
  border: 1px solid var(--line);
  border-radius: 0.8125rem;
}
.assignment-fieldset legend {
  padding-inline: 0.25rem;
  font-size: 0.875rem;
  font-weight: 680;
}
.assignment-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: 0.5625rem 1rem;
}
.revision-editor__actions {
  position: sticky;
  bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.875rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.875rem;
}
@media (max-width: 38.75rem) {
  .revision-editor__actions {
    align-items: stretch;
    flex-direction: column;
  }
  .revision-editor__actions :deep(button) { width: 100%; }
}
</style>
