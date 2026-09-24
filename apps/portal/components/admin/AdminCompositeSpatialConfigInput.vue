<script setup lang="ts">
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminSpatialCoordinatesInput from "./AdminSpatialCoordinatesInput.vue";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

type Detection = { position: unknown[]; radius: unknown };
type StageControl = { centerPositions: unknown[]; jumpPositions: unknown[]; respawnPositions: unknown[] } | null;
type CompositeStage = {
  stageId: string;
  setupDetection?: Detection;
  bastionPositions: unknown[];
  control: StageControl;
  portalPositions: unknown[];
  springboardPositions: unknown[];
};
type RouteControl = { respawnAxis: "x" | "y" | "z" | null; respawnAxisThreshold: number | null } | null;
type CompositeConfig = SpatialConfigValue & {
  resetPosition: unknown;
  endPosition: unknown;
  thirdPersonPosition: unknown;
  creditsPosition: unknown;
  control: RouteControl;
  composition: {
    selectionCount: number;
    firstStageSelection: { mode: "random" } | { mode: "setup_detection"; fallbackStageId: string };
    remainingStageSelection: "random_unique";
  };
  stages: CompositeStage[];
};
type ValidationIssue = { path: PropertyKey[]; message: string };

const props = withDefaults(defineProps<{
  modelValue: SpatialConfigValue;
  revisionKey: string;
  disabled?: boolean;
}>(), { disabled: false });

const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue];
  valid: [value: boolean];
}>();

const isComposite = (value: SpatialConfigValue): value is CompositeConfig =>
  Array.isArray(value.stages) && Boolean(value.composition && typeof value.composition === "object") && "endPosition" in value;

function emptyStage(stageId: string): CompositeStage {
  return { stageId, bastionPositions: [], control: null, portalPositions: [], springboardPositions: [] };
}

