<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";
import { draftedFields, type EventDraft, type EventPatch } from "~/utils/event-draft";
import { formatProbability } from "~/utils/event-probabilities";

export type EventSortKey = "name" | "weight" | "probability" | "gameVersion";
export type EventSort = { key: EventSortKey; dir: 1 | -1 };

const props = defineProps<{
  events: RandomEvent[];
  draft: EventDraft;
  base: ReadonlyMap<string, number>;
  next: ReadonlyMap<string, number>;
  suspended: ReadonlySet<string>;
  groups: string[];
  versions: string[];
}>();
const emit = defineEmits<{ stage: [eventId: string, patch: EventPatch]; open: [eventId: string] }>();
const selected = defineModel<string[]>("selected", { default: () => [] });
const sort = defineModel<EventSort>("sort", { required: true });

const statusLabels = { implemented: "已实装", development: "开发中", removed: "已移除" } as const;
const categoryTone = (category: string) => category === "减益" ? "is-error" : category === "增益" ? "is-success" : category === "机制" ? "is-info" : "";
const maxProbability = computed(() => Math.max(0, ...props.next.values()));
const allSelected = computed(() => props.events.length > 0 && props.events.every((event) => selected.value.includes(event.eventId)));
const toggleAll = (on: boolean) => { selected.value = on ? [...new Set([...selected.value, ...props.events.map((event) => event.eventId)])] : selected.value.filter((id) => !props.events.some((event) => event.eventId === id)); };
const toggleOne = (id: string, on: boolean) => { selected.value = on ? [...selected.value, id] : selected.value.filter((item) => item !== id); };
const sortBy = (key: EventSortKey) => { sort.value = sort.value.key === key ? { key, dir: sort.value.dir === 1 ? -1 : 1 } : { key, dir: key === "weight" || key === "probability" ? -1 : 1 }; };
const ariaSort = (key: EventSortKey) => sort.value.key === key ? (sort.value.dir === 1 ? "ascending" : "descending") : "none";
const arrow = (key: EventSortKey) => sort.value.key === key ? (sort.value.dir === 1 ? "▲" : "▼") : "";
const delta = (id: string) => {
  const before = props.base.get(id) ?? 0, after = props.next.get(id) ?? 0, change = after - before;
  return Math.abs(change) < 1e-5 ? null : { up: change > 0, text: (Math.abs(change) * 100).toFixed(2) };
};
const groupOptions = (current: string | null) => current && !props.groups.includes(current) ? [...props.groups, current] : props.groups;
const versionOptions = (current: string) => props.versions.includes(current) ? props.versions : [...props.versions, current];
const stageNumber = (event: RandomEvent, raw: string) => emit("stage", event.eventId, { weight: Math.max(0, Number.parseFloat(raw) || 0) });
</script>

