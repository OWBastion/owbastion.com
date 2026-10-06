<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";

export type ProfileStat = { label: string; value: string; unit?: string };

defineProps<{ playerName: string; playerId: string; equippedTitles: OwnedTitle[]; titlesReady: boolean; stats: ProfileStat[] }>();
const emit = defineEmits<{ inspect: [title: OwnedTitle] }>();
</script>

<template>
  <section class="profile-hero surface-card elevation-2" aria-labelledby="profile-title">
    <div class="profile-hero__main">
      <span class="profile-hero__avatar" aria-hidden="true">{{ playerName.slice(0, 1) }}</span>
      <h1 id="profile-title" class="profile-hero__name"><PlayerBattleTag :player-name="playerName" :player-id="playerId" /></h1>
      <ul v-if="equippedTitles.length" class="profile-hero__titles" aria-label="佩戴称号">
        <li v-for="title in equippedTitles" :key="title.grantId"><PlayerTitleBadge :title="title" @inspect="emit('inspect', $event)" /></li>
      </ul>
      <p v-else-if="titlesReady" class="profile-hero__empty">还没有佩戴称号。<NuxtLink to="/achievements">去佩戴</NuxtLink></p>
    </div>
    <dl class="profile-hero__stats">
      <div v-for="stat in stats" :key="stat.label" class="profile-hero__stat">
        <dt>{{ stat.label }}</dt>
        <dd class="num">{{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small></dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.profile-hero { container-type: inline-size; display: grid; gap: var(--space-6); padding: clamp(var(--space-5), 4vw, var(--space-8)); background: radial-gradient(120% 140% at 0% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 58%), var(--surface); }
.profile-hero__main { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "avatar name" "avatar titles"; align-items: center; gap: var(--space-3) var(--space-5); min-width: 0; }
.profile-hero__avatar { grid-area: avatar; align-self: start; display: grid; flex: 0 0 auto; width: 5rem; height: 5rem; place-items: center; border: 2px solid var(--accent); border-radius: 50%; color: var(--accent); background: var(--accent-surface); box-shadow: 0 0 1.5rem color-mix(in oklch, var(--accent) 30%, transparent); font-size: 2rem; font-weight: 700; }
.profile-hero__name { grid-area: name; min-width: 0; margin: 0; font-size: var(--type-title-size); font-weight: 700; letter-spacing: var(--type-title-tracking); line-height: var(--type-title-leading); }
.profile-hero__titles { grid-area: titles; display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.profile-hero__titles > li { min-width: 0; max-width: 100%; }
.profile-hero__empty { grid-area: titles; margin: 0; color: var(--muted); font-size: var(--type-body-sm-size); }
.profile-hero__empty a { color: var(--accent); font-weight: 600; }
.profile-hero__stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--line); }
.profile-hero__stat { display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); background: var(--surface); }
.profile-hero__stat dd { margin: 0; color: var(--text); font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.profile-hero__stat small { margin-left: var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.profile-hero__stat dt { color: var(--muted); font-size: var(--type-label-sm-size); }
.profile-hero__stat { grid-template-areas: "value" "label"; }
.profile-hero__stat dd { grid-area: value; }
.profile-hero__stat dt { grid-area: label; }
@container (max-width: 35.99rem) {
  .profile-hero__main { grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "avatar name" "titles titles"; }
  .profile-hero__avatar { width: 3.5rem; height: 3.5rem; align-self: center; font-size: 1.4rem; }
  .profile-hero__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (prefers-contrast: more) { .profile-hero__avatar, .profile-hero__stats { border-color: var(--text); } }
</style>
