<script setup lang="ts">
import type { MapGoal } from "~/utils/map-progress";

defineProps<{ goals: MapGoal[] }>();
</script>

<template>
  <ul class="next-goals">
    <li v-for="goal in goals" :key="goal.mapId">
      <NuxtLink :to="`/maps?mapId=${encodeURIComponent(goal.mapId)}`" class="next-goal surface-card interactive-card pressable-soft">
        <span class="next-goal__map">{{ goal.mapName }}</span>
        <strong class="next-goal__name card-heading">{{ goal.next.name }}</strong>
        <span class="next-goal__bar" role="img" :aria-label="`已获得 ${goal.earned} / ${goal.total}`">
          <i v-for="step in goal.total" :key="step" :class="{ 'is-earned': step <= goal.earned }" />
        </span>
        <span class="next-goal__need">还差 <b class="num">{{ goal.total - goal.earned }}</b> 个</span>
      </NuxtLink>
    </li>
  </ul>
</template>

<style scoped>
.next-goals { container-type: inline-size; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.next-goals > li { min-width: 0; }
.next-goal { display: grid; gap: var(--space-2); min-width: 0; padding: var(--space-4); color: inherit; text-decoration: none; }
.next-goal__map { color: var(--muted); font-size: var(--type-label-sm-size); }
.next-goal__name { overflow-wrap: anywhere; }
.next-goal__bar { display: flex; gap: var(--space-1); margin-block: var(--space-1); }
.next-goal__bar i { flex: 1; height: 0.375rem; border-radius: var(--radius-pill); background: var(--line); }
.next-goal__bar i.is-earned { background: var(--accent); }
.next-goal__need { color: var(--muted); font-size: var(--type-body-sm-size); }
.next-goal__need b { color: var(--text); font-weight: 600; }
</style>
