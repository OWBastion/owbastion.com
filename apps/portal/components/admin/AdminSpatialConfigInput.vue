<script setup lang="ts">
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminCompositeSpatialConfigInput from "./AdminCompositeSpatialConfigInput.vue";
import AdminSpatialCoordinatesInput from "./AdminSpatialCoordinatesInput.vue";
import { createEmptyCompositeConfig, hasCompositeStructure } from "~/utils/composite-spatial-config";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

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
  { value: "single", label: "单一地图" },
  { value: "composite", label: "多合一（每局随机抽几段）" },
];

const isLegacyComposite = (value: SpatialConfigValue | null) => hasCompositeStructure(value) && !("endPosition" in value);
const compositeMode = computed(() => isLegacyComposite(compositeDraft.value) ? "legacy" : "current");

const mode = shallowRef<SpatialMode>(hasCompositeStructure(props.modelValue) ? "composite" : "single");
const singleDraft = shallowRef<SpatialConfigValue | null>(mode.value === "single" ? props.modelValue : null);
const compositeDraft = shallowRef<SpatialConfigValue | null>(mode.value === "composite" ? props.modelValue : null);
const singleCoordinatesValid = shallowRef(true);
const compositeValid = shallowRef(true);
function sync() {
  mode.value = hasCompositeStructure(props.modelValue) ? "composite" : "single";
  singleDraft.value = mode.value === "single" ? props.modelValue : null;
  compositeDraft.value = mode.value === "composite" ? props.modelValue : null;
  singleCoordinatesValid.value = true;
  compositeValid.value = true;
  emit("valid", props.modelValue === null || agentSpatialConfigSchema.safeParse(props.modelValue).success);
}

watch(() => props.revisionKey, sync, { immediate: true });

function updateMode(value: SpatialMode) {
  if (value === mode.value) return;
  mode.value = value;
  if (value === "composite") {
    compositeDraft.value ??= createEmptyCompositeConfig();
    emit("update:modelValue", compositeDraft.value);
    emit("valid", compositeValid.value && agentSpatialConfigSchema.safeParse(compositeDraft.value).success);
  } else {
    singleCoordinatesValid.value = true;
    emit("update:modelValue", singleDraft.value);
    emit("valid", singleDraft.value === null || (singleCoordinatesValid.value && agentSpatialConfigSchema.safeParse(singleDraft.value).success));
  }
}

function updateSingle(value: SpatialConfigValue | null) {
  singleDraft.value = value;
  emit("update:modelValue", value);
  emit("valid", value === null || (singleCoordinatesValid.value && agentSpatialConfigSchema.safeParse(value).success));
}

function updateSingleValidity(value: boolean) {
  singleCoordinatesValid.value = value;
  emit("valid", value && (singleDraft.value === null || agentSpatialConfigSchema.safeParse(singleDraft.value).success));
}

function updateComposite(value: SpatialConfigValue) {
  compositeDraft.value = value;
  emit("update:modelValue", value);
  emit("valid", compositeValid.value && agentSpatialConfigSchema.safeParse(value).success);
}

function updateCompositeValidity(value: boolean) {
  compositeValid.value = value;
  emit("valid", value && agentSpatialConfigSchema.safeParse(compositeDraft.value).success);
}
</script>

<template>
  <div class="spatial-config-editor">
    <div class="spatial-mode" role="group" aria-label="路线类型">
      <button
        v-for="item in modeItems"
        :key="item.value"
        type="button"
        class="spatial-mode__option"
        :aria-pressed="mode === item.value"
        :disabled="disabled"
        @click="updateMode(item.value as SpatialMode)"
      >{{ item.label }}</button>
    </div>

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
      :revision-key="revisionKey + (compositeMode === 'legacy' ? ':composite-legacy' : ':composite')"
      :disabled="disabled"
      :mode="compositeMode"
      @update:model-value="updateComposite"
      @valid="updateCompositeValidity"
    />

  </div>
</template>

<style scoped>
.spatial-config-editor {
  display: grid;
  gap: 0.875rem;
  min-width: 0;
}
.spatial-mode { display: inline-flex; justify-self: start; padding: 0.1875rem; border-radius: var(--radius-control); background: var(--surface-raised); }
.spatial-mode__option { padding: 0.375rem 0.875rem; border: 0; border-radius: var(--radius-control); color: var(--muted); background: transparent; font-size: 0.875rem; font-weight: 500; }
.spatial-mode__option[aria-pressed="true"] { color: var(--text); background: var(--surface); box-shadow: 0 1px 2px var(--shadow); }
.spatial-mode__option:disabled { opacity: 0.6; }
</style>
