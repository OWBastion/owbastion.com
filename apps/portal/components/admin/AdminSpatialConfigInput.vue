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
      class="spatial-input"
      :disabled="disabled"
      spellcheck="false"
      placeholder="Global.bastionPosition[0] = Vector(-121.979, 0.148, 110.507);"
      @update:model-value="updateSource"
    />
    <p class="field-hint">直接粘贴游戏内已定位的 Vector 代码；页面会自动转换为平台配置。支持索引赋值和 Append To Array。</p>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <div v-else-if="summary" class="spatial-summary" role="status">
      <strong>已识别 {{ summary.totalPositions }} 个点位</strong>
      <span v-for="field in summary.fields" :key="field.label">{{ field.label }} {{ field.count }}</span>
    </div>
  </div>
</template>

<style scoped>
.spatial-input :deep(textarea) { min-height: 13rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem; line-height: 1.55; }
.field-hint, .field-error { margin: 6px 0 0; font-size: var(--type-caption-size); line-height: 1.5; }
.field-hint { color: var(--quiet); }
.field-error { color: var(--danger); }
.spatial-summary { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; color: var(--quiet); font-size: var(--type-caption-size); line-height: 1.5; }
.spatial-summary strong { color: var(--ink); }
</style>
