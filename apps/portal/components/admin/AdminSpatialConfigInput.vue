<script setup lang="ts">
import {
  formatWorkshopSpatialConfig,
  parseSpatialConfigSource,
  type SpatialConfigImportSummary,
  type SpatialConfigValue,
} from "~/utils/spatial-config-import";

const props = withDefaults(
  defineProps<{
    modelValue: SpatialConfigValue | null;
    revisionKey: string;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue | null];
  valid: [value: boolean];
}>();

type Vector = [number, number, number];

type PointItem = {
  id: string;
  name: string;
  index?: number;
  position: Vector;
  icon?: string;
};

type PointSection = {
  id: string;
  title: string;
  count: number;
  icon: string;
  items: PointItem[];
  extraMeta?: string;
};

const toast = useToast();
const source = shallowRef("");
const error = shallowRef("");
const summary = shallowRef<SpatialConfigImportSummary | null>(null);
const parsedConfig = shallowRef<SpatialConfigValue | null>(null);
const showDetails = shallowRef(true);

const isVector = (value: unknown): value is Vector =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((part) => typeof part === "number" && Number.isFinite(part));

const isVectorList = (value: unknown): value is Vector[] =>
  Array.isArray(value) && value.every(isVector);

const pointSections = computed<PointSection[]>(() => {
  const config = parsedConfig.value;
  if (!config) return [];

  const sections: PointSection[] = [];

  // 1. 核心必需点位
  const essentialItems: PointItem[] = [];
  if (isVectorList(config.bastionPositions)) {
    config.bastionPositions.forEach((pos, idx) => {
      essentialItems.push({
        id: `bastion-${idx}`,
        name: "Bastion 出生点",
        index: idx,
        position: pos,
        icon: "i-lucide-navigation",
      });
    });
  }
  if (isVector(config.resetPosition)) {
    essentialItems.push({
      id: "reset",
      name: "重置点",
      position: config.resetPosition,
      icon: "i-lucide-rotate-ccw",
    });
  }
  if (isVector(config.endPosition)) {
    essentialItems.push({
      id: "end",
      name: "终点",
      position: config.endPosition,
      icon: "i-lucide-flag",
    });
  }
  if (isVector(config.thirdPersonPosition)) {
    essentialItems.push({
      id: "thirdPerson",
      name: "第三人称点",
      position: config.thirdPersonPosition,
      icon: "i-lucide-eye",
    });
  }
  if (isVector(config.creditsPosition)) {
    essentialItems.push({
      id: "credits",
      name: "结算点",
      position: config.creditsPosition,
      icon: "i-lucide-award",
    });
  }

  if (essentialItems.length > 0) {
    sections.push({
      id: "essential",
      title: "核心点位",
      count: essentialItems.length,
      icon: "i-lucide-navigation",
      items: essentialItems,
    });
  }

  // 2. 传送与跳板点位
  const mechanicItems: PointItem[] = [];
  if (isVectorList(config.portalPositions) && config.portalPositions.length > 0) {
    config.portalPositions.forEach((pos, idx) => {
      mechanicItems.push({
        id: `portal-${idx}`,
        name: "传送点",
        index: idx,
        position: pos,
        icon: "i-lucide-door-open",
      });
    });
  }
  if (isVectorList(config.springboardPositions) && config.springboardPositions.length > 0) {
    config.springboardPositions.forEach((pos, idx) => {
      mechanicItems.push({
        id: `springboard-${idx}`,
        name: "跳板点",
        index: idx,
        position: pos,
        icon: "i-lucide-chevrons-up",
      });
    });
  }

  if (mechanicItems.length > 0) {
    sections.push({
      id: "mechanic",
      title: "传送与跳板",
      count: mechanicItems.length,
      icon: "i-lucide-door-open",
      items: mechanicItems,
    });
  }

  // 3. 占领机制点位
  if (config.control && typeof config.control === "object") {
    const ctrl = config.control as Record<string, unknown>;
    const ctrlItems: PointItem[] = [];
    if (isVectorList(ctrl.centerPositions)) {
      ctrl.centerPositions.forEach((pos, idx) => {
        ctrlItems.push({
          id: `ctrl-center-${idx}`,
          name: "占领中心点",
          index: idx,
          position: pos,
          icon: "i-lucide-crosshair",
        });
      });
    }
    if (isVectorList(ctrl.jumpPositions)) {
      ctrl.jumpPositions.forEach((pos, idx) => {
        ctrlItems.push({
          id: `ctrl-jump-${idx}`,
          name: "占领跳跃点",
          index: idx,
          position: pos,
          icon: "i-lucide-chevrons-up",
        });
      });
    }
    if (isVectorList(ctrl.respawnPositions)) {
      ctrl.respawnPositions.forEach((pos, idx) => {
        ctrlItems.push({
          id: `ctrl-respawn-${idx}`,
          name: "占领重生点",
          index: idx,
          position: pos,
          icon: "i-lucide-rotate-ccw",
        });
      });
    }

    let extraMeta: string | undefined;
    if (ctrl.respawnAxis !== undefined && ctrl.respawnAxis !== null) {
      extraMeta = `重生轴：${String(ctrl.respawnAxis).toUpperCase()} 轴 · 阈值：${String(ctrl.respawnAxisThreshold ?? "—")}`;
    }

    if (ctrlItems.length > 0 || extraMeta) {
      sections.push({
        id: "control",
        title: "占领机制",
        count: ctrlItems.length,
        icon: "i-lucide-crosshair",
        items: ctrlItems,
        extraMeta,
      });
    }
  }

  return sections;
});

