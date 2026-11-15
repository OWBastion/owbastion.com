<script setup lang="ts">
import type { MapPosition, MapPositionKind, MapPositionStage } from "@owbastion/contracts";

const props = defineProps<{ stages: MapPositionStage[] }>();

type Shape = "num" | "square" | "diamond" | "tri" | "dot";
type Tone = "bastion" | "reset" | "end" | "link" | "control" | "aux";

// Keys run back to front: later kinds are drawn on top.
const kindStyles: Record<MapPositionKind, { name: string; shape: Shape; tone: Tone }> = {
  control_center: { name: "占领中心点", shape: "tri", tone: "control" },
  control_jump: { name: "占领跳跃点", shape: "tri", tone: "control" },
  control_respawn: { name: "占领重生点", shape: "tri", tone: "control" },
  springboard: { name: "跳板点", shape: "tri", tone: "link" },
  portal: { name: "传送点", shape: "diamond", tone: "link" },
  reset: { name: "重置点", shape: "square", tone: "reset" },
  end: { name: "终点", shape: "square", tone: "end" },
  third_person: { name: "第三人称点", shape: "dot", tone: "aux" },
  bastion: { name: "Bastion 出生点", shape: "num", tone: "bastion" },
};
const drawOrder = Object.keys(kindStyles) as MapPositionKind[];
const legendEntries: Array<{ label: string; shape: Shape; tone: Tone; kinds: MapPositionKind[] }> = [
  { label: "出生点", shape: "num", tone: "bastion", kinds: ["bastion"] },
  { label: "重置点", shape: "square", tone: "reset", kinds: ["reset"] },
  { label: "终点", shape: "square", tone: "end", kinds: ["end"] },
  { label: "传送点", shape: "diamond", tone: "link", kinds: ["portal"] },
  { label: "跳板点", shape: "tri", tone: "link", kinds: ["springboard"] },
  { label: "占领点", shape: "tri", tone: "control", kinds: ["control_center", "control_jump", "control_respawn"] },
  { label: "第三人称点", shape: "dot", tone: "aux", kinds: ["third_person"] },
];
const markRadius: Record<Shape, number> = { num: 11, square: 9, diamond: 7, tri: 7, dot: 5 };

const W = 800;
const H = 520;
const PAD = 44;

const stageIndex = shallowRef(0);
const turns = shallowRef(0);
const mirrored = shallowRef(false);
const focusedLabel = shallowRef<string | null>(null);

watch(() => props.stages.length, (length) => {
  if (stageIndex.value >= length) stageIndex.value = 0;
});

const stageItems = computed(() => props.stages.map((_, index) => ({ label: `阶段 ${index + 1}`, value: String(index) })));
const stageValue = computed({
  get: () => String(stageIndex.value),
  set: (value: string | number) => {
    stageIndex.value = Number(value);
    focusedLabel.value = null;
  },
});
const stage = computed(() => props.stages[stageIndex.value] ?? props.stages[0]);

const format = (value: number) => String(Math.round(value * 100) / 100);

// Top-down view: world x and z form the plane; y is height. Turns and mirroring change only the view.
const plane = ([x, , z]: MapPosition["position"]): [number, number] => {
  let point: [number, number] = [mirrored.value ? -x : x, z];
  for (let turn = 0; turn < turns.value; turn += 1) point = [-point[1], point[0]];
  return point;
};

const plot = computed(() => {
  const points = stage.value?.points ?? [];
  const flat = points.map((point) => plane(point.position));
  const xs = flat.map((point) => point[0]);
  const ys = flat.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offsetX = (W - spanX * scale) / 2;
  const offsetY = (H - spanY * scale) / 2;
  const toScreen = (position: MapPosition["position"]) => {
    const [a, b] = plane(position);
    return { x: offsetX + (a - minX) * scale, y: offsetY + (b - minY) * scale };
  };

  const marks = drawOrder.flatMap((kind) => {
    const style = kindStyles[kind];
    const ofKind = points.filter((point) => point.kind === kind);
    return ofKind.map((point, index) => {
      const name = ofKind.length > 1 ? `${style.name} ${index + 1}` : style.name;
      const [x, y, z] = point.position;
      return {
        key: `${kind}-${index}`,
        ...style,
        ...toScreen(point.position),
        number: index + 1,
        label: `${name} · X ${format(x)} Y ${format(y)} Z ${format(z)}`,
      };
    });
  });
  const portalLink = points.filter((point) => point.kind === "portal").map((point) => toScreen(point.position)).map(({ x, y }) => `${x},${y}`).join(" ");
  const meters = [100, 50, 20, 10, 5].find((value) => value * scale <= 160) ?? 5;
  const kinds = new Set(points.map((point) => point.kind));
  return {
    marks,
    portalLink: portalLink.includes(" ") ? portalLink : "",
    scaleBar: { length: meters * scale, label: `${meters} m` },
    legend: legendEntries.filter((entry) => entry.kinds.some((kind) => kinds.has(kind))),
  };
});

