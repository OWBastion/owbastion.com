<script setup lang="ts">
import type { PlayerActivityDay } from "~/composables/usePortalApi";
import { buildRunDayGrid, type RunDayCell } from "~/utils/run-days";

const props = defineProps<{
  days: PlayerActivityDay[];
  now?: number;
}>();

const grid = computed(() => buildRunDayGrid(props.days, props.now ?? Date.now()));
// Transpose week columns into weekday rows for the table body.
const rows = computed(() => grid.value.weeks[0]?.map((_, weekday) => grid.value.weeks.map((week) => week[weekday]!)) ?? []);
const scrollRef = shallowRef<HTMLElement | null>(null);
onMounted(() => {
  const el = scrollRef.value;
  if (el) el.scrollLeft = el.scrollWidth;
});

const formatDay = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
const cellLabel = (cell: RunDayCell) => (cell.future ? "" : `${formatDay(cell.date)} · ${cell.runCount ? `${cell.runCount} 次通关` : "无记录"}`);
const summaryText = computed(() => (grid.value.totalRuns
  ? `过去一年 ${grid.value.totalRuns} 次通关 · ${grid.value.activeDays} 天有记录`
  : "过去一年暂无通关记录"));
</script>

<template>
  <div class="run-heatmap">
    <p class="run-heatmap-summary">{{ summaryText }}</p>
    <div ref="scrollRef" class="run-heatmap-scroll">
      <div class="run-heatmap-frame">
        <div class="run-heatmap-months" aria-hidden="true">
          <span v-for="label in grid.monthLabels" :key="`${label.week}-${label.label}`" :style="{ gridColumnStart: label.week + 1 }">{{ label.label }}</span>
        </div>
        <div class="run-heatmap-weekdays" aria-hidden="true">
          <span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span></span>
        </div>
        <table class="run-heatmap-grid">
          <caption class="sr-only">过去一年每天的通关次数</caption>
          <tbody>
            <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
              <td
                v-for="cell in row"
                :key="cell.date"
                class="run-heatmap-cell"
                :class="cell.future ? 'is-future' : `level-${cell.level}`"
                :title="cellLabel(cell) || undefined"
                :aria-label="cellLabel(cell) || undefined"
                :aria-hidden="cell.future || undefined"
              ></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="run-heatmap-footer">
      <p class="run-heatmap-note">按通关日期统计，同一次通关只计一次，不代表游玩时长。</p>
      <div class="run-heatmap-legend" aria-hidden="true"><span>少</span><i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i><span>多</span></div>
    </div>
  </div>
</template>

<style scoped>
.run-heatmap { container-type: inline-size; display: grid; gap: var(--space-3); min-width: 0; }
.run-heatmap-summary { margin: 0; color: var(--muted); font-size: var(--type-caption-size); font-weight: 500; }
/* Local horizontal containment for a genuine 53-week data matrix; the grid
   always docks to the most recent weeks. */
.run-heatmap-scroll { overflow-x: auto; scrollbar-width: thin; }
.run-heatmap-frame { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: var(--space-2); width: max-content; }
.run-heatmap-months { display: grid; grid-column: 2; grid-row: 1; grid-template-columns: repeat(53, 0.75rem); gap: 0 0.125rem; margin-bottom: var(--space-1); margin-left: 0.125rem; }
.run-heatmap-months > span { grid-row: 1; overflow: visible; color: var(--quiet); font-size: .7rem; white-space: nowrap; }
.run-heatmap-weekdays { display: grid; grid-column: 1; grid-row: 2; grid-template-rows: repeat(7, 0.75rem); gap: 0.125rem 0; margin-top: 0.125rem; }
.run-heatmap-weekdays > span { display: grid; align-items: center; color: var(--quiet); font-size: .7rem; line-height: 1; }
.run-heatmap-grid { grid-column: 2; grid-row: 2; border-collapse: separate; border-spacing: 0.125rem; }
.run-heatmap-cell { width: 0.75rem; height: 0.75rem; padding: 0; background: var(--surface-raised); box-shadow: inset 0 0 0 1px var(--line); }
.run-heatmap-cell.is-future { background: transparent; box-shadow: none; }
.level-0 { background: var(--surface-raised); }
.level-1 { background: color-mix(in oklch, var(--accent) 28%, var(--surface)); }
.level-2 { background: color-mix(in oklch, var(--accent) 50%, var(--surface)); }
.level-3 { background: color-mix(in oklch, var(--accent) 75%, var(--surface)); }
.level-4 { background: var(--accent); }
.run-heatmap-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); }
.run-heatmap-note { margin: 0; color: var(--quiet); font-size: .72rem; }
.run-heatmap-legend { display: flex; align-items: center; gap: var(--space-1); color: var(--quiet); font-size: .72rem; }
.run-heatmap-legend i { width: 0.75rem; height: 0.75rem; box-shadow: inset 0 0 0 1px var(--line); }
</style>
