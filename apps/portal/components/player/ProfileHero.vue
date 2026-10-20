<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";
import type { ProfileStat } from "./StatSheet.vue";

defineProps<{ playerName: string; playerId: string; equippedTitles: OwnedTitle[]; titlesReady: boolean; stats: ProfileStat[] }>();
</script>

<template>
  <section class="profile-hero" aria-labelledby="profile-title">
    <div class="profile-hero__main">
      <span class="profile-hero__avatar font-display" aria-hidden="true">{{ playerName.slice(0, 1) }}</span>
      <h1 id="profile-title" class="profile-hero__name"><PlayerBattleTag :player-name="playerName" :player-id="playerId" /></h1>
      <NuxtLink v-if="titlesReady" to="/me/achievements" class="profile-hero__titles" :aria-label="equippedTitles.length ? `佩戴称号：${equippedTitles.map((title) => title.label).join('、')}` : '去佩戴称号'">
        <span v-for="title in equippedTitles" :key="title.grantId" class="profile-hero__title"><PlayerTitleMark :title="title" />{{ title.label }}</span>
        <span v-if="!equippedTitles.length" class="profile-hero__empty">+ 佩戴称号</span>
      </NuxtLink>
    </div>
    <div v-if="$slots.settings" class="profile-hero__settings"><slot name="settings" /></div>
    <dl class="profile-hero__stats">
      <div v-for="stat in stats" :key="stat.label"><dt>{{ stat.label }}</dt><dd class="num">{{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small></dd></div>
    </dl>
  </section>
</template>

<style scoped>
.profile-hero { position: relative; container-type: inline-size; display: grid; gap: var(--space-6); padding: clamp(var(--space-5), 4vw, var(--space-12)); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sheet); background: radial-gradient(70% 140% at 0% 0%, color-mix(in oklch, var(--accent) 18%, transparent), transparent 60%), linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 2rem 2rem, linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 2rem 2rem, var(--surface); }
.profile-hero::after { position: absolute; top: 0; right: 0; width: 40%; height: 3px; background: linear-gradient(90deg, transparent, var(--accent)); content: ""; }
.profile-hero__main { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "avatar name" "avatar titles"; align-items: center; gap: var(--space-2) var(--space-6); min-width: 0; }
.profile-hero__avatar { grid-area: avatar; display: grid; width: 7rem; height: 7rem; place-items: center; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: radial-gradient(circle at 50% 30%, color-mix(in oklch, var(--accent) 60%, transparent), transparent 75%), var(--accent-surface); color: var(--accent); font-size: 3rem; font-weight: 700; }
.profile-hero__name { grid-area: name; min-width: 0; padding-inline-end: var(--space-8); margin: 0; font-family: var(--font-display); font-size: clamp(2rem, 6cqi, 3.5rem); font-weight: 700; letter-spacing: -.02em; line-height: 1.05; overflow-wrap: anywhere; }
.profile-hero__settings { position: absolute; top: var(--space-4); right: var(--space-4); }
.profile-hero__titles { grid-area: titles; display: flex; flex-wrap: wrap; justify-self: start; gap: var(--space-2) var(--space-4); margin-top: var(--space-2); color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 600; text-decoration: none; }
.profile-hero__titles:hover { color: var(--text); }
.profile-hero__title { --mark-size: 1.5rem; display: inline-flex; align-items: center; gap: var(--space-2); }
.profile-hero__empty { color: var(--accent); }
.profile-hero__stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.profile-hero__stats > div { display: grid; gap: 2px; padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); background: color-mix(in oklch, var(--page) 60%, var(--surface)); }
.profile-hero__stats dt { order: 2; color: var(--quiet); font-size: var(--type-caption-size); }
.profile-hero__stats dd { order: 1; margin: 0; font-family: var(--font-display); font-size: clamp(1.5rem, 4cqi, 2.25rem); font-weight: 700; line-height: 1.1; }
.profile-hero__stats small { margin-left: var(--space-1); color: var(--quiet); font-family: var(--font-sans, inherit); font-size: var(--type-caption-size); font-weight: 500; }
@container (max-width: 35.99rem) {
  .profile-hero__main { grid-template-areas: "avatar name" "titles titles"; gap: var(--space-2) var(--space-4); }
  .profile-hero__avatar { width: 4.5rem; height: 4.5rem; font-size: 2rem; }
  .profile-hero__stats dd { font-size: 1.375rem; }
}
@media (prefers-contrast: more) { .profile-hero { border-color: var(--text); } }
</style>
