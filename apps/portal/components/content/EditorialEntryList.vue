<script setup lang="ts">
import { editorialTags, editorialYear, formatEditorialDate, formatEditorialMonthDay } from "~/utils/editorial";

export type EditorialListEntry = { path: string; title: string; description?: string; date: string | Date; version?: string; tags?: string[] };

const props = defineProps<{ entries: EditorialListEntry[]; kind: "blog" | "changelog" }>();

// The newest entry leads as a feature; the rest run down a timeline grouped by year.
const featured = computed(() => props.entries[0] ?? null);
const years = computed(() => {
  const rest = featured.value ? props.entries.slice(1) : props.entries;
  const groups = new Map<number, EditorialListEntry[]>();
  for (const entry of rest) groups.set(editorialYear(entry.date), [...(groups.get(editorialYear(entry.date)) ?? []), entry]);
  return [...groups.entries()].map(([year, entries]) => ({ year, entries }));
});
</script>

<template>
  <div class="entry-list">
    <NuxtLink v-if="featured" :to="featured.path" class="entry-feature pressable-soft">
      <span v-if="kind === 'changelog'" class="entry-feature__version num"><span class="sr-only">版本 </span>{{ featured.version }}</span>
      <span class="entry-feature__kicker"><span class="entry-feature__new">最新</span><time :datetime="String(featured.date)">{{ formatEditorialDate(featured.date) }}</time></span>
      <strong class="entry-feature__title">{{ featured.title }}</strong>
      <span v-if="featured.description" class="entry-feature__description">{{ featured.description }}</span>
      <span v-if="editorialTags(featured.tags).length" class="entry-tags"><span v-for="tag in editorialTags(featured.tags)" :key="tag">{{ tag }}</span></span>
      <span class="entry-feature__more">阅读全文<UIcon name="i-lucide-arrow-right" aria-hidden="true" /></span>
    </NuxtLink>

    <section v-for="group in years" :key="group.year" class="entry-year-group" :aria-label="`${group.year} 年`">
      <h2 class="entry-year-heading type-label-sm">{{ group.year }}</h2>
      <ul class="entry-rows">
        <li v-for="entry in group.entries" :key="entry.path">
          <NuxtLink :to="entry.path" class="entry-row pressable-soft">
            <time class="entry-row__date num" :datetime="String(entry.date)">{{ formatEditorialMonthDay(entry.date) }}</time>
            <span class="entry-row__body">
              <span class="entry-row__head">
                <span v-if="kind === 'changelog'" class="entry-version"><span class="sr-only">版本 </span>{{ entry.version }}</span>
              </span>
              <strong class="entry-row__title">{{ entry.title }}</strong>
              <span v-if="kind === 'blog' && entry.description" class="entry-row__description">{{ entry.description }}</span>
              <span v-if="kind === 'blog' && editorialTags(entry.tags).length" class="entry-tags"><span v-for="tag in editorialTags(entry.tags)" :key="tag">{{ tag }}</span></span>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.entry-list { container-type: inline-size; display: grid; gap: var(--space-8); min-width: 0; }
.entry-feature { position: relative; display: grid; gap: var(--space-3); padding: var(--space-8); overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-card); background: radial-gradient(90% 120% at 100% 0%, color-mix(in oklch, var(--accent) 14%, transparent), transparent 60%), var(--surface); color: inherit; text-decoration: none; }
.entry-feature:hover, .entry-feature:focus-visible { border-color: color-mix(in oklch, var(--accent) 55%, var(--line-strong)); }
.entry-feature__version { position: absolute; top: var(--space-4); right: var(--space-6); color: transparent; font-family: var(--font-display); font-size: clamp(3rem, 12cqi, 6rem); font-weight: 700; line-height: 1; -webkit-text-stroke: 1.5px color-mix(in oklch, var(--accent) 50%, transparent); pointer-events: none; }
.entry-feature__kicker { display: flex; align-items: center; gap: var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.entry-feature__new { padding: 0 var(--space-2); border-radius: calc(var(--radius-control) / 1.5); background: var(--accent); color: var(--on-accent); font-size: var(--type-caption-size); font-weight: 700; line-height: 1.7; }
.entry-feature__title { position: relative; max-width: 30ch; font-family: var(--font-display); font-size: clamp(1.5rem, 4cqi, 2.25rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; text-wrap: balance; overflow-wrap: anywhere; }
.entry-feature__description { max-width: 46rem; color: var(--muted); font-size: 1.0625rem; line-height: 1.7; }
.entry-feature__more { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; }
.entry-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.entry-tags > span { padding: 0 var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--muted); font-size: var(--type-caption-size); line-height: 1.8; }
.entry-year-group { display: grid; gap: var(--space-3); }
.entry-year-heading { display: flex; align-items: center; gap: var(--space-3); margin: 0; color: var(--accent); font-family: var(--font-display); font-size: 1rem; letter-spacing: .08em; }
.entry-year-heading::after { content: ""; flex: 1; height: 1px; background: var(--line); }
/* Timeline rail: a line down the date column with a node per entry. */
.entry-rows { position: relative; display: grid; margin: 0; padding: 0; list-style: none; }
.entry-rows::before { content: ""; position: absolute; top: var(--space-2); bottom: var(--space-2); left: 6.25rem; width: 1px; background: var(--line-strong); }
.entry-row { position: relative; display: grid; grid-template-columns: 5.25rem minmax(0, 1fr); gap: var(--space-8); padding: var(--space-4) var(--space-3) var(--space-4) 0; border-radius: var(--radius-control); color: inherit; text-decoration: none; }
.entry-row::before { content: ""; position: absolute; top: calc(var(--space-4) + .45rem); left: calc(6.25rem - 4px); width: 9px; height: 9px; border: 2px solid var(--page); border-radius: 50%; background: var(--quiet); box-shadow: 0 0 0 1px var(--line-strong); transition: background-color 140ms ease; }
.entry-row:hover::before, .entry-row:focus-visible::before { background: var(--accent); }
.entry-row:hover .entry-row__title, .entry-row:focus-visible .entry-row__title { color: var(--accent); }
.entry-row__date { padding-top: 0.2rem; color: var(--quiet); font-size: var(--type-label-sm-size); text-align: right; }
.entry-row__body { display: grid; gap: var(--space-1); min-width: 0; }
.entry-row__head { display: flex; align-items: center; gap: var(--space-2); }
.entry-row__head:empty { display: none; }
.entry-version { color: var(--accent); font-family: var(--font-display); font-size: .9375rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.entry-row__title { font-size: var(--type-card-title-size); font-weight: 600; line-height: var(--type-card-title-leading); overflow-wrap: anywhere; transition: color 140ms ease; }
.entry-row__description { display: -webkit-box; overflow: hidden; color: var(--muted); font-size: var(--type-body-sm-size); line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
@container (max-width: 39.99rem) {
  .entry-feature { padding: var(--space-5); }
  .entry-feature__version { position: static; font-size: 2.75rem; }
  .entry-rows::before { left: 0.25rem; }
  .entry-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-1); padding-left: var(--space-6); }
  .entry-row::before { left: 0; }
  .entry-row__date { padding-top: 0; text-align: left; }
}
@media (prefers-contrast: more) { .entry-feature { border-color: var(--text); } }
</style>
