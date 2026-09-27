<script setup lang="ts">
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminSpatialCoordinatesInput from "./AdminSpatialCoordinatesInput.vue";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

type Detection = { position: unknown[]; radius: unknown };
type CompositeStage = Record<string, unknown> & { stageId: string; setupDetection?: Detection };
type CompositeConfig = SpatialConfigValue & {
  composition: {
    selectionCount: number;
    firstStageSelection: { mode: "random" } | { mode: "setup_detection"; fallbackStageId: string };
    remainingStageSelection: string;
  };
  stages: CompositeStage[];
};
type ValidationIssue = { path: PropertyKey[]; message: string };

const props = withDefaults(defineProps<{
  modelValue: SpatialConfigValue;
  revisionKey: string;
  disabled?: boolean;
  mode: "legacy" | "current";
  issueMessage: (issue: ValidationIssue) => string;
  stageSpatialError: (index: number) => string;
}>(), { disabled: false });

const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue];
  valid: [value: boolean];
}>();

const isComposite = (value: SpatialConfigValue): value is CompositeConfig =>
  Array.isArray(value.stages) && Boolean(value.composition && typeof value.composition === "object") && (props.mode === "legacy" || "endPosition" in value);

function emptyStage(stageId: string): CompositeStage {
  return props.mode === "legacy"
    ? { stageId, bastionPositions: [], resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null, portalPositions: [], springboardPositions: [] }
    : { stageId, bastionPositions: [], control: null, portalPositions: [], springboardPositions: [] };
}

function defaultConfig(): CompositeConfig {
  const route = props.mode === "current" ? { resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null } : {};
  return {
    ...route,
    composition: { selectionCount: 2, firstStageSelection: { mode: "random" }, remainingStageSelection: "random_unique" },
    stages: [emptyStage("stage-1"), emptyStage("stage-2")],
  };
}

const config = computed(() => isComposite(props.modelValue) ? props.modelValue : defaultConfig());
const stages = computed(() => config.value.stages);
const fallbackStageItems = computed(() => stages.value.map((stage) => ({ value: stage.stageId, label: stage.stageId || "未命名阶段" })));
const issues = computed(() => {
  const result = agentSpatialConfigSchema.safeParse(config.value);
  return result.success ? [] : result.error.issues as ValidationIssue[];
});
const coordinateValidity = shallowRef<Record<string, boolean>>({});

function stageKey(index: number, stage: CompositeStage) {
  return index + ":" + stage.stageId;
}

const allCoordinatesValid = computed(() => stages.value.every((stage, index) => coordinateValidity.value[stageKey(index, stage)] !== false));

function fieldError(...path: Array<string | number>) {
  const issue = issues.value.find((item) => item.path.length === path.length && item.path.every((part, index) => part === path[index]));
  return issue ? props.issueMessage(issue) : "";
}

function nestedFieldError(...path: Array<string | number>) {
  const issue = issues.value.find((item) => path.every((part, index) => item.path[index] === part));
  return issue ? props.issueMessage(issue) : "";
}

function commit(next: CompositeConfig) {
  emit("update:modelValue", next);
  emit("valid", agentSpatialConfigSchema.safeParse(next).success && allCoordinatesValid.value);
}

watch(() => props.modelValue, () => {
  emit("valid", agentSpatialConfigSchema.safeParse(config.value).success && allCoordinatesValid.value);
}, { immediate: true });

function updateComposition(patch: Partial<CompositeConfig["composition"]>) {
  commit({ ...config.value, composition: { ...config.value.composition, ...patch } });
}

function withoutDetection(stage: CompositeStage): CompositeStage {
  const next = { ...stage };
  delete next.setupDetection;
  return next;
}

function updateSelectionCount(value: string | number) {
  updateComposition({ selectionCount: value === "" ? 0 : Number(value) });
}

function setRemainingStageSelection(value: "random_unique" | "stage_id_cycle") {
  updateComposition({ remainingStageSelection: value });
}

