<script setup lang="ts">
import type { AdminMapEditorChallengeOption } from "~/composables/useAdminMapEditor";
import {
  enabledCount,
  groupHonors,
  optionKey,
  recommendedAssignments,
  setHonorEnabled,
  setOptionsEnabled,
  type MapAssignments,
  type MapHonor,
  type MapHonorKind,
} from "~/utils/map-honors";

const props = defineProps<{
  catalog: AdminMapEditorChallengeOption[];
  assignments: MapAssignments;
  mapVariant: "classic" | null;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:assignments": [value: MapAssignments] }>();

const honors = computed(() => groupHonors(props.catalog));
const familyLabels = { map_challenge: "地图挑战", map_title_rule: "称号", title_challenge: "称号挑战" } as const;
const icons: Record<MapHonorKind, string> = {
  conqueror: "i-lucide-swords",
  dominator: "i-lucide-crown",
  pioneer: "i-lucide-flag",
  classic: "i-lucide-medal",
  other: "i-lucide-trophy",
};
const hints: Partial<Record<MapHonorKind, string>> = {
  pioneer: "限时：只在称号规则设定的有效期内出现",
  classic: "经典版自定义称号",
};
// The veteran honor only makes sense on a classic revision; surface that rather than hiding it.
const unavailable = (honor: MapHonor) => honor.kind === "classic" && props.mapVariant !== "classic";

const toggle = (honor: MapHonor) => emit("update:assignments", setHonorEnabled(props.assignments, honor, enabledCount(honor, props.assignments) === 0));
const toggleItem = (option: AdminMapEditorChallengeOption, enabled: boolean) => emit("update:assignments", setOptionsEnabled(props.assignments, [option], enabled));
const applyRecommended = () => emit("update:assignments", recommendedAssignments(props.assignments, honors.value, props.mapVariant));
</script>

<template>
  <div class="honors">
    <div class="honors__head">
      <p>打开一个称号，就同时打开它对应的地图挑战和称号规则。</p>
      <UButton v-if="honors.length" size="sm" color="neutral" variant="outline" label="套用推荐" :disabled="disabled" @click="applyRecommended" />
    </div>
    <p v-if="!honors.length" class="honors__empty">这张地图还没有可关联的成就或称号。规则在「成就与称号」模块里维护。</p>
    <ul v-else class="honors__list">
      <li v-for="honor in honors" :key="honor.key" class="honor" :class="{ 'honor--on': enabledCount(honor, assignments) > 0 && !unavailable(honor), 'honor--na': unavailable(honor) }">
        <div class="honor__head">
          <span class="honor__icon"><UIcon :name="icons[honor.kind]" aria-hidden="true" /></span>
          <div class="honor__text">
            <strong>{{ honor.name }}</strong>
            <span>{{ unavailable(honor) ? "此修订不是经典版，不适用" : (hints[honor.kind] ?? `${honor.items.length} 项关联`) }}</span>
          </div>
          <USwitch :model-value="enabledCount(honor, assignments) > 0" :aria-label="honor.name" :disabled="disabled || unavailable(honor)" @update:model-value="toggle(honor)" />
        </div>
        <ul v-if="enabledCount(honor, assignments) > 0 && !unavailable(honor)" class="honor__items">
          <li v-for="option in honor.items" :key="optionKey(option)">
            <UCheckbox :model-value="assignments[optionKey(option)]?.enabled === true" :disabled="disabled" :label="`${familyLabels[option.challengeFamily]} · ${option.label}`" @update:model-value="toggleItem(option, Boolean($event))" />
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.honors, .honors__list { display: grid; gap: 0.75rem; min-width: 0; padding: 0; margin: 0; list-style: none; }
.honors__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
.honors__head p, .honors__empty { margin: 0; color: var(--muted); font-size: 0.875rem; }
.honor { border: 1.5px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.honor--on { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); }
.honor--na { opacity: 0.55; }
.honor__head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.875rem; align-items: center; padding: 0.75rem 0.875rem; }
.honor__icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: var(--radius-control); background: var(--surface-raised); color: var(--muted); font-size: 1.25rem; }
.honor--on .honor__icon { background: var(--accent-surface); color: var(--accent); }
.honor__text { display: grid; min-width: 0; }
.honor__text span { color: var(--muted); font-size: var(--type-caption-size); }
.honor__items { display: grid; gap: 0.5rem; padding: 0.75rem 0.875rem 0.875rem 4.2rem; margin: 0; list-style: none; border-top: 1px solid var(--line); }
</style>
