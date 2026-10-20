<script setup lang="ts">
import { useEventListener } from "@vueuse/core";

// Backdrop: a handful of grid cells (the 3rem body grid) breathe in the accent colour, each on its own
// random period, phase and peak, and hop to a new random cell after every breath. Each cell is lit for
// only ~16% of its period, so at any moment just a few of them glow.
interface Cell { id: number; col: number; row: number; duration: number; delay: number; peak: number }

const cells = ref<Cell[]>([]);
let grid = { cols: 0, rows: 0 };

const random = (min: number, max: number) => min + Math.random() * (max - min);
const randomCell = (cell: Cell) => {
  cell.col = Math.floor(Math.random() * grid.cols);
  cell.row = Math.floor(Math.random() * grid.rows);
  cell.peak = random(.35, 1);
};

function measure() {
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3;
  grid = { cols: Math.ceil(window.innerWidth / size), rows: Math.ceil(window.innerHeight / size) };
}

useEventListener("resize", measure);

onMounted(() => {
  measure();
  const count = Math.min(18, Math.max(6, Math.round((grid.cols * grid.rows) / 45)));
  cells.value = Array.from({ length: count }, (_, id) => {
    const cell = { id, col: 0, row: 0, duration: random(8, 16), delay: 0, peak: 1 };
    cell.delay = -random(0, cell.duration);
    randomCell(cell);
    return cell;
  });
});
</script>

<template>
  <div class="grid-glow" aria-hidden="true">
    <span
      v-for="cell in cells"
      :key="cell.id"
      class="grid-glow__cell"
      :style="{ '--col': cell.col, '--row': cell.row, '--peak': cell.peak, animationDuration: `${cell.duration}s`, animationDelay: `${cell.delay}s` }"
      @animationiteration="randomCell(cell)"
    />
  </div>
</template>

<style scoped>
.grid-glow { position: fixed; z-index: -1; inset: 0; overflow: hidden; pointer-events: none; }
.grid-glow__cell { position: absolute; top: calc(var(--row) * 3rem); left: calc(var(--col) * 3rem); width: 3rem; height: 3rem; background: radial-gradient(closest-side, color-mix(in oklch, var(--accent) 12%, transparent), color-mix(in oklch, var(--accent) 4%, transparent)); opacity: 0; animation: grid-cell-breathe ease-in-out infinite; }
@keyframes grid-cell-breathe { 0%, 84%, 100% { opacity: 0; } 92% { opacity: var(--peak); } }
@media (prefers-reduced-motion: reduce) {
  .grid-glow__cell { opacity: calc(var(--peak) * .5); animation: none; }
}
</style>
