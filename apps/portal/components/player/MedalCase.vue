<script setup lang="ts">
import type { LeaderboardEntryTitle } from "@owbastion/contracts";

// A compact medal wall of a Player's earned achievements: one shelf, small medals, shine on every one.
const props = defineProps<{ titles: LeaderboardEntryTitle[] }>();

const SHOW = 16;
const expanded = ref(false);
const shown = computed(() => expanded.value ? props.titles : props.titles.slice(0, SHOW));
</script>

<template>
  <AchievementWall class="case">
    <p class="case__count num"><b>{{ titles.length }}</b>枚</p>
    <ul v-if="titles.length" class="case__shelf">
      <li v-for="(title, index) in shown" :key="title.titleKey" class="case__medal" :title="title.label">
        <AchievementIcon :url="title.iconUrl" :icon="title.icon" earned entrance :shine-delay="index * .35" />
        <span class="case__name">{{ title.label }}</span>
      </li>
      <li v-if="titles.length > SHOW && !expanded" class="case__medal">
        <button type="button" class="case__more num" @click="expanded = true">+{{ titles.length - SHOW }}</button>
      </li>
    </ul>
    <p v-else class="case__empty">还没有勋章</p>
  </AchievementWall>
</template>

<style scoped>
.case { gap: var(--space-4); padding-block: var(--space-5) var(--space-3); }
.case__count { display: flex; align-items: baseline; gap: var(--space-1); margin: 0; color: var(--quiet); font-size: var(--type-label-sm-size); }
.case__count b { color: var(--text); font-family: var(--font-display); font-size: 2rem; line-height: 1; }
.case__shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.25rem, 1fr)); gap: var(--space-2) 0; margin: 0; padding: 0 0 var(--space-3); border-bottom: 2px solid color-mix(in oklch, var(--line-strong) 80%, var(--accent)); list-style: none; }
.case__medal { --achievement-icon-size: 3.25rem; display: grid; justify-items: center; gap: var(--space-1); min-width: 0; padding-top: var(--space-2); }
.case__name { overflow: hidden; max-width: 100%; color: var(--muted); font-size: .6875rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.case__more { display: grid; place-items: center; width: var(--achievement-icon-size); height: var(--achievement-icon-size); border: 1px dashed var(--line-strong); border-radius: 50%; background: none; color: var(--muted); font-family: var(--font-display); font-size: var(--type-label-sm-size); font-weight: 700; cursor: pointer; }
.case__more:hover { border-color: var(--accent); color: var(--accent); }
.case__empty { margin: 0; padding-block: var(--space-4); color: var(--quiet); font-size: var(--type-body-sm-size); }
</style>
