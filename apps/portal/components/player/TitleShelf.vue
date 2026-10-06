<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";
import { titleTier, titleTierLabel, type TitleTier } from "~/utils/title-tier";

const props = defineProps<{ titles: OwnedTitle[] }>();
const emit = defineEmits<{ inspect: [title: OwnedTitle] }>();

const COLLAPSED_COUNT = 8;
const MAP_SERIES = "地图称号";
const tierOrder: TitleTier[] = ["dominator", "conqueror", "pioneer", "general"];
const expanded = shallowRef(new Set<string>());

const series = computed(() => {
  const groups = new Map<string, OwnedTitle[]>();
  for (const title of props.titles) {
    const key = title.scope === "map" ? MAP_SERIES : title.category || "其他";
    groups.set(key, [...(groups.get(key) ?? []), title]);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({
      name,
      items: [...items].sort((left, right) => tierOrder.indexOf(titleTier(left)) - tierOrder.indexOf(titleTier(right)) || right.grantedAt - left.grantedAt),
    }))
    .sort((left, right) => Number(right.name === MAP_SERIES) - Number(left.name === MAP_SERIES) || right.items.length - left.items.length);
});

const breakdown = (items: OwnedTitle[]) => tierOrder
  .filter((tier) => tier !== "general")
  .map((tier) => ({ tier, count: items.filter((title) => titleTier(title) === tier).length }))
  .filter((entry) => entry.count)
  .map((entry) => `${titleTierLabel[entry.tier].replace("槽位", "")} ${entry.count}`)
  .join(" · ");

const visibleItems = (name: string, items: OwnedTitle[]) => expanded.value.has(name) ? items : items.slice(0, COLLAPSED_COUNT);
function toggle(name: string) {
  const next = new Set(expanded.value);
  if (next.has(name)) next.delete(name); else next.add(name);
  expanded.value = next;
}
</script>

<template>
  <div class="title-shelf">
    <section v-for="group in series" :key="group.name" class="title-shelf__series surface-card" :aria-label="group.name">
      <header class="title-shelf__header">
        <h3 class="card-heading">{{ group.name }}</h3>
        <span class="title-shelf__count num">{{ group.items.length }} 个<template v-if="breakdown(group.items) && group.name === MAP_SERIES"> · {{ breakdown(group.items) }}</template></span>
      </header>
      <ul class="title-shelf__tiles">
        <li v-for="title in visibleItems(group.name, group.items)" :key="title.grantId"><PlayerTitleBadge :title="title" variant="tile" @inspect="emit('inspect', $event)" /></li>
      </ul>
      <UButton v-if="group.items.length > COLLAPSED_COUNT" :label="expanded.has(group.name) ? '收起' : `展开全部 ${group.items.length} 个`" color="neutral" variant="ghost" size="sm" :aria-expanded="expanded.has(group.name)" class="title-shelf__toggle" @click="toggle(group.name)" />
    </section>
  </div>
</template>

<style scoped>
.title-shelf { display: grid; gap: var(--space-3); }
.title-shelf__series { container-type: inline-size; display: grid; gap: var(--space-3); min-width: 0; padding: var(--space-4); }
.title-shelf__header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); min-width: 0; }
.title-shelf__header h3 { margin: 0; }
.title-shelf__count { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; text-align: right; }
.title-shelf__tiles { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.title-shelf__toggle { justify-self: start; }
@container (max-width: 23.99rem) {
  .title-shelf__header { flex-direction: column; gap: var(--space-1); }
  .title-shelf__count { text-align: left; }
}
</style>
