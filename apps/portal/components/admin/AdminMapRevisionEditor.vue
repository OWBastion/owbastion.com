<script setup lang="ts">
import type {
  AdminMapEditorChallengeOption,
  AdminMapEditorRevision,
  AdminMapRevisionAssignmentInput,
  AdminMapRevisionChallengeFamily,
  AdminMapRevisionLifecycle,
  AdminMapRevisionUpdateInput,
} from "~/composables/useAdminMapEditor";

const props = withDefaults(defineProps<{
  revision: AdminMapEditorRevision;
  challengeCatalog: AdminMapEditorChallengeOption[];
  saving?: boolean;
}>(), { saving: false });
const emit = defineEmits<{ save: [input: AdminMapRevisionUpdateInput] }>();

const lifecycleLabels: Record<AdminMapRevisionLifecycle, string> = { preparing: "准备中", default: "默认", selectable: "可选", historical: "历史" };
const familyLabels: Record<AdminMapRevisionChallengeFamily, string> = { map_challenge: "单图挑战", map_title_rule: "地图称号规则", title_challenge: "地图称号挑战" };
const lifecycleItems = (Object.entries(lifecycleLabels) as Array<[AdminMapRevisionLifecycle, string]>).map(([value, label]) => ({ value, label }));
const mapVariantItems = [{ value: null, label: "正式版" }, { value: "classic", label: "经典版" }];

const lifecycle = shallowRef<AdminMapRevisionLifecycle>(props.revision.lifecycle);
const gameVersion = shallowRef(props.revision.gameVersion);
const mapVariant = shallowRef<"classic" | null>(props.revision.mapVariant);
const spatialJson = shallowRef("");
const spatialError = shallowRef("");
const assignments = shallowRef<Record<string, AdminMapRevisionAssignmentInput>>({});

const assignmentKey = (family: AdminMapRevisionChallengeFamily, challengeId: string) => `${family}:${challengeId}`;
const sync = (revision: AdminMapEditorRevision) => {
  lifecycle.value = revision.lifecycle;
  gameVersion.value = revision.gameVersion;
  mapVariant.value = revision.mapVariant;
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
    <header class="section-heading">
      <div>
        <p class="eyebrow">版本修订配置</p>
        <h2 id="revision-editor-title">编辑当前边界</h2>
      </div>
      <StatusBadge :label="lifecycleLabels[revision.lifecycle]" :tone="revision.lifecycle === 'default' ? 'success' : revision.lifecycle === 'selectable' ? 'info' : 'default'" />
    </header>

    <form class="revision-form" @submit.prevent="save">
      <div class="revision-form__grid">
        <UFormField label="生命周期" hint="平台服务端会校验可用的状态转换。">
          <USelect v-model="lifecycle" :items="lifecycleItems" :disabled="saving" />
        </UFormField>
        <UFormField label="游戏版本" required>
          <UInput v-model="gameVersion" :disabled="saving" required />
        </UFormField>
        <UFormField label="地图变体" hint="默认 revision 必须使用正式版。">
          <USelect v-model="mapVariant" :items="mapVariantItems" :disabled="saving" />
        </UFormField>
      </div>

      <UFormField label="空间配置" hint="使用平台 contract 的 JSON 表示；具体字段、坐标和引用由服务端统一校验。">
        <UTextarea v-model="spatialJson" :rows="12" class="spatial-input" :disabled="saving" spellcheck="false" aria-label="空间配置 JSON" />
        <p v-if="spatialError" class="field-error" role="alert">{{ spatialError }}</p>
      </UFormField>

      <fieldset class="assignment-fieldset">
        <legend>版本修订范围的挑战分配</legend>
        <p class="field-hint">只选择此版本修订应适用的既有定义；Portal 不复制挑战规则或实现自己的引用校验。</p>
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

      <div class="revision-editor__actions">
        <p class="editor-note">保存只更新版本修订配置、空间数据和挑战适用性，不会复制或修改玩家进度。</p>
        <UButton type="submit" label="保存版本修订" :loading="saving" :disabled="saving" />
      </div>
    </form>
  </section>
</template>

<style scoped>
.revision-editor { display: grid; gap: 16px; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.section-heading h2 { margin: 0; font-size: 1.35rem; letter-spacing: -.02em; }
.section-heading .eyebrow { margin: 0 0 5px; }
.revision-form { display: grid; gap: 16px; }
.revision-form__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.spatial-input :deep(textarea) { min-height: 13rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem; line-height: 1.55; }
.field-hint, .editor-note, .empty-note { margin: 5px 0 0; color: var(--quiet); font-size: var(--type-caption-size); line-height: 1.5; }
.field-error { margin: 6px 0 0; color: var(--danger); font-size: var(--type-caption-size); }
.assignment-fieldset { display: grid; gap: 9px; min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 13px; }
.assignment-fieldset legend { padding-inline: 4px; font-size: .86rem; font-weight: 680; }
.assignment-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 16px; }
.revision-editor__actions { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 4px; border-top: 1px solid var(--line); }
.editor-note { margin: 0; max-width: 42rem; }
@media (max-width: 760px) { .revision-form__grid, .assignment-list { grid-template-columns: 1fr; } .revision-editor__actions { align-items: stretch; flex-direction: column; } .revision-editor__actions :deep(button) { width: 100%; } }
</style>
