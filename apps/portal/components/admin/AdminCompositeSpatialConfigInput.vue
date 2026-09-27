<script setup lang="ts">
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminCompositeStagesInput from "./AdminCompositeStagesInput.vue";
import AdminSpatialCoordinatesInput from "./AdminSpatialCoordinatesInput.vue";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

type Detection = { position: unknown[]; radius: unknown };
type StageControl = { centerPositions: unknown[]; jumpPositions: unknown[]; respawnPositions: unknown[] } | null;
type CompositeStage = SpatialConfigValue & {
  stageId: string;
  setupDetection?: Detection;
  bastionPositions: unknown[];
  control: StageControl;
  portalPositions: unknown[];
  springboardPositions: unknown[];
  resetPosition?: unknown;
  thirdPersonPosition?: unknown;
  creditsPosition?: unknown;
  endPosition?: unknown;
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
    remainingStageSelection: "random_unique" | "stage_id_cycle";
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
    composition: { selectionCount: 2, firstStageSelection: { mode: "random" }, remainingStageSelection: "random_unique" },
    stages: [emptyStage("stage-1"), emptyStage("stage-2")],
  };
}

const config = computed(() => isComposite(props.modelValue) ? props.modelValue : defaultConfig());
const stages = computed(() => config.value.stages);
const issues = computed(() => {
  const result = agentSpatialConfigSchema.safeParse(config.value);
  return result.success ? [] : result.error.issues as ValidationIssue[];
});
const routeCoordinatesValid = shallowRef(true);
const stageCoordinatesValid = shallowRef(true);

function issueMessage(issue: ValidationIssue): string {
  const path = issue.path.map(String).join(".");
  if (path === "composition.selectionCount") return "选择数量必须是 2 到 16 的整数，且不得超过阶段数量。";
  if (path.startsWith("stages.") && path.includes(".control")) return "每个阶段须恰好配置一个占领跳跃点和一个重生点；路线共用同一重生轴与阈值。";
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
  if (issue.path[0] === "control") return "复合路线必须设置一个重生轴及非负阈值。";
  return "空间配置无效。";
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
  const stageFields = new Set(["bastionPositions", "control", "portalPositions", "springboardPositions", "resetPosition", "thirdPersonPosition", "creditsPosition", "endPosition"]);
  const issue = issues.value.find((item) => item.path[0] === "stages" && item.path[1] === index && stageFields.has(String(item.path[2])));
  if (!issue) return "";
  if (issue.path[2] === "control") return issueMessage(issue);
  return "请为此阶段提供 Bastion 出生点并检查阶段专属点位与路线锚点。";
}

function commit(next: CompositeConfig) {
  emit("update:modelValue", next);
  emit("valid", agentSpatialConfigSchema.safeParse(next).success && routeCoordinatesValid.value && stageCoordinatesValid.value);
}

watch(() => props.modelValue, () => {
  emit("valid", agentSpatialConfigSchema.safeParse(config.value).success && routeCoordinatesValid.value && stageCoordinatesValid.value);
}, { immediate: true });

function updateComposite(value: SpatialConfigValue) {
  const next = value as CompositeConfig;
  emit("update:modelValue", next);
  emit("valid", agentSpatialConfigSchema.safeParse(next).success && routeCoordinatesValid.value && stageCoordinatesValid.value);
}

function updateStageCoordinatesValidity(value: boolean) {
  stageCoordinatesValid.value = value;
  emit("valid", value && routeCoordinatesValid.value && agentSpatialConfigSchema.safeParse(config.value).success);
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

function updateRouteControl(axis: unknown, threshold: unknown) {
  const respawnAxis = axis === "x" || axis === "y" || axis === "z" ? axis : null;
  const respawnAxisThreshold = coordinateInputValue(threshold);
  const control: RouteControl = respawnAxis === null ? null : { respawnAxis, respawnAxisThreshold };
  commit({ ...config.value, control });
}

function updateRouteSpatialConfig(value: SpatialConfigValue | null) {
  const spatial = value ?? { resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null };
  commit({ ...config.value, ...spatial });
}

function updateRouteCoordinateValidity(valid: boolean) {
  routeCoordinatesValid.value = valid;
  emit("valid", valid && stageCoordinatesValid.value && agentSpatialConfigSchema.safeParse(config.value).success);
}
</script>

<template>
  <div class="composite-spatial-editor">
    <section class="shared-route-fields" aria-labelledby="shared-route-heading">
      <div class="section-heading">
        <h3 id="shared-route-heading">全路线共享点位</h3>
        <p>终点、重置点、英雄环和结算点作为整条组合路线的默认值；阶段可在下方覆盖。</p>
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
        <UFormField label="占领重生轴" required>
          <USelect
            :model-value="config.control?.respawnAxis ?? ''"
            :items="[{ value: '', label: '不设置' }, { value: 'x', label: 'X 轴' }, { value: 'y', label: 'Y 轴' }, { value: 'z', label: 'Z 轴' }]"
            :disabled="disabled"
            aria-label="全路线占领重生轴"
            @update:model-value="updateRouteControl($event, config.control?.respawnAxisThreshold)"
          />
        </UFormField>
        <UFormField label="占领重生轴阈值" required>
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

    <AdminCompositeStagesInput
      :model-value="config"
      :revision-key="revisionKey"
      mode="current"
      :disabled="disabled"
      :issue-message="issueMessage"
      :stage-spatial-error="stageSpatialError"
      @update:model-value="updateComposite"
      @valid="updateStageCoordinatesValidity"
    />
  </div>
</template>

<style scoped>
.composite-spatial-editor { container-type: inline-size; }
.composite-spatial-editor,
.shared-route-fields {
  display: grid;
  gap: 0.875rem;
  min-width: 0;
}
.shared-route-fields {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
.section-heading h3,
.section-heading p { margin: 0; }
.section-heading h3 { font-size: 0.9375rem; }
.section-heading p { color: var(--muted); font-size: var(--type-caption-size); }
.route-control-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  align-items: start;
  gap: 0.75rem;
}
.field-error {
  margin: 0.375rem 0 0;
  color: var(--danger);
  font-size: var(--type-caption-size);
  line-height: 1.4;
}
</style>