function setFirstStageMode(value: "random" | "setup_detection") {
  const firstStageSelection = value === "setup_detection"
    ? { mode: value, fallbackStageId: stages.value[0]?.stageId ?? "" }
    : { mode: value };
  const nextStages = value === "setup_detection"
    ? stages.value.map((stage, index) => index === 0 ? withoutDetection(stage) : stage)
    : stages.value.map(withoutDetection);
  commit({ ...config.value, composition: { ...config.value.composition, firstStageSelection }, stages: nextStages });
}

function setFallbackStage(stageId: string) {
  const firstStageSelection = { mode: "setup_detection" as const, fallbackStageId: stageId };
  const nextStages = stages.value.map((stage) => stage.stageId === stageId ? withoutDetection(stage) : stage);
  commit({ ...config.value, composition: { ...config.value.composition, firstStageSelection }, stages: nextStages });
}

function setStageId(index: number, stageId: string) {
  const previousId = stages.value[index]?.stageId;
  const nextStages = [...stages.value];
  nextStages[index] = { ...nextStages[index]!, stageId };
  let composition = config.value.composition;
  const selection = composition.firstStageSelection;
  if (selection.mode === "setup_detection" && selection.fallbackStageId === previousId) {
    composition = { ...composition, firstStageSelection: { ...selection, fallbackStageId: stageId } };
  }
  commit({ ...config.value, composition, stages: nextStages });
}

function nextStageId() {
  const ids = new Set(stages.value.map((stage) => stage.stageId));
  let number = 1;
  while (ids.has("stage-" + number)) number += 1;
  return "stage-" + number;
}

function addStage() {
  if (stages.value.length >= 16) return;
  commit({ ...config.value, stages: [...stages.value, emptyStage(nextStageId())] });
}

function removeStage(index: number) {
  if (stages.value.length <= 2) return;
  const removed = stages.value[index];
  let nextStages = stages.value.filter((_stage, stageIndex) => stageIndex !== index);
  const selection = config.value.composition.firstStageSelection;
  let composition = config.value.composition;
  if (selection.mode === "setup_detection" && selection.fallbackStageId === removed?.stageId) {
    composition = { ...composition, firstStageSelection: { mode: "setup_detection", fallbackStageId: nextStages[0]?.stageId ?? "" } };
    nextStages = nextStages.map((stage, stageIndex) => stageIndex === 0 ? withoutDetection(stage) : stage);
  }
  commit({ ...config.value, composition, stages: nextStages });
}

