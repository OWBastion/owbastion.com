<script setup lang="ts">
defineProps<{ url?: string | null; icon: string; earned: boolean; entrance?: boolean }>();
</script>

<template>
  <span class="achievement-icon" :class="{ 'is-earned': earned, 'is-entering': entrance, 'has-art': url }" aria-hidden="true">
    <img v-if="url" :src="url" alt="" />
    <UIcon v-else :name="`i-lucide-${icon}`" />
  </span>
</template>

<style scoped>
/* Uploaded art carries its own badge frame, so it stands alone; only the fallback glyph gets a thin ring. */
.achievement-icon { --size: var(--achievement-icon-size, 4rem); --ring: var(--line-strong); position: relative; display: grid; width: var(--size); height: var(--size); place-items: center; color: var(--quiet); font-size: calc(var(--size) * .42); transition: transform 320ms cubic-bezier(.34, 1.56, .64, 1); }
.achievement-icon::before { position: absolute; inset: 0; border: 1px dashed var(--ring); border-radius: 50%; content: ""; transition: transform 320ms cubic-bezier(.34, 1.56, .64, 1), border-color 200ms ease; }
.achievement-icon img, .achievement-icon :deep(svg) { position: relative; filter: grayscale(1); opacity: .45; transition: filter 200ms ease, opacity 200ms ease; }
.achievement-icon img { width: 100%; height: 100%; object-fit: contain; }
.achievement-icon.has-art::before { display: none; }
.achievement-icon.is-earned { --ring: color-mix(in oklch, var(--accent) 45%, transparent); color: var(--accent); }
.achievement-icon.is-earned::before { border-style: solid; }
.achievement-icon.is-earned img, .achievement-icon.is-earned :deep(svg) { filter: none; opacity: 1; }
.achievement-icon.is-entering { animation: icon-pop 520ms cubic-bezier(.34, 1.56, .64, 1) both; }
.achievement-icon.is-entering.is-earned::before { animation: ring-pulse 900ms 180ms ease-out both; }
@keyframes icon-pop { from { opacity: 0; transform: scale(.6) rotate(-8deg); } }
@keyframes ring-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 45%, transparent); } 100% { box-shadow: 0 0 0 1.25rem transparent; } }
@media (prefers-reduced-motion: reduce) {
  .achievement-icon, .achievement-icon::before, .achievement-icon img, .achievement-icon :deep(svg) { transition: none; }
  .achievement-icon.is-entering, .achievement-icon.is-entering.is-earned::before { animation: none; }
}
</style>
