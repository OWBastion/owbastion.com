<script setup lang="ts">
import { useFullscreen, useResizeObserver } from "@vueuse/core";

const props = defineProps<{ src: string; alt: string }>();
const emit = defineEmits<{ error: [] }>();

const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;

const root = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const image = ref<HTMLImageElement | null>(null);
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(root);

const natural = shallowRef({ width: 0, height: 0 });
const box = shallowRef({ width: 0, height: 0 });
const scale = shallowRef(1);
const offset = shallowRef({ x: 0, y: 0 });
// While `fitted`, the image follows the viewport size; any manual zoom or pan leaves fit mode.
const fitted = shallowRef(true);
const dragging = shallowRef(false);

const hasImage = computed(() => natural.value.width > 0 && natural.value.height > 0 && box.value.width > 0 && box.value.height > 0);
const fitScale = computed(() => hasImage.value ? Math.min(box.value.width / natural.value.width, box.value.height / natural.value.height) : 1);
const percent = computed(() => `${Math.round(scale.value * 100)}%`);
const aspectRatio = computed(() => natural.value.width > 0 ? `${natural.value.width} / ${natural.value.height}` : undefined);

function clampOffset(x: number, y: number, nextScale: number) {
  const width = natural.value.width * nextScale;
  const height = natural.value.height * nextScale;
  // Smaller than the viewport: centred. Larger: the image edge may not leave a gap.
  const clamp = (value: number, content: number, view: number) => content <= view ? (view - content) / 2 : Math.min(0, Math.max(view - content, value));
  return { x: clamp(x, width, box.value.width), y: clamp(y, height, box.value.height) };
}

function fit() {
  fitted.value = true;
  scale.value = fitScale.value;
  offset.value = clampOffset(0, 0, scale.value);
}

function zoomTo(next: number, anchorX = box.value.width / 2, anchorY = box.value.height / 2) {
  if (!hasImage.value) return;
  const clamped = Math.min(MAX_SCALE, Math.max(fitScale.value, next));
  const ratio = clamped / scale.value;
  fitted.value = clamped === fitScale.value;
  offset.value = clampOffset(anchorX - (anchorX - offset.value.x) * ratio, anchorY - (anchorY - offset.value.y) * ratio, clamped);
  scale.value = clamped;
}

function actualSize() {
  zoomTo(1);
}

const zoomIn = () => zoomTo(scale.value * ZOOM_STEP);
const zoomOut = () => zoomTo(scale.value / ZOOM_STEP);

function pointerInViewport(event: { clientX: number; clientY: number }) {
  const rect = viewport.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onWheel(event: WheelEvent) {
  const { x, y } = pointerInViewport(event);
  zoomTo(scale.value * Math.exp(-event.deltaY * 0.0016), x, y);
}

let drag: { x: number; y: number; originX: number; originY: number } | null = null;
function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || fitted.value) return;
  drag = { x: event.clientX, y: event.clientY, originX: offset.value.x, originY: offset.value.y };
  dragging.value = true;
  viewport.value?.setPointerCapture(event.pointerId);
}
function onPointerMove(event: PointerEvent) {
  if (!drag) return;
  offset.value = clampOffset(drag.originX + event.clientX - drag.x, drag.originY + event.clientY - drag.y, scale.value);
}
function endDrag() {
  drag = null;
  dragging.value = false;
}

function onDoubleClick(event: MouseEvent) {
  if (fitted.value) {
    const { x, y } = pointerInViewport(event);
    zoomTo(1, x, y);
  } else fit();
}

function onKeydown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const handlers: Record<string, () => void> = { "+": zoomIn, "=": zoomIn, "-": zoomOut, "0": fit, "1": actualSize, f: () => { void toggleFullscreen(); } };
  const handler = handlers[event.key.toLowerCase()];
  if (!handler) return;
  event.preventDefault();
  handler();
}

function onLoad() {
  const element = image.value;
  if (!element) return;
  natural.value = { width: element.naturalWidth, height: element.naturalHeight };
  measure();
}

function measure() {
  const element = viewport.value;
  if (!element) return;
  box.value = { width: element.clientWidth, height: element.clientHeight };
  if (fitted.value) fit();
  else zoomTo(scale.value);
}

useResizeObserver(viewport, measure);
watch(() => props.src, () => {
  natural.value = { width: 0, height: 0 };
  fitted.value = true;
});
watch(isFullscreen, () => nextTick(measure));
</script>

<template>
  <div ref="root" class="evidence-viewer" :class="{ 'evidence-viewer--fullscreen': isFullscreen }">
    <div class="viewer-toolbar" role="toolbar" aria-label="截图查看">
      <UButton type="button" icon="i-lucide-scan" label="适应" size="sm" color="neutral" variant="outline" aria-label="适应窗口（0）" :disabled="!hasImage" @click="fit" />
      <UButton type="button" icon="i-lucide-maximize-2" label="100%" size="sm" color="neutral" variant="outline" aria-label="原始大小（1）" :disabled="!hasImage" @click="actualSize" />
      <UButton type="button" icon="i-lucide-zoom-out" size="sm" color="neutral" variant="outline" aria-label="缩小（-）" :disabled="!hasImage" @click="zoomOut" />
      <UButton type="button" icon="i-lucide-zoom-in" size="sm" color="neutral" variant="outline" aria-label="放大（+）" :disabled="!hasImage" @click="zoomIn" />
      <UButton type="button" :icon="isFullscreen ? 'i-lucide-minimize-2' : 'i-lucide-expand'" size="sm" color="neutral" variant="outline" :aria-label="isFullscreen ? '退出全屏（F）' : '全屏（F）'" @click="toggleFullscreen()" />
      <span class="viewer-zoom type-caption" role="status" aria-label="缩放比例">{{ percent }}</span>
    </div>
    <div
      ref="viewport"
      class="viewer-viewport"
      :class="{ 'viewer-viewport--pannable': !fitted, 'viewer-viewport--dragging': dragging }"
      :style="{ aspectRatio: isFullscreen ? undefined : aspectRatio }"
      tabindex="0"
      role="group"
      aria-label="截图。滚轮缩放，放大后拖动平移，双击切换适应与原始大小"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @dblclick="onDoubleClick"
      @keydown="onKeydown"
    >
      <img
        ref="image"
        class="evidence-image"
        :class="{ 'evidence-image--measured': hasImage }"
        :src="src"
        :alt="alt"
        draggable="false"
        :style="hasImage ? { width: `${natural.width}px`, height: `${natural.height}px`, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` } : undefined"
        @load="onLoad"
        @error="emit('error')"
      />
    </div>
  </div>
</template>

<style scoped>
.evidence-viewer { display: grid; gap: var(--space-2); min-width: 0; }
.viewer-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.viewer-zoom { margin-inline-start: auto; min-width: 3rem; color: var(--quiet); font-variant-numeric: tabular-nums; text-align: end; }
.viewer-viewport {
  position: relative;
  overflow: hidden;
  width: 100%;
  max-height: calc(100dvh - 10rem);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--surface-raised);
  touch-action: none;
  user-select: none;
}
.viewer-viewport--pannable { cursor: grab; }
.viewer-viewport--dragging { cursor: grabbing; }
/* Until the natural size is known the image fills the width, so a slow or failed load still shows something. */
.evidence-image { display: block; width: 100%; height: auto; max-width: none; }
.evidence-image--measured { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.evidence-viewer--fullscreen { grid-template-rows: auto minmax(0, 1fr); padding: var(--space-3); background: var(--page); }
.evidence-viewer--fullscreen .viewer-viewport { max-height: none; height: 100%; }
</style>
