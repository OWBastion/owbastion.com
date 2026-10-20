<script setup lang="ts">
defineProps<{ name: string; iconUrl?: string | null; icon: string; earned: boolean; checked?: boolean; checkLabel?: string; highlighted?: boolean; shineDelay?: number }>();
</script>

<template>
  <button type="button" class="medal" :class="{ 'is-earned': earned, 'is-highlighted': highlighted }">
    <AchievementIcon :url="iconUrl" :icon="icon" :earned="earned" :shine-delay="shineDelay" />
    <span class="medal__name">{{ name }}</span>
    <UIcon v-if="checked" name="i-lucide-check" class="medal__check" :aria-label="checkLabel" />
  </button>
</template>

<style scoped>
.medal { --achievement-icon-size: clamp(5.5rem, 24vw, 7rem); position: relative; display: grid; justify-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-1) var(--space-2); border: 0; background: none; color: var(--quiet); cursor: pointer; }
/* A soft floor shadow seats each badge on the shelf. */
.medal::before { position: absolute; top: calc(var(--space-3) + var(--achievement-icon-size) - .35rem); left: 50%; width: calc(var(--achievement-icon-size) * .7); height: .6rem; border-radius: 50%; background: radial-gradient(closest-side, rgb(0 0 0 / .45), transparent); content: ""; transform: translateX(-50%); transition: opacity 200ms ease, transform 320ms cubic-bezier(.34, 1.56, .64, 1); }
.medal:not(.is-earned)::before { opacity: .4; }
.medal.is-earned { color: var(--text); }
.medal:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-card); }
.medal__name { overflow: hidden; max-width: 100%; font-size: var(--type-body-sm-size); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.medal.is-highlighted .medal__name { color: var(--accent); }
.medal__check { position: absolute; top: var(--space-2); right: calc(50% - var(--achievement-icon-size) / 2 - .25rem); padding: .15rem; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: .75rem; }
.medal:hover :deep(.achievement-icon), .medal:focus-visible :deep(.achievement-icon) { transform: translateY(-4px) scale(1.06); }
.medal:hover::before, .medal:focus-visible::before { opacity: .6; transform: translateX(-50%) scale(.8); }
.medal:hover :deep(.achievement-icon__sparkle), .medal:focus-visible :deep(.achievement-icon__sparkle) { animation-duration: 1.4s; }
.medal:not(.is-earned):hover :deep(.achievement-icon img) { opacity: .8; }
@media (prefers-reduced-motion: reduce) { .medal::before, .medal :deep(.achievement-icon) { transition: none; transform: none !important; } }
</style>
