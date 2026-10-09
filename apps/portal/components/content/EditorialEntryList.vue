<script setup lang="ts">
import { editorialTags, editorialYear, formatEditorialDate, formatEditorialMonthDay } from "~/utils/editorial";

export type EditorialListEntry = { path: string; title: string; description?: string; date: string | Date; version?: string; tags?: string[] };

const props = defineProps<{ entries: EditorialListEntry[]; kind: "blog" | "changelog" }>();

// Development logs lead with their newest entry as a feature; release notes mark the newest version.
const featured = computed(() => props.kind === "blog" ? props.entries[0] ?? null : null);
const years = computed(() => {
  const rest = featured.value ? props.entries.slice(1) : props.entries;
  const groups = new Map<number, EditorialListEntry[]>();
  for (const entry of rest) groups.set(editorialYear(entry.date), [...(groups.get(editorialYear(entry.date)) ?? []), entry]);
  return [...groups.entries()].map(([year, entries]) => ({ year, entries }));
});
const isNewest = (entry: EditorialListEntry) => props.kind === "changelog" && entry.path === props.entries[0]?.path;
</script>

<template>
  <div class="entry-list">
    <NuxtLink v-if="featured" :to="featured.path" class="entry-feature pressable-soft">
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
                <span v-if="isNewest(entry)" class="entry-feature__new">最新</span>
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
.entry-feature { display: grid; gap: var(--space-3); padding: var(--space-6); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); color: inherit; text-decoration: none; }
.entry-feature:hover, .entry-feature:focus-visible { border-color: var(--line-strong); }
.entry-feature__kicker { display: flex; align-items: center; gap: var(--space-3); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.entry-feature__new { padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--accent-surface); color: var(--accent); font-size: var(--type-caption-size); font-weight: 700; line-height: 1.7; }
.entry-feature__title { font-size: var(--type-headline-size); font-weight: 700; letter-spacing: var(--type-headline-tracking); line-height: var(--type-headline-leading); text-wrap: balance; overflow-wrap: anywhere; }
.entry-feature__description { color: var(--muted); font-size: 1.0625rem; line-height: 1.7; }
.entry-feature__more { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 600; }
.entry-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.entry-tags > span { padding: 0 var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--muted); font-size: var(--type-caption-size); line-height: 1.8; }
.entry-year-group { display: grid; gap: var(--space-2); }
.entry-year-heading { display: flex; align-items: center; gap: var(--space-3); margin: 0; color: var(--quiet); font-variant-numeric: tabular-nums; }
.entry-year-heading::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.entry-rows { display: grid; margin: 0; padding: 0; list-style: none; }
.entry-row { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: var(--space-4); padding: var(--space-4) var(--space-3); border-radius: var(--radius-control); color: inherit; text-decoration: none; }
.entry-row:hover, .entry-row:focus-visible { background: var(--surface); }
.entry-row__date { padding-top: 0.2rem; color: var(--quiet); font-size: var(--type-label-sm-size); }
.entry-row__body { display: grid; gap: var(--space-1); min-width: 0; }
.entry-row__head { display: flex; align-items: center; gap: var(--space-2); }
.entry-row__head:empty { display: none; }
.entry-version { display: inline-flex; align-items: center; padding: 0 var(--space-3); border: 1px solid color-mix(in oklch, var(--accent) 42%, var(--line)); border-radius: var(--radius-pill); background: var(--accent-surface); color: var(--accent); font-size: var(--type-caption-size); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.8; }
.entry-row__title { font-size: var(--type-card-title-size); font-weight: 600; line-height: var(--type-card-title-leading); overflow-wrap: anywhere; }
.entry-row__description { display: -webkit-box; overflow: hidden; color: var(--muted); font-size: var(--type-body-sm-size); line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
@container (max-width: 39.99rem) {
  .entry-feature { padding: var(--space-4); }
  .entry-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-1); }
  .entry-row__date { padding-top: 0; }
}
@media (prefers-contrast: more) { .entry-feature { border-color: var(--text); } }
</style>
