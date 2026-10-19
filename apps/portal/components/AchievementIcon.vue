<script setup lang="ts">
defineProps<{ url?: string | null; icon: string; earned: boolean; entrance?: boolean; shineDelay?: number }>();
</script>

<template>
  <span class="achievement-icon" :class="{ 'is-earned': earned, 'is-entering': entrance, 'has-art': url }" :style="{ '--shine-delay': shineDelay === undefined ? undefined : `${shineDelay}s`, '--art': url ? `url(${JSON.stringify(url)})` : undefined }" aria-hidden="true">
    <img v-if="url" :src="url" alt="" />
    <UIcon v-else :name="`i-lucide-${icon}`" />
    <span v-if="earned" class="achievement-icon__shine" />
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

/* A diagonal light band crosses the badge from top-left to bottom-right, then rests; delays stagger it across the wall.
   The badge art itself masks the band (the CDN must send CORS headers), so light only lands on the medal. */
.achievement-icon__shine { position: absolute; inset: 0; overflow: hidden; border-radius: 50%; pointer-events: none; mix-blend-mode: screen; }
.has-art .achievement-icon__shine { border-radius: 0; mask: var(--art) center / contain no-repeat; }
.achievement-icon__shine::before { position: absolute; inset: -50%; background: linear-gradient(135deg, transparent 38%, rgb(255 244 214 / .2) 44%, rgb(255 252 240 / .95) 49%, rgb(255 244 214 / .2) 53%, transparent 56%, rgb(255 250 235 / .5) 58%, transparent 60%); content: ""; transform: translate(-50%, -50%); animation: badge-shine 7s var(--shine-delay, 0s) ease-in-out infinite; }
@keyframes badge-shine { 0% { transform: translate(-50%, -50%); } 16%, 100% { transform: translate(50%, 50%); } }
@keyframes badge-shine-once { from { transform: translate(-50%, -50%); } to { transform: translate(50%, 50%); } }
.achievement-icon.is-entering .achievement-icon__shine::before { animation: badge-shine-once 900ms 350ms ease-out both; }

.achievement-icon.is-entering { animation: icon-pop 520ms cubic-bezier(.34, 1.56, .64, 1) both; }
.achievement-icon.is-entering.is-earned::before { animation: ring-pulse 900ms 180ms ease-out both; }
@keyframes icon-pop { from { opacity: 0; transform: scale(.6) rotate(-8deg); } }
@keyframes ring-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 45%, transparent); } 100% { box-shadow: 0 0 0 1.25rem transparent; } }
@media (prefers-reduced-motion: reduce) {
  .achievement-icon, .achievement-icon::before, .achievement-icon img, .achievement-icon :deep(svg) { transition: none; }
  .achievement-icon.is-entering, .achievement-icon.is-entering.is-earned::before { animation: none; }
  .achievement-icon__shine { display: none; }
}
</style>