const summary = computed(() => {
  const heights = (stage.value?.points ?? []).filter((point) => point.kind === "bastion").map((point) => point.position[1]);
  if (!heights.length) return "";
  return `${heights.length} 个出生点 · 高差 ${format(Math.max(...heights) - Math.min(...heights))} m`;
});

function shapePath(shape: Shape, x: number, y: number, r: number) {
  if (shape === "square") return `M${x - r} ${y - r}h${2 * r}v${2 * r}h${-2 * r}z`;
  if (shape === "diamond") return `M${x} ${y - r - 2}L${x + r + 2} ${y}L${x} ${y + r + 2}L${x - r - 2} ${y}z`;
  if (shape === "tri") return `M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}z`;
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
}

function rotate() {
  turns.value = (turns.value + 1) % 4;
}
</script>

<template>
  <figure class="position-overview">
    <div class="position-overview__bar">
      <UTabs v-if="stageItems.length > 1" v-model="stageValue" :items="stageItems" :content="false" variant="pill" size="xs" aria-label="阶段" />
      <div class="position-overview__tools">
        <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-rotate-cw" label="旋转 90°" @click="rotate" />
        <UButton size="xs" color="neutral" :variant="mirrored ? 'soft' : 'outline'" icon="i-lucide-flip-horizontal-2" label="镜像" :aria-pressed="mirrored" @click="mirrored = !mirrored" />
      </div>
    </div>
    <svg class="position-overview__plot" :viewBox="`0 0 ${W} ${H}`" role="group" aria-label="俯视点位图">
      <polyline v-if="plot.portalLink" class="position-overview__link" :points="plot.portalLink" />
      <g
        v-for="mark in plot.marks"
        :key="mark.key"
        class="position-overview__point"
        :data-tone="mark.tone"
        tabindex="0"
        role="img"
        :aria-label="mark.label"
        @pointerenter="focusedLabel = mark.label"
        @pointerleave="focusedLabel = null"
        @focus="focusedLabel = mark.label"
        @blur="focusedLabel = null"
      >
        <circle class="position-overview__hit" :cx="mark.x" :cy="mark.y" r="16" />
        <path class="position-overview__mark" :d="shapePath(mark.shape, mark.x, mark.y, markRadius[mark.shape])" />
        <text v-if="mark.shape === 'num'" :x="mark.x" :y="mark.y">{{ mark.number }}</text>
      </g>
      <g class="position-overview__scale" aria-hidden="true">
        <line :x1="16" :y1="H - 16" :x2="16 + plot.scaleBar.length" :y2="H - 16" />
        <text :x="16" :y="H - 24">{{ plot.scaleBar.label }}</text>
      </g>
    </svg>
    <figcaption class="position-overview__foot">
      <span class="position-overview__readout num" aria-live="polite">{{ focusedLabel ?? summary }}</span>
      <span class="position-overview__legend">
        <span v-for="entry in plot.legend" :key="entry.label" class="position-overview__legend-item">
          <svg viewBox="0 0 20 20" aria-hidden="true" class="position-overview__point" :data-tone="entry.tone"><path class="position-overview__mark" :d="shapePath(entry.shape, 10, 10, entry.shape === 'dot' ? 4 : 6)" /></svg>
          {{ entry.label }}
        </span>
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
.position-overview { display: grid; min-width: 0; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.position-overview__bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--line); }
.position-overview__tools { display: flex; gap: var(--space-2); margin-left: auto; }
.position-overview__plot { display: block; width: 100%; height: auto; background: var(--surface-raised); }
.position-overview__link { fill: none; stroke: var(--info); stroke-width: 1.5; stroke-dasharray: 4 4; }
.position-overview__point { outline: none; }
.position-overview__hit { fill: transparent; }
.position-overview__mark { stroke: var(--surface-raised); stroke-width: 2; }
.position-overview__point:hover .position-overview__mark,
.position-overview__point:focus-visible .position-overview__mark { stroke: var(--text); }
.position-overview__point text { fill: var(--on-accent); font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
.position-overview__point[data-tone="bastion"] .position-overview__mark { fill: var(--accent); }
.position-overview__point[data-tone="reset"] .position-overview__mark { fill: var(--success); }
.position-overview__point[data-tone="end"] .position-overview__mark { fill: var(--danger); }
.position-overview__point[data-tone="link"] .position-overview__mark { fill: var(--info); }
.position-overview__point[data-tone="control"] .position-overview__mark { fill: var(--muted); }
.position-overview__point[data-tone="aux"] .position-overview__mark { fill: var(--surface-raised); stroke: var(--quiet); }
.position-overview__scale line { stroke: var(--muted); stroke-width: 2; }
.position-overview__scale text { fill: var(--muted); font-size: 11px; }
.position-overview__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); padding: var(--space-2) var(--space-3); border-top: 1px solid var(--line); font-size: var(--type-caption-size); }
.position-overview__readout { min-height: 1.5em; color: var(--text); }
.position-overview__legend { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); color: var(--muted); }
.position-overview__legend-item { display: inline-flex; align-items: center; gap: var(--space-1); }
.position-overview__legend-item svg { width: 14px; height: 14px; }
</style>
