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
const emit = defineEmits<{
  save: [input: AdminMapRevisionUpdateInput];
  promote: [replacedDefaultLifecycle: AdminMapRevisionReplacementLifecycle | null];
}>();

const lifecycleLabels: Record<AdminMapRevisionLifecycle, string> = { preparing: "准备中", default: "默认", selectable: "可选", historical: "历史" };
const familyLabels: Record<AdminMapRevisionChallengeFamily, string> = { map_challenge: "地图挑战", map_title_rule: "地图称号规则", title_challenge: "称号挑战" };
const lifecycleItems = computed(() => (Object.entries(lifecycleLabels) as Array<[AdminMapRevisionLifecycle, string]>)
  .filter(([value]) => props.revision.lifecycle === "default" ? value === "default" : value !== "default")
  .map(([value, label]) => ({ value, label })));
const mapVariantItems = [{ value: null, label: "正式版" }, { value: "classic", label: "经典版" }];
const replacementLifecycleItems = [{ value: "selectable", label: "保留为可选版本" }, { value: "historical", label: "归档为历史版本" }];

const lifecycle = shallowRef<AdminMapRevisionLifecycle>(props.revision.lifecycle);
const replacedDefaultLifecycle = shallowRef<AdminMapRevisionReplacementLifecycle>("selectable");
const mapVariant = shallowRef<"classic" | null>(props.revision.mapVariant);
const mode = shallowRef(props.revision.mode ?? "");
const gameVersion = shallowRef(props.revision.gameVersion);
const spatialConfig = shallowRef<Record<string, unknown> | null>(props.revision.spatialConfig);
const spatialInputValid = shallowRef(true);
const assignments = shallowRef<Record<string, AdminMapRevisionAssignmentInput>>({});

const assignmentKey = (family: AdminMapRevisionChallengeFamily, challengeId: string) => `${family}:${challengeId}`;
const sync = (revision: AdminMapEditorRevision) => {
  lifecycle.value = revision.lifecycle;
  replacedDefaultLifecycle.value = "selectable";
  mapVariant.value = revision.mapVariant;
  mode.value = revision.mode ?? "";
  gameVersion.value = revision.gameVersion;
  spatialConfig.value = revision.spatialConfig;
  spatialInputValid.value = true;
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

const canPromote = computed(() => ["preparing", "selectable"].includes(props.revision.lifecycle));

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

function save() {
  if (!spatialInputValid.value) return;
  emit("save", {
    contractVersion: "1",
    lifecycle: lifecycle.value,
    gameVersion: gameVersion.value.trim(),
    mapVariant: mapVariant.value,
    mode: mode.value.trim() || null,
    spatialConfig: spatialConfig.value,
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
        <UFormField label="独立模式" hint="填写截图右上角的模式名（如 2026镜中回响），该模式的通关会记到这个可选版本；常规模式留空。">
          <UInput v-model="mode" :disabled="saving" />
        </UFormField>
      </div>

      <fieldset class="assignment-fieldset">
        <legend>当前修订的挑战分配</legend>
        <p class="assignment-note">在这里决定哪些挑战和称号规则应用于此 Gameplay Revision。规则定义和地图级覆盖仍由各自的规则页面维护。</p>
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

      <details class="spatial-advanced" open>
        <summary>空间配置</summary>
        <AdminSpatialConfigInput
          :model-value="spatialConfig"
          :revision-key="revision.revisionId"
          :disabled="saving"
          @update:model-value="spatialConfig = $event"
          @valid="spatialInputValid = $event"
        />
      </details>

      <div class="revision-editor__actions glass elevation-1 scroll-edge-sticky">
        <div class="editor-note">
          <p>保存不会复制或修改玩家进度。切换默认 Revision 必须执行单独的晋升操作。</p>
          <p v-if="canPromote">晋升后新 Revision 将成为当前资格、精通度和地图评价范围；原默认 Revision 的历史挑战、完成、称号、运行记录和证据会保留。</p>
        </div>
        <div class="editor-actions">
          <UButton type="submit" class="pressable" label="保存版本修订" :loading="saving" :disabled="saving" />
          <UFormField v-if="canPromote && replacedDefaultRevision" label="原默认 Revision 处理">
            <USelect v-model="replacedDefaultLifecycle" :items="replacementLifecycleItems" :disabled="saving" />
          </UFormField>
          <UButton
            v-if="canPromote"
            type="button"
            color="primary"
            label="确认晋升为默认 Revision"
            :loading="saving"
            :disabled="saving"
            @click="emit('promote', replacedDefaultRevision ? replacedDefaultLifecycle : null)"
          />
        </div>
      </div>
    </form>
  </section>
</template>

<style scoped>
.revision-editor { container-type: inline-size; }
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
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.spatial-advanced summary {
  cursor: pointer;
  font-weight: 600;
}
.empty-note,
.editor-note {
  margin: 0;
  color: var(--quiet);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
.editor-note p { margin: 0; }
.editor-note p + p { margin-top: 0.4rem; }
.assignment-fieldset {
  display: grid;
  gap: 0.5625rem;
  min-width: 0;
  padding: 0.875rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.assignment-note { margin: 0 0 0.75rem; color: var(--muted); font-size: 0.875rem; line-height: 1.5; }
.assignment-fieldset legend {
  padding-inline: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
}
.assignment-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: 0.5625rem 1rem;
}
.revision-editor__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.875rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.editor-actions { display: flex; align-items: end; flex-wrap: wrap; gap: 0.75rem; }
@container (max-width: 23.99rem) {
  .revision-editor__actions {
    align-items: stretch;
    flex-direction: column;
  }
  .revision-editor__actions :deep(button) { width: 100%; min-height: 2.75rem; }
  .editor-actions { flex-direction: column; align-items: stretch; }
}
</style>
