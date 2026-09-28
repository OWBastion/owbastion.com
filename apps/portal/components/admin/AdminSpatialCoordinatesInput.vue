<script setup lang="ts">
import {
  formatWorkshopSpatialConfig,
  parseSpatialConfigSource,
  type SpatialConfigImportSummary,
  type SpatialConfigScope,
  type SpatialConfigValue,
} from "~/utils/spatial-config-import";
import AdminSpatialCoordinatesSummary from "./AdminSpatialCoordinatesSummary.vue";

const props = withDefaults(
  defineProps<{
    modelValue: SpatialConfigValue | null;
    revisionKey: string;
    scope?: SpatialConfigScope;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const scope = computed(() => props.scope ?? "single");
const sourceTitle = computed(() => scope.value === "composite-route" ? "全路线共享点位代码" : scope.value === "composite-stage" ? "阶段专属点位代码" : "Workshop 点位代码");
const sourceHint = computed(() => scope.value === "composite-route"
  ? "粘贴终点、重置点、英雄环和结算点；阶段出生点、传送点和重生室点位请粘贴到对应阶段。"
  : scope.value === "composite-stage"
    ? "粘贴当前阶段的 Bastion 出生点、占领点、阶段间传送点和重生室点位；阶段间传送点与占领重生点最多配置一对。可选：重置点、第三人称点、结算点（该阶段作为首阶段时覆盖全路线默认值）和终点（作为末阶段时覆盖）。"
    : "粘贴当前路线或阶段的完整 Raw Workshop 点位代码。");

const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue | null];
  valid: [value: boolean];
}>();

const toast = useToast();
const source = shallowRef("");
const error = shallowRef("");
const summary = shallowRef<SpatialConfigImportSummary | null>(null);
const parsedConfig = shallowRef<SpatialConfigValue | null>(null);
const lastSyncedSource = shallowRef<string>();
const lastEmittedSource = shallowRef<string>();

const sync = () => {
  source.value = formatWorkshopSpatialConfig(props.modelValue, scope.value);
  lastSyncedSource.value = source.value;
  lastEmittedSource.value = undefined;
  error.value = "";
  if (props.modelValue) {
    const result = parseSpatialConfigSource(source.value, props.modelValue, scope.value);
    summary.value = result.ok ? result.summary : null;
    parsedConfig.value = result.ok ? result.config : props.modelValue;
  } else {
    summary.value = null;
    parsedConfig.value = null;
  }
  emit("valid", true);
};
watch(() => props.revisionKey, sync, { immediate: true });
watch(() => props.modelValue, (value) => {
  const nextSource = formatWorkshopSpatialConfig(value, scope.value);
  if (lastEmittedSource.value === nextSource) {
    lastEmittedSource.value = undefined;
    lastSyncedSource.value = nextSource;
    return;
  }
  if (lastSyncedSource.value === nextSource) return;
  sync();
}, { deep: true });

function emitSpatialConfig(value: SpatialConfigValue | null) {
  lastEmittedSource.value = formatWorkshopSpatialConfig(value, scope.value);
  emit("update:modelValue", value);
}

const updateSource = (value: string) => {
  source.value = value;
  if (!value.trim()) {
    error.value = "";
    summary.value = null;
    parsedConfig.value = null;
    emitSpatialConfig(null);
    emit("valid", true);
    return;
  }
  if (value.trimStart().startsWith("{")) {
    error.value = "此处只接受当前路线或阶段的 Raw Workshop 点位代码。";
    summary.value = null;
    parsedConfig.value = null;
    emit("valid", false);
    return;
  }
  const result = parseSpatialConfigSource(value, props.modelValue, scope.value);
  if (!result.ok) {
    error.value = result.error;
    summary.value = null;
    parsedConfig.value = null;
    emit("valid", false);
    return;
  }
  error.value = "";
  summary.value = result.summary;
  parsedConfig.value = result.config;
  emitSpatialConfig(result.config);
  emit("valid", true);
};

function formatSource() {
  if (!parsedConfig.value) return;
  const formatted = formatWorkshopSpatialConfig(parsedConfig.value, scope.value);
  if (formatted) {
    source.value = formatted;
    toast.add({ title: "已按标准格式整理点位代码", color: "success" });
  }
}

async function copySource() {
  if (!source.value.trim()) return;
  try {
    await navigator.clipboard.writeText(source.value);
    toast.add({ title: "点位代码已复制到剪贴板", color: "success" });
  } catch {
    toast.add({ title: "无法访问剪贴板，请手动复制", color: "error" });
  }
}

function clearSource() {
  updateSource("");
}
</script>

<template>
  <div class="spatial-config-input">
    <div class="spatial-editor-box">
      <header class="spatial-editor-header">
        <div class="spatial-editor-header__lead">
          <span class="spatial-editor-title">{{ sourceTitle }}</span>
          <UBadge
            v-if="summary"
            color="success"
            variant="subtle"
            size="sm"
            icon="i-lucide-check-circle-2"
            label="点位已解析"
          />
          <UBadge
            v-else-if="error"
            color="error"
            variant="subtle"
            size="sm"
            icon="i-lucide-alert-circle"
            label="缺少或异常"
          />
          <UBadge
            v-else
            color="neutral"
            variant="subtle"
            size="sm"
            label="待输入"
          />
        </div>
        <div class="spatial-editor-header__actions">
          <UButton
            v-if="parsedConfig"
            size="xs"
            color="neutral"
            variant="soft"
            class="pressable"
            icon="i-lucide-sparkles"
            label="整理格式"
            :disabled="disabled"
            @click="formatSource"
          />
          <UButton
            v-if="source.trim()"
            size="xs"
            color="neutral"
            variant="soft"
            class="pressable"
            icon="i-lucide-copy"
            label="复制代码"
            @click="copySource"
          />
          <UButton
            v-if="source.trim() && !disabled"
            size="xs"
            color="neutral"
            variant="ghost"
            class="pressable"
            icon="i-lucide-trash-2"
            label="清空"
            @click="clearSource"
          />
        </div>
      </header>

      <UTextarea
        :model-value="source"
        :rows="11"
        class="spatial-input w-full"
        :disabled="disabled"
        spellcheck="false"
        placeholder="全局.bastionPosition = 数组(矢量(-10.300, 6.832, -132.595), ...);"
        @update:model-value="updateSource"
      />

      <footer class="spatial-editor-footer">
        <p class="field-hint">
          {{ sourceHint }}
        </p>
      </footer>
    </div>

    <!-- Error state alert -->
    <UAlert
      v-if="error"
      role="alert"
      color="error"
      variant="subtle"
      icon="i-lucide-alert-circle"
      :title="error"
      class="spatial-error-alert"
    />

    <AdminSpatialCoordinatesSummary v-else-if="summary" :summary="summary" :config="parsedConfig" />
  </div>
</template>

<style scoped>
.spatial-config-input {
  container-type: inline-size;
  display: grid;
  gap: 0.875rem;
  width: 100%;
  min-width: 0;
}

.spatial-editor-box {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface);
  transition: border-color var(--theme-transition), background-color var(--theme-transition);
}

.spatial-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.375rem;
}

.spatial-editor-header__lead {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.spatial-editor-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text);
}

.spatial-editor-header__actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
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
  min-height: 12rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.55;
  white-space: pre;
  overflow-x: auto;
  resize: vertical;
}

.spatial-editor-footer {
  margin: 0;
}

.spatial-error-alert {
  margin-top: 0.25rem;
}
</style>