const sync = () => {
  source.value = formatWorkshopSpatialConfig(props.modelValue);
  error.value = "";
  if (props.modelValue) {
    const result = parseSpatialConfigSource(source.value, props.modelValue);
    summary.value = result.ok ? result.summary : null;
    parsedConfig.value = result.ok ? result.config : props.modelValue;
  } else {
    summary.value = null;
    parsedConfig.value = null;
  }
  emit("valid", true);
};
watch(() => props.revisionKey, sync, { immediate: true });

const updateSource = (value: string) => {
  source.value = value;
  if (!value.trim()) {
    error.value = "";
    summary.value = null;
    parsedConfig.value = null;
    emit("update:modelValue", null);
    emit("valid", true);
    return;
  }
  const result = parseSpatialConfigSource(value, props.modelValue);
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
  emit("update:modelValue", result.config);
  emit("valid", true);
};

function formatCoord(val: number): string {
  return Number.isInteger(val) ? val.toString() : val.toFixed(3).replace(/\.?0+$/, "");
}

function formatSource() {
  if (!parsedConfig.value) return;
  const formatted = formatWorkshopSpatialConfig(parsedConfig.value);
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

async function copyCoordinate(pos: Vector) {
  const text = `Vector(${pos.map(formatCoord).join(", ")})`;
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: `已复制 ${text}`, color: "success" });
  } catch {
    // clipboard failure fallback
  }
}
</script>

<template>
  <div class="spatial-config-input">
    <div class="spatial-editor-box">
      <header class="spatial-editor-header">
        <div class="spatial-editor-header__lead">
          <span class="spatial-editor-title">Workshop 点位代码</span>
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
          直接粘贴游戏内已定位的 Raw Workshop 代码；支持中英文全局、数组、矢量写法，以及索引赋值与 Append To Array。
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

    <!-- Recognition summary & detail inspector -->
    <section v-else-if="summary" class="spatial-summary surface-card elevation-1" role="status" aria-label="点位识别结果">
      <header class="summary-header">
        <div class="summary-header__lead">
          <div class="summary-badge-icon" aria-hidden="true">
            <UIcon name="i-lucide-map-pin" class="summary-icon" />
          </div>
          <div class="summary-texts">
            <strong class="summary-title">已识别 {{ summary.totalPositions }} 个点位</strong>
            <p class="summary-subtitle">已完成点位代码解析与几何映射，坐标已同步至版本修订配置</p>
          </div>
        </div>
        <div class="summary-header__actions">
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            class="pressable"
            :icon="showDetails ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            :label="showDetails ? '收起坐标明细' : '展开坐标明细'"
            @click="showDetails = !showDetails"
          />
        </div>
      </header>

      <!-- Category quick chips -->
      <div class="summary-chips">
        <span
          v-for="field in summary.fields"
          :key="field.label"
          class="summary-chip"
        >{{ field.label }} {{ field.count }}</span>
      </div>

      <!-- Point sections breakdown -->
      <div v-if="showDetails && pointSections.length" class="point-sections">
        <div v-for="section in pointSections" :key="section.id" class="point-section">
          <div class="point-section__header">
            <span class="point-section__title">
              <UIcon :name="section.icon" class="point-section__icon" aria-hidden="true" />
              {{ section.title }}
            </span>
            <span class="point-section__count">{{ section.count }} 个点位</span>
            <span v-if="section.extraMeta" class="point-section__meta">{{ section.extraMeta }}</span>
          </div>

          <div class="point-grid">
            <article
              v-for="item in section.items"
              :key="item.id"
              class="point-card"
            >
              <div class="point-card__header">
                <div class="point-card__lead">
                  <UIcon :name="item.icon || section.icon" class="point-card__icon" aria-hidden="true" />
                  <span class="point-card__name">{{ item.name }}</span>
                </div>
                <span v-if="item.index !== undefined" class="point-card__index">#{{ item.index }}</span>
              </div>
              <button
                type="button"
                class="coord-pill pressable-soft font-mono"
                :title="`点击复制 Vector(${item.position.map(formatCoord).join(', ')})`"
                :aria-label="`复制 ${item.name} 坐标`"
                @click="copyCoordinate(item.position)"
              >
                <span class="coord-segment">
                  <span class="coord-axis">X</span>
                  <span class="coord-val">{{ formatCoord(item.position[0]) }}</span>
                </span>
                <span class="coord-divider" aria-hidden="true" />
                <span class="coord-segment">
                  <span class="coord-axis">Y</span>
                  <span class="coord-val">{{ formatCoord(item.position[1]) }}</span>
                </span>
                <span class="coord-divider" aria-hidden="true" />
                <span class="coord-segment">
                  <span class="coord-axis">Z</span>
                  <span class="coord-val">{{ formatCoord(item.position[2]) }}</span>
                </span>
                <UIcon name="i-lucide-copy" class="coord-copy-icon" aria-hidden="true" />
              </button>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.spatial-config-input {
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
  border-radius: 0.875rem;
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
  font-weight: 650;
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

.field-hint {
  margin: 0;
  font-size: var(--type-caption-size);
  line-height: 1.5;
  color: var(--quiet);
}

.spatial-error-alert {
  margin-top: 0.25rem;
}

.spatial-summary {
  display: grid;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.875rem;
  background: var(--surface);
  box-shadow: var(--elevation-1);
  transition: background-color var(--theme-transition), border-color var(--theme-transition), box-shadow var(--theme-transition);
}

.summary-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.summary-header__lead {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
}

.summary-badge-icon {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  min-width: 2rem;
  border-radius: 50%;
  background: var(--success-surface);
  color: var(--success);
}

.summary-icon {
  width: 1.125rem;
  height: 1.125rem;
}

.summary-texts {
  display: grid;
  gap: 0.125rem;
}

.summary-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 680;
  color: var(--text);
  line-height: 1.35;
}

