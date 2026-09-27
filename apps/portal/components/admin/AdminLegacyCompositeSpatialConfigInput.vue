<script setup lang="ts">
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminCompositeStagesInput from "./AdminCompositeStagesInput.vue";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

type CompositeStage = SpatialConfigValue & { stageId: string; setupDetection?: { position: unknown[]; radius: unknown } };
type CompositeConfig = {
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
  Array.isArray(value.stages) && Boolean(value.composition && typeof value.composition === "object");

function emptyStage(stageId: string): CompositeStage {
  return { stageId, bastionPositions: [], resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null, portalPositions: [], springboardPositions: [] };
}

function defaultConfig(): CompositeConfig {
  return {
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
const stageCoordinatesValid = shallowRef(true);

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
  return "空间配置无效。";
}

function stageSpatialError(index: number) {
  const hasInvalidSpatialField = issues.value.some((issue) => issue.path[0] === "stages" && issue.path[1] === index && [
    "bastionPositions", "resetPosition", "endPosition", "thirdPersonPosition", "creditsPosition", "control", "portalPositions", "springboardPositions",
  ].includes(String(issue.path[2])));
  return hasInvalidSpatialField ? "请粘贴此阶段完整的 Raw Workshop 点位代码。" : "";
}

function updateComposite(value: SpatialConfigValue) {
  emit("update:modelValue", value as CompositeConfig);
  emit("valid", agentSpatialConfigSchema.safeParse(value).success && stageCoordinatesValid.value);
}

function updateStageCoordinatesValidity(value: boolean) {
  stageCoordinatesValid.value = value;
  emit("valid", value && agentSpatialConfigSchema.safeParse(config.value).success);
}

watch(() => props.modelValue, () => {
  emit("valid", agentSpatialConfigSchema.safeParse(config.value).success && stageCoordinatesValid.value);
}, { immediate: true });
</script>

<template>
  <AdminCompositeStagesInput
    :model-value="config"
    :revision-key="revisionKey"
    mode="legacy"
    :disabled="disabled"
    :issue-message="issueMessage"
    :stage-spatial-error="stageSpatialError"
    @update:model-value="updateComposite"
    @valid="updateStageCoordinatesValidity"
  />
</template>