function defaultConfig(): CompositeConfig {
  return {
    resetPosition: null,
    endPosition: null,
    thirdPersonPosition: null,
    creditsPosition: null,
    control: null,
    composition: {
      selectionCount: 2,
      firstStageSelection: { mode: "random" },
      remainingStageSelection: "random_unique",
    },
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

const allCoordinatesValid = computed(() =>
  coordinateValidity.value.route !== false && stages.value.every((stage, index) => coordinateValidity.value[stageKey(index, stage)] !== false),
);

function issueMessage(issue: ValidationIssue): string {
  const path = issue.path.map(String).join(".");
  if (path === "composition.selectionCount") return "选择数量必须是 2 到 16 的整数，且不得超过阶段数量。";
  if (path === "composition.firstStageSelection.fallbackStageId") return "请选择一个已存在的回退阶段。";
  if (path.endsWith(".stageId")) return issue.message === "Duplicate composite spatial stage" ? "阶段 ID 重复。" : "阶段 ID 格式无效。";
  if (path.endsWith(".setupDetection.position")) return "请输入三个有效的检测坐标。";
  if (path.endsWith(".setupDetection.radius")) return "检测半径必须大于 0。";
  if (path.endsWith(".setupDetection")) {
    const index = Number(path.split(".")[1]);
    const stage = stages.value[index];
    const selection = config.value.composition.firstStageSelection;
    if (selection.mode === "setup_detection" && stage?.stageId === selection.fallbackStageId) return "回退阶段不能设置初始阶段检测。";
    if (selection.mode === "random") return "随机选择首阶段时不能设置初始阶段检测。";
    return "此阶段需要设置检测位置和正半径。";
  }
  if (path.endsWith(".control.jumpPositions") || path.endsWith(".control.respawnPositions")) return "每阶段的阶段间传送点与占领重生点须成对配置，且最多一对。";
  if (["resetPosition", "endPosition", "thirdPersonPosition", "creditsPosition"].includes(String(issue.path[0]))) return "请在全路线点位中提供此坐标。";
  if (issue.path[0] === "control") return "重生轴与阈值必须成对设置，且阶段中需要有占领重生点。";
  return "空间配置无效。";
}

function fieldError(...path: Array<string | number>) {
  const issue = issues.value.find((item) => item.path.length === path.length && item.path.every((part, index) => part === path[index]));
  return issue ? issueMessage(issue) : "";
}

function routeSpatialError() {
  const routeFields = new Set(["resetPosition", "endPosition", "thirdPersonPosition", "creditsPosition"]);
  return issues.value.some((issue) => routeFields.has(String(issue.path[0]))) ? "请检查全路线共享点位。" : "";
}

function routeControlError() {
  const issue = issues.value.find((item) => item.path[0] === "control");
  return issue ? issueMessage(issue) : "";
}

function stageSpatialError(index: number) {
  const stageFields = new Set(["bastionPositions", "control", "portalPositions", "springboardPositions"]);
  const issue = issues.value.find((item) => item.path[0] === "stages" && item.path[1] === index && stageFields.has(String(item.path[2])));
  if (!issue) return "";
  if (issue.path[2] === "control" && (issue.path[3] === "jumpPositions" || issue.path[3] === "respawnPositions")) return issueMessage(issue);
  return "请为此阶段提供 Bastion 出生点并检查阶段专属点位。";
}

function nestedFieldError(...path: Array<string | number>) {
  const issue = issues.value.find((item) => path.every((part, index) => item.path[index] === part));
  return issue ? issueMessage(issue) : "";
}

function commit(next: CompositeConfig) {
  const valid = agentSpatialConfigSchema.safeParse(next).success && allCoordinatesValid.value;
  emit("update:modelValue", next);
  emit("valid", valid);
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

function setFirstStageMode(value: "random" | "setup_detection") {
  let firstStageSelection: CompositeConfig["composition"]["firstStageSelection"];
  let nextStages = stages.value;
  if (value === "setup_detection") {
    firstStageSelection = { mode: value, fallbackStageId: stages.value[0]?.stageId ?? "" };
    nextStages = stages.value.map((stage, index) => index === 0 ? withoutDetection(stage) : stage);
  } else {
    firstStageSelection = { mode: value };
    nextStages = stages.value.map(withoutDetection);
  }
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

function updateRouteControl(axis: unknown, threshold: unknown) {
  const respawnAxis = axis === "x" || axis === "y" || axis === "z" ? axis : null;
  const respawnAxisThreshold = coordinateInputValue(threshold);
  const control: RouteControl = respawnAxis === null ? null : { respawnAxis, respawnAxisThreshold };
  commit({ ...config.value, control });
}

function updateStage(index: number, stage: CompositeStage) {
  const nextStages = [...stages.value];
  nextStages[index] = stage;
  commit({ ...config.value, stages: nextStages });
}

function updateRouteSpatialConfig(value: SpatialConfigValue | null) {
  const spatial = value ?? { resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null };
  commit({ ...config.value, ...spatial });
}

function updateStageSpatialConfig(index: number, value: SpatialConfigValue | null) {
  const currentStage = stages.value[index];
  if (!currentStage) return;
  const spatial = value ?? { bastionPositions: [], control: null, portalPositions: [], springboardPositions: [] };
  delete spatial.alternateStages;
  delete spatial.setupDetection;
  updateStage(index, { ...currentStage, ...spatial } as CompositeStage);
}

function updateRouteCoordinateValidity(valid: boolean) {
  coordinateValidity.value = { ...coordinateValidity.value, route: valid };
  emit("valid", agentSpatialConfigSchema.safeParse(config.value).success && allCoordinatesValid.value);
}

function updateStageCoordinateValidity(index: number, stage: CompositeStage, valid: boolean) {
  coordinateValidity.value = { ...coordinateValidity.value, [stageKey(index, stage)]: valid };
  emit("valid", agentSpatialConfigSchema.safeParse(config.value).success && allCoordinatesValid.value);
}
</script>

<template>
  <div class="composite-spatial-editor">
    <section class="shared-route-fields" aria-labelledby="shared-route-heading">
      <div class="section-heading">
        <h3 id="shared-route-heading">全路线共享点位</h3>
        <p>终点、重置点、英雄环和结算点只配置一次，由整条组合路线共用。</p>
      </div>
      <AdminSpatialCoordinatesInput
        :model-value="config"
        :revision-key="revisionKey + ':route'"
        scope="composite-route"
        :disabled="disabled"
        @update:model-value="updateRouteSpatialConfig"
        @valid="updateRouteCoordinateValidity"
      />
      <p v-if="routeSpatialError()" class="field-error" role="alert">{{ routeSpatialError() }}</p>
      <div class="route-control-fields">
        <UFormField label="占领重生轴">
          <USelect
            :model-value="config.control?.respawnAxis ?? ''"
            :items="[{ value: '', label: '不设置' }, { value: 'x', label: 'X 轴' }, { value: 'y', label: 'Y 轴' }, { value: 'z', label: 'Z 轴' }]"
            :disabled="disabled"
            aria-label="全路线占领重生轴"
            @update:model-value="updateRouteControl($event, config.control?.respawnAxisThreshold)"
          />
        </UFormField>
        <UFormField label="占领重生轴阈值">
          <UInput
            :model-value="detectionInputValue(config.control?.respawnAxisThreshold)"
            type="number"
            min="0"
            step="any"
            :disabled="disabled || !config.control?.respawnAxis"
            aria-label="全路线占领重生轴阈值"
            @update:model-value="updateRouteControl(config.control?.respawnAxis ?? '', $event)"
          />
        </UFormField>
      </div>
      <p v-if="routeControlError()" class="field-error" role="alert">{{ routeControlError() }}</p>
    </section>

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
      <UFormField label="后续阶段选择">
        <p class="fixed-selection">随机选择且不重复</p>
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
          scope="composite-stage"
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
.composite-spatial-editor,
.shared-route-fields,
.composition-fields,
.stage-list,
.stage-editor {
  display: grid;
  gap: 0.875rem;
  min-width: 0;
}
.shared-route-fields {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.8125rem;
}
.section-heading h3,
.section-heading p { margin: 0; }
.section-heading h3 { font-size: 0.9375rem; }
.section-heading p { color: var(--muted); font-size: var(--type-caption-size); }
.route-control-fields,
.composition-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  align-items: start;
  gap: 0.75rem;
}
.stage-list { gap: 1rem; }
.stage-editor {
  padding: 0.875rem;
  border: 1px solid var(--line);
  border-radius: 0.8125rem;
}
.stage-editor__legend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 0.25rem;
  font-size: 0.9375rem;
  font-weight: 680;
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
.field-error {
  margin: 0.375rem 0 0;
  color: var(--danger);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}
@media (max-width: 38.75rem) {
  .stage-editor__fields { grid-template-columns: minmax(0, 1fr); }
  .stage-editor__fields :deep(button) { justify-self: start; min-height: 2.75rem; }
}
</style>
