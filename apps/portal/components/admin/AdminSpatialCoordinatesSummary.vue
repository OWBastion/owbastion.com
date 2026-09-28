<script setup lang="ts">
import {
  isVector,
  isVectorList,
  type SpatialConfigImportSummary,
  type SpatialConfigValue,
  type Vector,
} from "~/utils/spatial-config-import";

const props = defineProps<{
  summary: SpatialConfigImportSummary;
  config: SpatialConfigValue | null;
}>();
const toast = useToast();
const coordinateAxes = ["X", "Y", "Z"] as const;
const showDetails = shallowRef(true);

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

const pointItems = (value: unknown, id: string, name: string, icon: string): PointItem[] =>
  isVectorList(value) ? value.map((position, index) => ({ id: `${id}-${index}`, name, index, position, icon })) : [];

const vectorItem = (value: unknown, id: string, name: string, icon: string): PointItem[] =>
  isVector(value) ? [{ id, name, position: value, icon }] : [];

const pointSection = (id: string, title: string, icon: string, items: PointItem[], extraMeta?: string): PointSection[] =>
  items.length || extraMeta ? [{ id, title, count: items.length, icon, items, extraMeta }] : [];

const pointSections = computed<PointSection[]>(() => {
  const config = props.config;
  if (!config) return [];

  const control = config.control && typeof config.control === "object" ? config.control as Record<string, unknown> : null;
  const controlItems = control ? [
    ...pointItems(control.centerPositions, "ctrl-center", "占领中心点", "i-lucide-crosshair"),
    ...pointItems(control.jumpPositions, "ctrl-jump", "占领跳跃点", "i-lucide-chevrons-up"),
    ...pointItems(control.respawnPositions, "ctrl-respawn", "占领重生点", "i-lucide-rotate-ccw"),
  ] : [];
  const extraMeta = control && control.respawnAxis != null
    ? `重生轴：${String(control.respawnAxis).toUpperCase()} 轴 · 阈值：${String(control.respawnAxisThreshold ?? "—")}`
    : undefined;

  return [
    ...pointSection("essential", "核心点位", "i-lucide-navigation", [
      ...pointItems(config.bastionPositions, "bastion", "Bastion 出生点", "i-lucide-navigation"),
      ...vectorItem(config.resetPosition, "reset", "重置点", "i-lucide-rotate-ccw"),
      ...vectorItem(config.endPosition, "end", "终点", "i-lucide-flag"),
      ...vectorItem(config.thirdPersonPosition, "thirdPerson", "第三人称点", "i-lucide-eye"),
      ...vectorItem(config.creditsPosition, "credits", "结算点", "i-lucide-award"),
    ]),
    ...pointSection("mechanic", "传送与跳板", "i-lucide-door-open", [
      ...pointItems(config.portalPositions, "portal", "传送点", "i-lucide-door-open"),
      ...pointItems(config.springboardPositions, "springboard", "跳板点", "i-lucide-chevrons-up"),
    ]),
    ...pointSection("control", "占领机制", "i-lucide-crosshair", controlItems, extraMeta),
  ];
});

function formatCoord(val: number): string {
  return Number.isInteger(val) ? val.toString() : val.toFixed(3).replace(/\.?0+$/, "");
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
  <section class="spatial-summary surface-card elevation-1" role="status" aria-label="点位识别结果">
    <header class="summary-header">
      <div class="summary-header__lead">
        <div class="summary-badge-icon" aria-hidden="true">
          <UIcon name="i-lucide-map-pin" class="summary-icon" />
        </div>
        <div class="summary-texts">
          <strong class="summary-title">已识别 {{ props.summary.totalPositions }} 个点位</strong>
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
        v-for="field in props.summary.fields"
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
              <template v-for="(axis, index) in coordinateAxes" :key="axis">
                <span v-if="index" class="coord-divider" aria-hidden="true" />
                <span class="coord-segment">
                  <span class="coord-axis">{{ axis }}</span>
                  <span class="coord-val">{{ formatCoord(item.position[index]!) }}</span>
                </span>
              </template>
              <UIcon name="i-lucide-copy" class="coord-copy-icon" aria-hidden="true" />
            </button>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.spatial-summary {
  display: grid;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
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
  font-weight: 600;
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
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  font-size: var(--type-caption-size);
  line-height: 1.4;
  color: var(--muted);
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
  font-weight: 600;
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
  border-radius: var(--radius-control);
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
  font-weight: 600;
  color: var(--quiet);
  background: var(--surface);
  padding: 0.0625rem 0.3125rem;
  border-radius: var(--radius-control);
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
  border-radius: var(--radius-control);
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
  font-weight: 500;
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

@container (max-width: 23.99rem) {
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