<template>
  <div class="event-table">
    <table>
      <thead>
        <tr>
          <th class="event-table__check"><input type="checkbox" :checked="allSelected" aria-label="选择当前列表全部" @change="toggleAll(($event.target as HTMLInputElement).checked)"></th>
          <th :aria-sort="ariaSort('name')"><button type="button" class="event-table__sort" @click="sortBy('name')">事件 {{ arrow("name") }}</button></th>
          <th class="event-table__secondary">事件组</th>
          <th class="event-table__optional">类别</th>
          <th :aria-sort="ariaSort('weight')" class="event-table__weight"><button type="button" class="event-table__sort" @click="sortBy('weight')">权重 {{ arrow("weight") }}</button></th>
          <th :aria-sort="ariaSort('probability')"><button type="button" class="event-table__sort" @click="sortBy('probability')">出现概率 {{ arrow("probability") }}</button></th>
          <th class="event-table__optional" :aria-sort="ariaSort('gameVersion')"><button type="button" class="event-table__sort" @click="sortBy('gameVersion')">版本 {{ arrow("gameVersion") }}</button></th>
          <th class="event-table__secondary">状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in events" :key="event.eventId" :class="{ 'is-selected': selected.includes(event.eventId), 'is-dim': event.releaseStatus !== 'implemented' || suspended.has(event.gameVersion) }">
          <td class="event-table__check"><input type="checkbox" :checked="selected.includes(event.eventId)" :aria-label="`选择 ${event.name}`" @change="toggleOne(event.eventId, ($event.target as HTMLInputElement).checked)"></td>
          <td>
            <div class="event-table__name">
              <button type="button" class="event-table__open" @click="emit('open', event.eventId)">{{ event.name }}</button>
              <UBadge v-if="draftedFields(draft, event.eventId).has('name')" label="已改" color="primary" variant="subtle" size="sm" />
            </div>
          </td>
          <td class="event-table__secondary">
            <select class="native-field event-table__cell" :class="{ 'is-changed': draftedFields(draft, event.eventId).has('eventGroup') }" aria-label="事件组" :value="event.eventGroup ?? ''" @change="emit('stage', event.eventId, { eventGroup: ($event.target as HTMLSelectElement).value || null })">
              <option value="">—</option><option v-for="group in groupOptions(event.eventGroup)" :key="group" :value="group">{{ group }}</option>
            </select>
          </td>
          <td class="event-table__optional" :class="categoryTone(event.category)">{{ event.category }}</td>
          <td class="event-table__weight">
            <input class="native-field event-table__cell event-table__number" :class="{ 'is-changed': draftedFields(draft, event.eventId).has('weight') }" type="number" step="0.05" min="0" aria-label="权重" :value="event.weight ?? ''" @change="stageNumber(event, ($event.target as HTMLInputElement).value)">
          </td>
          <td>
            <div class="event-table__probability">
              <span class="event-table__track"><i :style="{ width: `${next.get(event.eventId) && maxProbability ? Math.max(3, (next.get(event.eventId)! / maxProbability) * 100) : 0}%` }" /></span>
              <b class="num">{{ next.has(event.eventId) ? formatProbability(next.get(event.eventId)!) : "—" }}</b>
              <span v-if="delta(event.eventId)" class="event-table__delta num" :class="delta(event.eventId)!.up ? 'is-up' : 'is-down'"><span class="sr-only">{{ delta(event.eventId)!.up ? "上升" : "下降" }}</span><span aria-hidden="true">{{ delta(event.eventId)!.up ? "▲" : "▼" }}</span> {{ delta(event.eventId)!.text }}</span>
            </div>
          </td>
          <td class="event-table__optional">
            <select class="native-field event-table__cell" :class="{ 'is-changed': draftedFields(draft, event.eventId).has('gameVersion') }" aria-label="版本" :value="event.gameVersion" @change="emit('stage', event.eventId, { gameVersion: ($event.target as HTMLSelectElement).value })">
              <option v-for="version in versionOptions(event.gameVersion)" :key="version" :value="version">{{ version }}</option>
            </select>
          </td>
          <td class="event-table__secondary">
            <select class="native-field event-table__cell" :class="{ 'is-changed': draftedFields(draft, event.eventId).has('releaseStatus') }" aria-label="状态" :value="event.releaseStatus" @change="emit('stage', event.eventId, { releaseStatus: ($event.target as HTMLSelectElement).value as RandomEvent['releaseStatus'] })">
              <option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.event-table { container-type: inline-size; overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
table { width: 100%; border-collapse: collapse; }
th { position: sticky; top: 0; z-index: 1; padding: var(--space-2) var(--space-3); background: var(--surface-raised); border-bottom: 1px solid var(--line); color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 600; text-align: left; white-space: nowrap; }
td { padding: var(--space-1) var(--space-3); border-bottom: 1px solid var(--line); vertical-align: middle; }
tbody tr:hover td { background: color-mix(in oklch, var(--surface-raised) 60%, transparent); }
tbody tr.is-selected td { background: var(--accent-surface); }
tbody tr.is-dim td:not(.event-table__check) { opacity: 0.6; }
.event-table__check { width: 2.5rem; }
.event-table__check input { width: 1rem; height: 1rem; accent-color: var(--accent); }
.event-table__sort { padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.event-table__sort:hover { color: var(--text); }
.event-table__name { display: flex; align-items: center; gap: var(--space-2); min-width: 8rem; }
.event-table__open { padding: 0; border: 0; background: none; color: var(--text); font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
.event-table__open:hover, .event-table__open:focus-visible { color: var(--accent); text-decoration: underline; }
.event-table__cell { width: 100%; min-width: 0; border-color: transparent; background: transparent; }
.event-table__cell:hover { border-color: var(--line-strong); background: var(--surface); }
.event-table__cell.is-changed { border-color: var(--accent); background: var(--accent-surface); font-weight: 600; }
.event-table__number { width: 5rem; text-align: right; font-variant-numeric: tabular-nums; }
.event-table__weight { width: 6.5rem; }
.event-table__probability { display: flex; align-items: center; gap: var(--space-2); min-width: 9rem; }
.event-table__track { flex: 1; min-width: 2rem; height: 0.375rem; overflow: hidden; border-radius: var(--radius-pill); background: var(--line); }
.event-table__track i { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
.event-table__probability b { min-width: 3.5rem; text-align: right; font-weight: 600; }
.event-table__delta { min-width: 3.5rem; font-size: var(--type-caption-size); font-weight: 600; }
.event-table__delta.is-up { color: var(--success); }
.event-table__delta.is-down { color: var(--danger); }
.is-success { color: var(--success); }
.is-error { color: var(--danger); }
.is-info { color: var(--info); }
@container (max-width: 47.99rem) {
  .event-table__optional { display: none; }
  .event-table__probability { min-width: 6rem; }
  .event-table__track { display: none; }
}
/* On a phone the table keeps what is compared (weight, probability); the rest is edited in the sheet. */
@container (max-width: 39.99rem) {
  .event-table__secondary { display: none; }
}
</style>
