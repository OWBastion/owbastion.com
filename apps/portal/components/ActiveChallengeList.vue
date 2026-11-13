<script setup lang="ts">
import type { ActiveChallenge } from "@owbastion/contracts";

const props = withDefaults(defineProps<{ kind?: ActiveChallenge["kind"]; heading?: boolean }>(), { kind: undefined, heading: true });
const { items, now } = useActiveChallenges();
const shown = computed(() => items.value.filter((item) => !props.kind || item.kind === props.kind));
const target = (item: ActiveChallenge) => item.kind === "pioneer" ? { path: "/maps", query: { mapId: item.mapId } } : { path: "/achievements" };
</script>

<template>
  <section v-if="shown.length" class="active-challenges" aria-labelledby="active-challenges-title">
    <h2 id="active-challenges-title" :class="heading ? 'active-challenges__title' : 'sr-only'">进行中的挑战</h2>
    <ul class="active-challenges__list">
      <li v-for="item in shown" :key="item.kind === 'pioneer' ? `${item.titleKey}:${item.mapId}` : item.challengeId">
        <NuxtLink :to="target(item)" class="active-challenges__item interactive-card pressable-soft">
          <UIcon :name="item.kind === 'pioneer' ? 'i-lucide-flag' : 'i-lucide-award'" aria-hidden="true" />
          <span class="active-challenges__name">{{ item.titleName }}<small v-if="item.kind === 'pioneer'">{{ item.mapName }}</small></span>
          <span class="active-challenges__time num">{{ remainingLabel(item.endsAt, now.getTime()) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.active-challenges { display: grid; gap: var(--space-3); width: min(100%, 48rem); }
.active-challenges__title { margin: 0; font-size: var(--type-label-sm-size); font-weight: 700; color: var(--muted); }
.active-challenges__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.active-challenges__item { display: flex; align-items: center; gap: var(--space-3); min-height: var(--control-lg); padding: var(--space-3) var(--space-4); border-radius: var(--radius-card); color: var(--text); text-decoration: none; }
.active-challenges__item:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.active-challenges__name { display: grid; flex: 1; min-width: 0; font-weight: 600; }
.active-challenges__name small { overflow: hidden; color: var(--quiet); font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
.active-challenges__time { padding: .15rem .5rem; border-radius: var(--radius-control); color: var(--text); background: var(--accent-surface); font-size: .8125rem; font-weight: 700; white-space: nowrap; }
</style>
