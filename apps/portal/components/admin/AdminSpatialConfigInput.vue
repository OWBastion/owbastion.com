<script setup lang="ts">
import { formatWorkshopSpatialConfig, parseSpatialConfigSource, type SpatialConfigImportSummary, type SpatialConfigValue } from "~/utils/spatial-config-import";

const props = withDefaults(defineProps<{
  modelValue: SpatialConfigValue | null;
  revisionKey: string;
  disabled?: boolean;
}>(), { disabled: false });
const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue | null];
  valid: [value: boolean];
}>();

const source = shallowRef("");
const error = shallowRef("");
const summary = shallowRef<SpatialConfigImportSummary | null>(null);

const sync = () => {
  source.value = formatWorkshopSpatialConfig(props.modelValue);
  error.value = "";
  const result = props.modelValue ? parseSpatialConfigSource(source.value, props.modelValue) : null;
  summary.value = result?.ok ? result.summary : null;
  emit("valid", true);
};
watch(() => props.revisionKey, sync, { immediate: true });

const updateSource = (value: string) => {
  source.value = value;
  if (!value.trim()) {
    error.value = "";
    summary.value = null;
    emit("update:modelValue", null);
    emit("valid", true);
    return;
  }
  const result = parseSpatialConfigSource(value, props.modelValue);
  if (!result.ok) {
    error.value = result.error;
    summary.value = null;
    emit("valid", false);
    return;
  }
  error.value = "";
  summary.value = result.summary;
  emit("update:modelValue", result.config);
  emit("valid", true);
};
</script>

<template>
  <div class="spatial-config-input">
    <UTextarea
      :model-value="source"
      :rows="12"
      class="spatial-input w-full"
      :disabled="disabled"
      spellcheck="false"
      placeholder="全局.bastionPosition = 数组(矢量(-10.300, 6.832, -132.595), ...);"
      @update:model-value="updateSource"
    />
    <p class="field-hint">直接粘贴游戏内已定位的 Raw Workshop 代码；支持中英文的全局、数组、矢量写法，以及索引赋值和 Append To Array。</p>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <div v-else-if="summary" class="spatial-summary" role="status">
      <strong>已识别 {{ summary.totalPositions }} 个点位</strong>
      <span v-for="field in summary.fields" :key="field.label">{{ field.label }} {{ field.count }}</span>
    </div>
  </div>
</template>

<style scoped>
.spatial-config-input {
  display: grid;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
}

.spatial-input {
  width: 100%;
  min-width: 0;
}

.spatial-input :deep(textarea) {
  display: block;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 13rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.55;
  white-space: pre;
  overflow-x: auto;
  resize: vertical;
}

.field-hint,
.field-error {
  margin: 0.375rem 0 0;
  font-size: var(--type-caption-size);
  line-height: 1.5;
}

.field-hint {
  color: var(--quiet);
}

.field-error {
  color: var(--danger);
}

.spatial-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.375rem 0.75rem;
  margin-top: 0.5rem;
  color: var(--quiet);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}

.spatial-summary strong {
  color: var(--ink);
}
</style>
