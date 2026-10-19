<script setup lang="ts">
defineProps<{ title: string; count: string; headingId: string }>();
</script>

<template>
  <section class="shelf" :aria-labelledby="headingId">
    <h2 :id="headingId" class="shelf__title">{{ title }}<span class="num">{{ count }}</span></h2>
    <ul class="shelf__row"><slot /></ul>
  </section>
</template>

<style scoped>
.shelf { display: grid; gap: var(--space-2); padding-block: var(--space-6) 0; }
.shelf__title { display: flex; align-items: baseline; gap: var(--space-3); margin: 0; color: var(--muted); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .12em; }
.shelf__title .num { color: var(--quiet); letter-spacing: 0; }
/* Medals stand on a ledge: a bright top edge with a shadow falling beneath it. */
.shelf__row { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); margin: 0; padding: 0 0 var(--space-3); border-bottom: 2px solid color-mix(in oklch, var(--line-strong) 80%, var(--accent)); box-shadow: 0 .6rem .8rem -.6rem rgb(0 0 0 / .2); list-style: none; }
:is(html.dark) .shelf__row { box-shadow: 0 .6rem .8rem -.5rem rgb(0 0 0 / .6); }
</style>
