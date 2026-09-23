<script setup lang="ts">
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminCompositeSpatialConfigInput from "./AdminCompositeSpatialConfigInput.vue";
import AdminSpatialCoordinatesInput from "./AdminSpatialCoordinatesInput.vue";
import { parseSpatialConfigSource, type SpatialConfigValue } from "~/utils/spatial-config-import";

const props = withDefaults(defineProps<{
  modelValue: SpatialConfigValue | null;
  revisionKey: string;
  disabled?: boolean;
}>(), { disabled: false });

const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue | null];
  valid: [value: boolean];
}>();

type SpatialMode = "single" | "composite";

const modeItems = [
  { value: "single", label: "单一路线" },
  { value: "composite", label: "组合路线" },
];

const isComposite = (value: SpatialConfigValue | null): value is SpatialConfigValue =>
  Boolean(value && Array.isArray(value.stages) && value.composition && typeof value.composition === "object");

const createEmptySpatialStage = (stageId: string) => ({
  stageId,
  bastionPositions: [],
  resetPosition: null,
  endPosition: null,
  thirdPersonPosition: null,
  creditsPosition: null,
  control: null,
  portalPositions: [],
  springboardPositions: [],
});

const createEmptyCompositeConfig = (): SpatialConfigValue => ({
  composition: {
    selectionCount: 2,
    firstStageSelection: { mode: "random" },
    remainingStageSelection: "random_unique",
  },
  stages: [createEmptySpatialStage("stage-1"), createEmptySpatialStage("stage-2")],
});

const mode = shallowRef<SpatialMode>(isComposite(props.modelValue) ? "composite" : "single");
const singleDraft = shallowRef<SpatialConfigValue | null>(mode.value === "single" ? props.modelValue : null);
const compositeDraft = shallowRef<SpatialConfigValue | null>(mode.value === "composite" ? props.modelValue : null);
const singleCoordinatesValid = shallowRef(true);
const compositeValid = shallowRef(true);
const advancedJson = shallowRef("");
const advancedJsonError = shallowRef("");

function writeAdvancedJson(value: SpatialConfigValue | null) {
  advancedJson.value = value ? JSON.stringify(value, null, 2) : "";
  advancedJsonError.value = "";
}

function sync() {
  mode.value = isComposite(props.modelValue) ? "composite" : "single";
  singleDraft.value = mode.value === "single" ? props.modelValue : null;
  compositeDraft.value = mode.value === "composite" ? props.modelValue : null;
  singleCoordinatesValid.value = true;
  compositeValid.value = true;
  writeAdvancedJson(props.modelValue);
  emit("valid", props.modelValue === null || agentSpatialConfigSchema.safeParse(props.modelValue).success);
}

watch(() => props.revisionKey, sync, { immediate: true });

function updateMode(value: SpatialMode) {
  if (value === mode.value) return;
  mode.value = value;
  advancedJsonError.value = "";
  if (value === "composite") {
    compositeDraft.value ??= createEmptyCompositeConfig();
    writeAdvancedJson(compositeDraft.value);
    emit("update:modelValue", compositeDraft.value);
    emit("valid", compositeValid.value && agentSpatialConfigSchema.safeParse(compositeDraft.value).success);
  } else {
    singleCoordinatesValid.value = true;
    writeAdvancedJson(singleDraft.value);
    emit("update:modelValue", singleDraft.value);
    emit("valid", singleDraft.value === null || (singleCoordinatesValid.value && agentSpatialConfigSchema.safeParse(singleDraft.value).success));
  }
}

function updateSingle(value: SpatialConfigValue | null) {
  singleDraft.value = value;
  writeAdvancedJson(value);
  emit("update:modelValue", value);
  emit("valid", value === null || (singleCoordinatesValid.value && agentSpatialConfigSchema.safeParse(value).success));
}

function updateSingleValidity(value: boolean) {
  singleCoordinatesValid.value = value;
  emit("valid", value && (singleDraft.value === null || agentSpatialConfigSchema.safeParse(singleDraft.value).success));
}

function updateComposite(value: SpatialConfigValue) {
  compositeDraft.value = value;
  writeAdvancedJson(value);
  emit("update:modelValue", value);
  emit("valid", compositeValid.value && agentSpatialConfigSchema.safeParse(value).success);
}

function updateCompositeValidity(value: boolean) {
  compositeValid.value = value;
  emit("valid", value && agentSpatialConfigSchema.safeParse(compositeDraft.value).success);
}

function updateAdvancedJson(value: string) {
  advancedJson.value = value;
  advancedJsonError.value = "";
  if (!value.trim().startsWith("{")) {
    advancedJsonError.value = "请粘贴完整空间配置 JSON。";
    emit("valid", false);
    return;
  }
  const result = parseSpatialConfigSource(value);
  if (!result.ok) {
    advancedJsonError.value = result.error;
    emit("valid", false);
    return;
  }
  const validated = agentSpatialConfigSchema.safeParse(result.config);
  if (!validated.success) {
    advancedJsonError.value = "空间配置 JSON 无效，请检查点位、阶段 ID、选择数量和检测配置。";
    emit("valid", false);
    return;
  }
  const config = validated.data as SpatialConfigValue;
  mode.value = isComposite(config) ? "composite" : "single";
  singleDraft.value = mode.value === "single" ? config : null;
  compositeDraft.value = mode.value === "composite" ? config : null;
  singleCoordinatesValid.value = true;
  compositeValid.value = true;
  emit("update:modelValue", config);
  emit("valid", true);
}
</script>

<template>
  <div class="spatial-config-editor">
    <UFormField label="路线类型">
      <USelect
        :model-value="mode"
        :items="modeItems"
        :disabled="disabled"
        aria-label="路线类型"
        @update:model-value="updateMode($event as SpatialMode)"
      />
    </UFormField>

    <AdminSpatialCoordinatesInput
      v-if="mode === 'single'"
      :model-value="singleDraft"
      :revision-key="revisionKey + ':single'"
      :disabled="disabled"
      @update:model-value="updateSingle"
      @valid="updateSingleValidity"
    />
    <AdminCompositeSpatialConfigInput
      v-else-if="compositeDraft"
      :model-value="compositeDraft"
      :revision-key="revisionKey + ':composite'"
      :disabled="disabled"
      @update:model-value="updateComposite"
      @valid="updateCompositeValidity"
    />

    <details class="spatial-json-advanced" :open="Boolean(advancedJsonError)">
      <summary>高级：导入完整空间配置 JSON</summary>
      <UFormField label="空间配置 JSON">
        <UTextarea
          :model-value="advancedJson"
          :rows="8"
          :disabled="disabled"
          spellcheck="false"
          aria-label="空间配置 JSON"
          @update:model-value="updateAdvancedJson"
        />
        <p v-if="advancedJsonError" class="spatial-json-advanced__error" role="alert">{{ advancedJsonError }}</p>
      </UFormField>
    </details>
  </div>
</template>

<style scoped>
.spatial-config-editor {
  display: grid;
  gap: 0.875rem;
  min-width: 0;
}
.spatial-json-advanced {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--line);
  border-radius: 0.8125rem;
}
.spatial-json-advanced summary {
  cursor: pointer;
  font-weight: 650;
}
.spatial-json-advanced__error {
  margin: 0.5rem 0 0;
  color: var(--danger);
  font-size: var(--type-caption-size);
}
</style>