function coordinateInputValue(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function detectionInputValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function updateDetectionPosition(index: number, axis: number, value: unknown) {
  const stage = stages.value[index];
  if (!stage) return;
  const detection = stage.setupDetection ?? { position: [null, null, null], radius: null };
  const position = [...detection.position];
  position[axis] = coordinateInputValue(value);
  updateStage(index, { ...stage, setupDetection: { ...detection, position } });
}

function updateDetectionRadius(index: number, value: unknown) {
  const stage = stages.value[index];
  if (!stage) return;
  const detection = stage.setupDetection ?? { position: [null, null, null], radius: null };
  updateStage(index, { ...stage, setupDetection: { ...detection, radius: coordinateInputValue(value) } });
}

function updateStage(index: number, stage: CompositeStage) {
  const nextStages = [...stages.value];
  nextStages[index] = stage;
  commit({ ...config.value, stages: nextStages });
}

function updateStageSpatialConfig(index: number, value: SpatialConfigValue | null) {
  const currentStage = stages.value[index];
  if (!currentStage) return;
  const spatial: Record<string, unknown> = value ? { ...value } : props.mode === "legacy"
    ? { bastionPositions: [], resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null, portalPositions: [], springboardPositions: [] }
    : { bastionPositions: [], control: null, portalPositions: [], springboardPositions: [] };
  delete spatial.alternateStages;
  delete spatial.setupDetection;
  if (props.mode === "legacy") {
    updateStage(index, { ...currentStage, ...spatial });
    return;
  }
  const { resetPosition: _reset, thirdPersonPosition: _thirdPerson, creditsPosition: _credits, endPosition: _end, ...stageWithoutAnchors } = currentStage;
  updateStage(index, { ...stageWithoutAnchors, ...spatial });
}

function updateStageCoordinateValidity(index: number, stage: CompositeStage, valid: boolean) {
  const key = stageKey(index, stage);
  coordinateValidity.value = { ...coordinateValidity.value, [key]: valid };
  emit("valid", agentSpatialConfigSchema.safeParse(config.value).success && allCoordinatesValid.value);
}
</script>

<template>
  <div class="composite-spatial-editor">
    <div class="composition-fields">
      <UFormField label="选择数量" required>
        <UInput
          :model-value="config.composition.selectionCount"
          type="number"
          min="2"
          max="16"
          :disabled="disabled"
          aria-label="阶段选择数量"
          @update:model-value="updateSelectionCount"
        />
        <p v-if="fieldError('composition', 'selectionCount')" class="field-error" role="alert">{{ fieldError('composition', 'selectionCount') }}</p>
      </UFormField>
      <UFormField label="首阶段选择" required>
        <USelect
          :model-value="config.composition.firstStageSelection.mode"
          :items="[{ value: 'setup_detection', label: '检测地图初始阶段' }, { value: 'random', label: '随机选择' }]"
          :disabled="disabled"
          aria-label="首阶段选择"
          @update:model-value="setFirstStageMode($event as 'random' | 'setup_detection')"
        />
      </UFormField>
      <UFormField v-if="config.composition.firstStageSelection.mode === 'setup_detection'" label="回退阶段" required>
        <USelect
          :model-value="config.composition.firstStageSelection.fallbackStageId"
          :items="fallbackStageItems"
          :disabled="disabled"
          aria-label="回退阶段"
          @update:model-value="setFallbackStage(String($event))"
        />
        <p v-if="fieldError('composition', 'firstStageSelection', 'fallbackStageId')" class="field-error" role="alert">{{ fieldError('composition', 'firstStageSelection', 'fallbackStageId') }}</p>
      </UFormField>
      <UFormField label="后续阶段选择" :required="mode === 'current'">
        <USelect
          v-if="mode === 'current'"
          :model-value="config.composition.remainingStageSelection"
          :items="[{ value: 'random_unique', label: '随机选择且不重复' }, { value: 'stage_id_cycle', label: '按阶段 ID 升序循环' }]"
          :disabled="disabled"
          aria-label="后续阶段选择"
          @update:model-value="setRemainingStageSelection($event as 'random_unique' | 'stage_id_cycle')"
        />
        <p v-else class="fixed-selection">随机选择且不重复</p>
        <p v-if="config.composition.remainingStageSelection === 'stage_id_cycle'" class="field-hint">阶段按 ID 升序衔接，最后一个阶段会回到第一个。</p>
      </UFormField>
    </div>

    <div class="stage-list" aria-label="原子阶段">
      <fieldset v-for="(stage, index) in stages" :key="stageKey(index, stage)" class="stage-editor">
        <legend class="stage-editor__legend">
          <span>{{ stage.stageId || '未命名阶段' }}</span>
          <UBadge v-if="config.composition.firstStageSelection.mode === 'setup_detection' && config.composition.firstStageSelection.fallbackStageId === stage.stageId" color="info" variant="subtle" label="回退阶段" />
        </legend>
        <div class="stage-editor__fields">
          <UFormField :label="'阶段 ID · ' + (stage.stageId || index + 1)" required>
            <UInput
              :model-value="stage.stageId"
              :disabled="disabled"
              :aria-label="'阶段 ID ' + (stage.stageId || index + 1)"
              @update:model-value="setStageId(index, String($event))"
            />
            <p v-if="fieldError('stages', index, 'stageId')" class="field-error" role="alert">{{ fieldError('stages', index, 'stageId') }}</p>
          </UFormField>
          <UButton color="neutral" variant="outline" label="移除阶段" :disabled="disabled || stages.length <= 2" @click="removeStage(index)" />
        </div>

        <div v-if="config.composition.firstStageSelection.mode === 'setup_detection' && config.composition.firstStageSelection.fallbackStageId !== stage.stageId" class="detection-editor">
          <h4>初始阶段检测</h4>
          <p v-if="fieldError('stages', index, 'setupDetection')" class="field-error" role="alert">{{ fieldError('stages', index, 'setupDetection') }}</p>
          <UFormField label="检测位置" required>
            <div class="detection-position" role="group" :aria-label="stage.stageId + ' 检测位置'">
              <UInput v-for="(axis, axisIndex) in ['X', 'Y', 'Z']" :key="axis" type="number" step="any" :model-value="detectionInputValue(stage.setupDetection?.position?.[axisIndex])" :disabled="disabled" :aria-label="stage.stageId + ' 检测位置 ' + axis" @update:model-value="updateDetectionPosition(index, axisIndex, $event)" />
            </div>
            <p v-if="nestedFieldError('stages', index, 'setupDetection', 'position')" class="field-error" role="alert">{{ nestedFieldError('stages', index, 'setupDetection', 'position') }}</p>
          </UFormField>
          <UFormField label="检测半径" required>
            <UInput type="number" min="0" step="any" :model-value="detectionInputValue(stage.setupDetection?.radius)" :disabled="disabled" :aria-label="stage.stageId + ' 检测半径'" @update:model-value="updateDetectionRadius(index, $event)" />
            <p v-if="nestedFieldError('stages', index, 'setupDetection', 'radius')" class="field-error" role="alert">{{ nestedFieldError('stages', index, 'setupDetection', 'radius') }}</p>
          </UFormField>
        </div>

        <AdminSpatialCoordinatesInput
          :model-value="stage"
          :revision-key="revisionKey + ':' + stageKey(index, stage)"
          :scope="mode === 'current' ? 'composite-stage' : undefined"
          :disabled="disabled"
          @update:model-value="updateStageSpatialConfig(index, $event)"
          @valid="updateStageCoordinateValidity(index, stage, $event)"
        />
        <p v-if="stageSpatialError(index)" class="field-error" role="alert">{{ stageSpatialError(index) }}</p>
      </fieldset>
    </div>

    <UButton v-if="stages.length < 16" color="neutral" variant="outline" label="添加阶段" :disabled="disabled" @click="addStage" />
  </div>
</template>

<style scoped>
.composite-spatial-editor { container-type: inline-size; }
.composite-spatial-editor,
.composition-fields,
.stage-list,
.stage-editor {
  display: grid;
  gap: 0.875rem;
  min-width: 0;
}
.composition-fields {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  align-items: start;
}
.stage-list { gap: 1rem; }
.stage-editor {
  padding: 0.875rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.stage-editor__legend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 0.25rem;
  font-size: 0.9375rem;
  font-weight: 600;
}
.stage-editor__fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.75rem;
}
.detection-editor {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  padding-block: 0.75rem;
  border-block: 1px solid var(--line);
}
.detection-editor h4 { margin: 0; font-size: 0.875rem; }
.detection-position {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}
.fixed-selection {
  margin: 0;
  min-height: 2.5rem;
  display: flex;
  align-items: center;
}
.field-hint {
  margin: 0;
  font-size: var(--type-caption-size);
  line-height: 1.5;
  color: var(--quiet);
}
.field-error {
  margin: 0.375rem 0 0;
  color: var(--danger);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}
@container (max-width: 23.99rem) {
  .stage-editor__fields { grid-template-columns: minmax(0, 1fr); }
  .stage-editor__fields :deep(button) { justify-self: start; min-height: 2.75rem; }
}
</style>
