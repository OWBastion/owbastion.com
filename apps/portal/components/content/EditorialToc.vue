<script setup lang="ts">
import type { EditorialTocEntry } from "~/utils/editorial";

const props = defineProps<{ entries: EditorialTocEntry[]; spy?: boolean }>();
const active = shallowRef("");
let frame = 0;

// The last heading that has scrolled past the reading line is the section being read.
function update() {
  frame = 0;
  const line = window.innerHeight * 0.3;
  let current = "";
  for (const entry of props.entries) {
    const heading = document.getElementById(entry.id);
    if (heading && heading.getBoundingClientRect().top <= line) current = entry.id;
  }
  active.value = current;
}
const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
onMounted(() => {
  if (!props.spy) return;
  window.addEventListener("scroll", schedule, { passive: true });
  update();
});
onBeforeUnmount(() => { window.removeEventListener("scroll", schedule); if (frame) window.cancelAnimationFrame(frame); });
</script>

<template>
  <nav class="editorial-toc" aria-label="本文目录">
    <p class="editorial-toc__title type-label-sm">本文目录</p>
    <ol>
      <li v-for="entry in entries" :key="entry.id" :class="{ 'is-sub': entry.depth > 2 }">
        <a :href="`#${entry.id}`" :class="{ 'is-active': active === entry.id }" :aria-current="active === entry.id ? 'location' : undefined">{{ entry.text }}</a>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.editorial-toc { display: grid; gap: var(--space-2); min-width: 0; }
.editorial-toc__title { margin: 0; color: var(--quiet); }
.editorial-toc ol { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; border-left: 1px solid var(--line); }
.editorial-toc li.is-sub { padding-left: var(--space-3); }
.editorial-toc a { display: block; padding: var(--space-1) var(--space-3); margin-left: -1px; border-left: 2px solid transparent; color: var(--muted); font-size: var(--type-label-sm-size); line-height: 1.45; text-decoration: none; overflow-wrap: anywhere; }
.editorial-toc a:hover, .editorial-toc a:focus-visible { color: var(--text); }
.editorial-toc a.is-active { border-left-color: var(--accent); color: var(--text); font-weight: 600; }
</style>
