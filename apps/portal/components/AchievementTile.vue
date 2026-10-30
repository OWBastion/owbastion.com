<script setup lang="ts">
import { type AchievementAvailability, availabilityIcon, availabilityLabel } from "~/utils/achievement-availability";

defineProps<{ name: string; iconUrl?: string | null; icon: string; earned: boolean; availability?: AchievementAvailability; retiredVersion?: string | null; checked?: boolean; checkLabel?: string; highlighted?: boolean; shineDelay?: number }>();
</script>

<template>
  <button type="button" class="medal" :class="{ 'is-earned': earned, 'is-highlighted': highlighted }">
    <AchievementIcon :url="iconUrl" :icon="icon" :earned="earned" :shine-delay="shineDelay" />
    <span class="medal__name">{{ name }}</span>
    <span v-if="availability === 'sunsetting' && retiredVersion" class="medal__caption">{{ retiredVersion }}</span>
    <span v-if="availability" class="medal__status" :class="`medal__status--${availability}`" role="img" :aria-label="availabilityLabel[availability]" :title="availabilityLabel[availability]"><UIcon :name="availabilityIcon[availability]" /></span>
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
.medal__caption { margin-top: calc(var(--space-2) * -1); color: var(--warning); font-size: var(--type-label-sm-size); font-variant-numeric: tabular-nums; }
/* Mirrors the check mark across the icon; colour and glyph, not words, carry the status. */
.medal__status { position: absolute; top: calc(var(--space-3) + var(--achievement-icon-size) - 1.6rem); left: calc(50% - var(--achievement-icon-size) / 2); display: grid; width: 1.5rem; height: 1.5rem; place-items: center; border: 1px solid var(--line-strong); border-radius: 50%; background: var(--surface); color: var(--muted); font-size: .875rem; }
.medal__status--sunsetting { border-color: var(--warning); color: var(--warning); }
.medal.is-highlighted .medal__name { color: var(--accent); }
.medal__check { position: absolute; top: var(--space-2); right: calc(50% - var(--achievement-icon-size) / 2 - .25rem); padding: .15rem; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: .75rem; }
.medal:hover :deep(.achievement-icon), .medal:focus-visible :deep(.achievement-icon) { transform: translateY(-4px) scale(1.06); }
.medal:hover::before, .medal:focus-visible::before { opacity: .6; transform: translateX(-50%) scale(.8); }
.medal:hover :deep(.achievement-icon__sparkle), .medal:focus-visible :deep(.achievement-icon__sparkle) { animation-duration: 1.4s; }
.medal:not(.is-earned):hover :deep(.achievement-icon img) { opacity: .8; }
@media (prefers-reduced-motion: reduce) { .medal::before, .medal :deep(.achievement-icon) { transition: none; transform: none !important; } }
</style>
