<script setup lang="ts">
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminCompositeStagesInput from "./AdminCompositeStagesInput.vue";
import AdminSpatialCoordinatesInput from "./AdminSpatialCoordinatesInput.vue";
import { createEmptyCompositeConfig, isCompositeForMode, type CompositeConfig, type ValidationIssue } from "~/utils/composite-spatial-config";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";
import { spatialNumberInput, spatialTextInput } from "~/utils/spatial-config-input";

const props = withDefaults(defineProps<{
  modelValue: SpatialConfigValue;
  revisionKey: string;
  disabled?: boolean;
  mode?: "legacy" | "current";
}>(), { disabled: false, mode: "current" });

const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue];
  valid: [value: boolean];
}>();

const config = computed(() => isCompositeForMode(props.modelValue, props.mode) ? props.modelValue : createEmptyCompositeConfig(props.mode));
const stages = computed(() => config.value.stages);
const issues = computed(() => {
  const result = agentSpatialConfigSchema.safeParse(config.value);
  return result.success ? [] : result.error.issues as ValidationIssue[];
});
const routeCoordinatesValid = shallowRef(true);
const stageCoordinatesValid = shallowRef(true);
const configIsValid = (value: unknown) => agentSpatialConfigSchema.safeParse(value).success && stageCoordinatesValid.value && (props.mode === "legacy" || routeCoordinatesValid.value);

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
  if (props.mode === "legacy") return "空间配置无效。";
  if (path.startsWith("stages.") && path.includes(".control")) return "每个阶段须恰好配置一个占领跳跃点和一个重生点；路线共用同一重生轴与阈值。";
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
  if (props.mode === "legacy") {
    const hasInvalidSpatialField = issues.value.some((issue) => issue.path[0] === "stages" && issue.path[1] === index && [
      "bastionPositions", "resetPosition", "endPosition", "thirdPersonPosition", "creditsPosition", "control", "portalPositions", "springboardPositions",
    ].includes(String(issue.path[2])));
    return hasInvalidSpatialField ? "请粘贴此阶段完整的 Raw Workshop 点位代码。" : "";
  }
  const stageFields = new Set(["bastionPositions", "control", "portalPositions", "springboardPositions", "resetPosition", "thirdPersonPosition", "creditsPosition", "endPosition"]);
  const issue = issues.value.find((item) => item.path[0] === "stages" && item.path[1] === index && stageFields.has(String(item.path[2])));
  if (!issue) return "";
  if (issue.path[2] === "control") return issueMessage(issue);
  return "请为此阶段提供 Bastion 出生点并检查阶段专属点位与路线锚点。";
}

function commit(next: CompositeConfig) {
  emit("update:modelValue", next);
  emit("valid", configIsValid(next));
}

watch(() => props.modelValue, () => {
  emit("valid", configIsValid(config.value));
}, { immediate: true });

function updateComposite(value: SpatialConfigValue) {
  const next = value as CompositeConfig;
  emit("update:modelValue", next);
  emit("valid", configIsValid(next));
}

function updateStageCoordinatesValidity(value: boolean) {
  stageCoordinatesValid.value = value;
  emit("valid", configIsValid(config.value));
}

function updateRouteControl(axis: unknown, threshold: unknown) {
  const respawnAxis = axis === "x" || axis === "y" || axis === "z" ? axis : null;
  const respawnAxisThreshold = spatialNumberInput(threshold);
  const control: CompositeConfig["control"] = respawnAxis === null ? null : { respawnAxis, respawnAxisThreshold };
  commit({ ...config.value, control });
}

function updateRouteSpatialConfig(value: SpatialConfigValue | null) {
  const spatial = value ?? { resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null };
  commit({ ...config.value, ...spatial });
}

function updateRouteCoordinateValidity(valid: boolean) {
  routeCoordinatesValid.value = valid;
  emit("valid", configIsValid(config.value));
}
</script>

<template>
  <div class="composite-spatial-editor">
    <section v-if="mode === 'current'" class="shared-route-fields" aria-labelledby="shared-route-heading">
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
            :model-value="spatialTextInput(config.control?.respawnAxisThreshold)"
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
      :mode="mode"
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
</style>
