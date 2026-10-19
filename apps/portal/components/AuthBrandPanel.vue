<script setup lang="ts">
defineProps<{ eyebrow: string; points: Array<{ icon: string; text: string }> }>();
</script>

<template>
  <aside class="auth-brand" aria-hidden="true">
    <svg class="auth-brand__mark" viewBox="0 0 32 32">
      <path d="M16 2 28 8v9c0 6.5-5 11.5-12 13C9 28.5 4 23.5 4 17V8z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
      <path d="M11 11h7.5a3 3 0 0 1 0 6H11zm0 6h8.5a3 3 0 0 1 0 6H11z" fill="currentColor" opacity=".9" />
    </svg>
    <p class="eyebrow">{{ eyebrow }}</p>
    <p class="auth-brand__title">躲避堡垒<em>3</em></p>
    <ul class="auth-brand__list">
      <li v-for="point in points" :key="point.text"><UIcon :name="point.icon" />{{ point.text }}</li>
    </ul>
  </aside>
</template>

<style scoped>
.auth-brand { position: relative; display: grid; align-content: center; gap: var(--space-4); min-height: 26rem; padding: clamp(var(--space-6), 4vw, var(--space-12)); overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: radial-gradient(70% 80% at 0% 100%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 70%), var(--surface); }
.auth-brand__mark { position: absolute; right: -3rem; bottom: -3rem; width: 22rem; height: 22rem; color: color-mix(in oklch, var(--accent) 22%, transparent); }
.auth-brand__title { margin: 0; font-family: var(--font-display); font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.auth-brand__title em { margin-left: .15em; color: var(--accent); font-style: normal; }
.auth-brand__list { position: relative; display: grid; gap: var(--space-3); margin: var(--space-4) 0 0; padding: 0; color: var(--muted); list-style: none; }
.auth-brand__list li { display: flex; align-items: center; gap: var(--space-3); }
.auth-brand__list [class*="i-lucide-"] { flex: none; width: 1.125rem; height: 1.125rem; color: var(--accent); }
@media (max-width: 63.99rem) {
  .auth-brand { min-height: 0; padding: var(--space-6); }
  .auth-brand__list { display: none; }
  .auth-brand__mark { width: 12rem; height: 12rem; right: -2rem; bottom: -2.5rem; }
}
</style>