.summary-subtitle {
  margin: 0;
  font-size: var(--type-caption-size);
  color: var(--quiet);
  line-height: 1.4;
}

.summary-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.375rem 0.5rem;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  font-size: var(--type-caption-size);
  line-height: 1.4;
  color: var(--muted);
}

.summary-chip .chip-label {
  font-weight: 550;
}

.summary-chip .chip-count {
  display: inline-grid;
  place-items: center;
  min-width: 1.125rem;
  padding: 0 0.25rem;
  height: 1.125rem;
  border-radius: 9999px;
  background: var(--surface);
  color: var(--text);
  font-weight: 650;
  font-size: 0.6875rem;
}

.point-sections {
  display: grid;
  gap: 0.875rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}

.point-section {
  display: grid;
  gap: 0.5rem;
}

.point-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.point-section__title {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 680;
  color: var(--text);
}

.point-section__icon {
  width: 0.875rem;
  height: 0.875rem;
  color: var(--muted);
}

.point-section__count {
  font-size: var(--type-caption-size);
  color: var(--quiet);
}

.point-section__meta {
  margin-left: auto;
  font-size: var(--type-caption-size);
  color: var(--quiet);
}

.point-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15.5rem), 1fr));
  gap: 0.5rem;
}

.point-card {
  display: grid;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem;
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: 0.625rem;
  transition: border-color 160ms ease, background-color 160ms ease;
}

.point-card:hover {
  border-color: var(--line-strong);
}

.point-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem;
}

.point-card__lead {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.point-card__icon {
  width: 0.8125rem;
  height: 0.8125rem;
  color: var(--muted);
  flex: 0 0 auto;
}

.point-card__name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.point-card__index {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.6875rem;
  font-weight: 650;
  color: var(--quiet);
  background: var(--surface);
  padding: 0.0625rem 0.3125rem;
  border-radius: 0.25rem;
  border: 1px solid var(--line);
}

.coord-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  padding: 0.25rem 0.45rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  font-size: 0.75rem;
  color: var(--text);
  text-align: left;
  width: 100%;
  cursor: pointer;
  box-sizing: border-box;
}

.coord-pill:hover .coord-copy-icon {
  opacity: 1;
  color: var(--text);
}

.coord-segment {
  display: inline-flex;
  align-items: baseline;
  gap: 0.15rem;
}

.coord-axis {
  color: var(--quiet);
  font-size: 0.625rem;
  font-weight: 700;
}

.coord-val {
  color: var(--text);
  font-weight: 550;
}

.coord-divider {
  width: 1px;
  height: 0.625rem;
  background: var(--line);
}

.coord-copy-icon {
  width: 0.75rem;
  height: 0.75rem;
  color: var(--quiet);
  opacity: 0.4;
  margin-left: auto;
  transition: opacity 160ms ease, color 160ms ease;
  flex: 0 0 auto;
}

@media (max-width: 38.75rem) {
  .summary-header {
    flex-direction: column;
    gap: 0.625rem;
  }
  .summary-header__actions {
    width: 100%;
  }
  .summary-header__actions :deep(button) {
    width: 100%;
  }
  .point-grid {
    grid-template-columns: 1fr;
  }
}
</style>
