<script setup lang="ts">
defineProps<{ url?: string | null; icon: string; earned: boolean; entrance?: boolean; shineDelay?: number }>();
</script>

<template>
  <span class="achievement-icon" :class="{ 'is-earned': earned, 'is-entering': entrance, 'has-art': url }" :style="{ '--shine-delay': shineDelay === undefined ? undefined : `${shineDelay}s` }" aria-hidden="true">
    <img v-if="url" :src="url" alt="" />
    <UIcon v-else :name="`i-lucide-${icon}`" />
    <template v-if="url && earned">
      <span v-for="n in 3" :key="n" class="achievement-icon__sparkle" />
    </template>
  </span>
</template>

<style scoped>
/* Uploaded art carries its own badge frame, so it stands alone; only the fallback glyph gets a thin ring. */
.achievement-icon { --size: var(--achievement-icon-size, 4rem); --ring: var(--line-strong); position: relative; display: grid; width: var(--size); height: var(--size); place-items: center; color: var(--quiet); font-size: calc(var(--size) * .42); transition: transform 320ms cubic-bezier(.34, 1.56, .64, 1); }
.achievement-icon::before { position: absolute; inset: 0; border: 1px dashed var(--ring); border-radius: 50%; content: ""; transition: transform 320ms cubic-bezier(.34, 1.56, .64, 1), border-color 200ms ease; }
.achievement-icon img, .achievement-icon :deep(svg) { position: relative; transition: filter 200ms ease, opacity 200ms ease; }
.achievement-icon img { width: 100%; height: 100%; object-fit: contain; filter: brightness(.2) grayscale(1); opacity: .55; }
.achievement-icon :deep(svg) { opacity: .45; }
.achievement-icon.has-art::before { display: none; }
.achievement-icon.is-earned { --ring: color-mix(in oklch, var(--accent) 45%, transparent); color: var(--accent); }
.achievement-icon.is-earned::before { border-style: solid; }
.achievement-icon.is-earned img { filter: drop-shadow(0 .35rem .5rem rgb(0 0 0 / .45)); opacity: 1; }
.achievement-icon.is-earned :deep(svg) { opacity: 1; }

/* Earned art glows softly from behind and catches a few twinkling glints; delays stagger them across the wall. */
.achievement-icon.has-art.is-earned::before { display: block; inset: -14%; border: 0; background: radial-gradient(closest-side, rgb(255 222 150 / .38), rgb(255 222 150 / .12) 60%, transparent); animation: badge-glow 4.5s var(--shine-delay, 0s) ease-in-out infinite; }
@keyframes badge-glow { 0%, 100% { opacity: .55; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.04); } }
.achievement-icon__sparkle { position: absolute; width: calc(var(--size) * .26); aspect-ratio: 1; background: radial-gradient(closest-side, rgb(255 255 255) 15%, rgb(255 226 150) 45%, rgb(230 165 50)); clip-path: polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%); pointer-events: none; opacity: 0; transform: scale(0); animation: badge-sparkle 3.6s calc(var(--shine-delay, 0s) + var(--offset)) ease-in-out infinite; }
.achievement-icon__sparkle:nth-of-type(1) { --offset: 0s; top: 2%; left: 10%; }
.achievement-icon__sparkle:nth-of-type(2) { --offset: 1.2s; top: 24%; right: 2%; width: calc(var(--size) * .18); }
.achievement-icon__sparkle:nth-of-type(3) { --offset: 2.3s; bottom: 8%; left: 56%; width: calc(var(--size) * .21); }
@keyframes badge-sparkle { 0%, 60%, 100% { opacity: 0; transform: scale(0) rotate(-90deg); } 70% { opacity: 1; transform: scale(1) rotate(0); } 82% { opacity: 0; transform: scale(.2) rotate(45deg); } }

.achievement-icon.is-entering { animation: icon-pop 520ms cubic-bezier(.34, 1.56, .64, 1) both; }
.achievement-icon.is-entering.is-earned:not(.has-art)::before { animation: ring-pulse 900ms 180ms ease-out both; }
@keyframes icon-pop { from { opacity: 0; transform: scale(.6) rotate(-8deg); } }
@keyframes ring-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 45%, transparent); } 100% { box-shadow: 0 0 0 1.25rem transparent; } }
@media (prefers-reduced-motion: reduce) {
  .achievement-icon, .achievement-icon::before, .achievement-icon img, .achievement-icon :deep(svg) { transition: none; }
  .achievement-icon.is-entering, .achievement-icon.is-entering.is-earned::before { animation: none; }
  .achievement-icon.has-art.is-earned::before { animation: none; }
  .achievement-icon__sparkle { display: none; }
}
</style>
