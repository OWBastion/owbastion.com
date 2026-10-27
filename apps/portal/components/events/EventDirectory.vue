<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import type { EventChallenge, RandomEvent } from "~/types/random-event";
import EffectGlossaryTooltip from "~/components/events/EffectGlossaryTooltip.vue";
import PlayerReviewPanel from "~/components/reviews/PlayerReviewPanel.vue";
import { useReviewSummaries } from "~/composables/useReviewSummaries";
import { calculateEventProbabilities, formatProbability } from "~/utils/event-probabilities";
import { commonEffectTags, emptyEventFilters, facetCount, facetOptions, groupEvents, matchesEvent, sortEvents, type EventFacet, type EventFilters, type EventSort } from "~/utils/event-filters";
import EventProbabilityMeter from "~/components/events/EventProbabilityMeter.vue";

const props = defineProps<{ events: RandomEvent[]; authenticated: boolean }>();
const filters = reactive<EventFilters>(emptyEventFilters());
const sort = shallowRef<EventSort>("latest");
const selected = shallowRef<RandomEvent | null>(null);
const overlayOpen = shallowRef(false);
const hydrated = shallowRef(false);
const isDesktop = useMediaQuery("(min-width: 768px)");
// Wide screens keep the detail beside the list (master/detail); narrower ones open it as an overlay.
const isSplit = useMediaQuery("(min-width: 90rem)");
const reducedMotion = usePreferredReducedMotion();
const allowMotion = computed(() => reducedMotion.value !== "reduce");
const [DefineDetailContent, ReuseDetailContent] = createReusableTemplate();
const [DefineHeaderTags, ReuseHeaderTags] = createReusableTemplate();

const probabilities = computed(() => new Map(props.events.map((event) => [event.eventId, calculateEventProbabilities(event, props.events)])));
const probability = (event: RandomEvent) => probabilities.value.get(event.eventId) ?? calculateEventProbabilities(event, props.events);
const appearance = (event: RandomEvent) => probability(event).appearanceProbability;
const maxAppearance = computed(() => Math.max(0, ...[...probabilities.value.values()].map((item) => item.appearanceProbability ?? 0)));
const filteredEvents = computed(() => sortEvents(props.events.filter((event) => matchesEvent(event, filters)), sort.value, appearance));
const sections = computed(() => groupEvents(filteredEvents.value, "none"));
// Rank by base appearance chance across every event that has one, regardless of the active filters.
const ranking = computed(() => {
  const ranked = props.events.filter((event) => appearance(event) !== null).sort((left, right) => (appearance(right) ?? 0) - (appearance(left) ?? 0));
  return { rankOf: new Map(ranked.map((event, index) => [event.eventId, index + 1])), total: ranked.length };
});

// Category is the one-tap filter; everything else is combinable and lives behind a single popover.
const categoryOptions = computed(() => facetOptions(props.events, "categories"));
const versionOptions = computed(() => [{ label: "全部版本", value: "all" }, ...[...new Set(props.events.map((event) => event.gameVersion))].sort((left, right) => right.localeCompare(left, undefined, { numeric: true })).map((value) => ({ label: value, value }))]);
const facetSections = computed(() => ([["事件组", "groups", facetOptions(props.events, "groups")], ["稀有度", "rarities", facetOptions(props.events, "rarities")], ["常见效果", "tags", commonEffectTags(props.events)]] as const).filter(([, , options]) => options.length));
const statusOptions = [{ label: "已实装", value: "implemented" }, { label: "已移除", value: "removed" }, { label: "开发中", value: "development" }, { label: "全部", value: "all" }] as const;
const sortOptions = [{ label: "最新", value: "latest" }, { label: "概率", value: "probability" }] as const;
const isOn = (facet: EventFacet, value: string) => filters[facet].includes(value);
const toggle = (facet: EventFacet, value: string) => { filters[facet] = isOn(facet, value) ? filters[facet].filter((item) => item !== value) : [...filters[facet], value]; };
const extraFilterCount = computed(() => filters.groups.length + filters.rarities.length + filters.tags.length + (filters.version !== "all" ? 1 : 0) + (filters.status !== "implemented" ? 1 : 0));
const hasFilters = computed(() => Boolean(filters.query.trim()) || filters.categories.length > 0 || extraFilterCount.value > 0);
const clearFilters = () => Object.assign(filters, emptyEventFilters());
const openEvent = (event: RandomEvent) => {
  selected.value = event;
  overlayOpen.value = !isSplit.value;
};
const splitActive = computed(() => hydrated.value && isSplit.value);
// In split view the pane always shows something: keep the selection while it is still listed, else the first result.
watch([splitActive, filteredEvents], ([split, events]) => {
  if (!split) return;
  if (!selected.value || !events.some((event) => event.eventId === selected.value?.eventId)) selected.value = events[0] ?? null;
}, { immediate: true });
watch(isSplit, (split) => { if (split) overlayOpen.value = false; });
const statusText = (value: RandomEvent["releaseStatus"]) => value === "implemented" ? "已实装" : value === "removed" ? "已移除" : "开发中";
const challengeHref = (challenge: EventChallenge) => challenge.family === "map"
  ? `/maps?mapId=${encodeURIComponent(challenge.mapId)}`
  : "/achievements";
const challengeAction = (challenge: EventChallenge) => challenge.family === "map" ? "查看地图" : "查看成就";
const categoryColor = (value: string) => value === "减益" ? "error" : value === "增益" ? "success" : value === "机制" ? "info" : "neutral";
const unannotatedEffectTags = (event: RandomEvent) => event.effectTags.filter((value) => !event.effectAnnotations.some((annotation) => annotation.tag === value));
// Outcome tags share the event's glossary annotations.
const outcomeAnnotations = (event: RandomEvent, outcome: RandomEvent["outcomes"][number]) => event.effectAnnotations.filter((annotation) => outcome.effectTags.includes(annotation.tag));
const unannotatedOutcomeTags = (event: RandomEvent, outcome: RandomEvent["outcomes"][number]) => outcome.effectTags.filter((tag) => !event.effectAnnotations.some((annotation) => annotation.tag === tag));
const reviewSummaries = useReviewSummaries("event", () => props.events.map((event) => event.eventId));
const reviewLoading = computed(() => reviewSummaries.loading.value);
const reviewError = computed(() => reviewSummaries.error.value);
const eventRatingChip = (eventId: string) => reviewRatingChip(reviewSummaries.summaryFor(eventId), reviewLoading.value, reviewError.value);
const refreshReviewSummaries = () => reviewSummaries.refresh();

onMounted(() => { hydrated.value = true; });
</script>

<template>
  <section class="event-directory" aria-label="随机事件目录">
    <div class="filters">
      <UInput v-model="filters.query" class="filters__search" size="lg" icon="i-lucide-search" placeholder="搜索" aria-label="搜索事件" />
      <div v-if="categoryOptions.length > 1" class="flex flex-wrap gap-2" role="group" aria-label="按类别筛选">
        <FilterChip label="全部" :pressed="!filters.categories.length" @toggle="filters.categories = []" />
        <FilterChip v-for="category in categoryOptions" :key="category" :label="category" :pressed="isOn('categories', category)" @toggle="filters.categories = isOn('categories', category) ? [] : [category]" />
      </div>
      <div class="flex flex-wrap gap-2" role="group" aria-label="排序方式">
        <FilterChip v-for="option in sortOptions" :key="option.value" :label="option.label" :pressed="sort === option.value" @toggle="sort = option.value" />
      </div>
      <UPopover>
        <UButton icon="i-lucide-sliders-horizontal" :label="extraFilterCount ? String(extraFilterCount) : undefined" color="neutral" :variant="extraFilterCount ? 'soft' : 'ghost'" aria-label="更多筛选" />
        <template #content>
          <div class="filters__more">
            <div class="flex flex-wrap gap-2" role="group" aria-label="筛选事件状态">
              <FilterChip v-for="option in statusOptions" :key="option.value" :label="option.label" :pressed="filters.status === option.value" @toggle="filters.status = option.value" />
            </div>
            <USelect v-model="filters.version" :items="versionOptions" aria-label="筛选事件版本" />
            <fieldset v-for="[label, facet, options] in facetSections" :key="facet" class="filters__facet">
              <legend>{{ label }}</legend>
              <FilterChip v-for="value in options" :key="value" :label="value" :count="facetCount(events, filters, facet, value)" :pressed="isOn(facet, value)" @toggle="toggle(facet, value)" />
            </fieldset>
          </div>
        </template>
      </UPopover>
      <UButton v-if="hasFilters" label="清除" color="neutral" variant="link" @click="clearFilters" />
    </div>

    <DefineHeaderTags>
      <div v-if="selected" class="detail-header-tags">
        <UBadge :label="selected.category" :color="categoryColor(selected.category)" variant="subtle" />
        <UBadge v-if="selected.rarity" :label="selected.rarity" color="neutral" variant="outline" />
        <StatusBadge v-bind="eventRatingChip(selected.eventId)" />
      </div>
    </DefineHeaderTags>

    <DefineDetailContent>
      <div v-if="selected" class="detail">
        <p class="description">{{ selected.description }}</p>
        <section v-if="appearance(selected) !== null" class="detail-probability surface-card" aria-label="出现概率">
          <div class="detail-probability__value num">{{ formatProbability(appearance(selected)) }}</div>
          <EventProbabilityMeter :probability="appearance(selected)" :max="maxAppearance" />
          <p v-if="ranking.rankOf.get(selected.eventId)" class="detail-probability__rank num">概率第 {{ ranking.rankOf.get(selected.eventId) }} / {{ ranking.total }}</p>
        </section>
        <dl class="detail-grid">
          <div v-if="selected.durationSeconds !== null" class="detail-grid__row"><dt>持续</dt><dd>{{ selected.durationSeconds }} 秒</dd></div>
          <div v-if="selected.cooldownSeconds" class="detail-grid__row"><dt>冷却</dt><dd>{{ selected.cooldownSeconds }} 秒</dd></div>
        </dl>
        <UAccordion :items="[{ label: '概率统计', slot: 'probability' }]">
          <template #probability>
            <dl class="detail-grid">
              <div v-if="selected.weight !== null && selected.weight !== undefined" class="detail-grid__row"><dt>权重</dt><dd>{{ selected.weight }}</dd></div>
              <div class="detail-grid__row"><dt>候选池事件数</dt><dd>{{ probability(selected).poolSize }}</dd></div>
              <div class="detail-grid__row"><dt>单次失败率</dt><dd>{{ formatProbability(probability(selected).failureProbability) }}</dd></div>
              <div class="detail-grid__row"><dt>保底触发率</dt><dd>{{ formatProbability(probability(selected).guaranteeProbability) }}</dd></div>
              <div class="detail-grid__row"><dt>出现概率</dt><dd>{{ formatProbability(probability(selected).appearanceProbability) }}</dd></div>
            </dl>
            <p class="cap">基础概率：按全部已实装事件的权重计算，未计入最近事件去重和特殊资格限制。</p>
          </template>
        </UAccordion>
        <div class="event-tags">
          <EffectGlossaryTooltip v-for="annotation in selected.effectAnnotations" :key="annotation.term.key" :annotation="annotation" />
          <UBadge v-for="tag in unannotatedEffectTags(selected)" :key="`detail-${tag}`" :label="tag" color="neutral" variant="subtle" />
        </div>
        <section v-if="selected.outcomes.length" class="outcomes" aria-label="结果项">
          <h3 class="type-card-title">结果项</h3>
          <article v-for="outcome in selected.outcomes" :key="outcome.position" class="outcome surface-card">
            <div class="outcome__head">
              <UBadge :label="outcome.polarity === 'buff' ? '增益' : '减益'" :color="outcome.polarity === 'buff' ? 'success' : 'error'" variant="subtle" />
              <strong>{{ outcome.name }}</strong>
            </div>
            <p class="outcome__desc">{{ outcome.description }}</p>
            <div v-if="outcome.effectTags.length" class="event-tags">
              <EffectGlossaryTooltip v-for="annotation in outcomeAnnotations(selected, outcome)" :key="`outcome-${outcome.position}-${annotation.term.key}`" :annotation="annotation" />
              <UBadge v-for="tag in unannotatedOutcomeTags(selected, outcome)" :key="`outcome-${outcome.position}-${tag}`" :label="tag" color="neutral" variant="subtle" />
            </div>
          </article>
        </section>
        <section v-if="selected.challenges.length" class="challenges">
          <h3 class="type-card-title">挑战</h3>
          <NuxtLink
            v-for="challenge in selected.challenges"
            :key="challenge.challengeId"
            :to="challengeHref(challenge)"
            class="challenge-link interactive-card pressable-soft"
          >
            {{ challenge.family === "map" ? challenge.name : challenge.titleName }}
            <span class="type-label-sm">{{ challengeAction(challenge) }}</span>
          </NuxtLink>
        </section>
        <PlayerReviewPanel target-type="event" :target-id="selected.eventId" :authenticated="props.authenticated" @review-changed="refreshReviewSummaries" />
      </div>
    </DefineDetailContent>

    <div class="results" :class="{ 'results--split': splitActive }">
    <div v-if="filteredEvents.length" class="event-groups">
      <section v-for="section in sections" :key="section.key" class="event-group" :aria-label="section.label || '事件'">
        <div v-if="section.label" class="group-heading">
          <h2>{{ section.label }}</h2>
          <span class="type-label-sm num">{{ section.events.length }} 项事件</span>
        </div>
        <ul class="event-list">
          <li v-for="event in section.events" :key="event.eventId">
            <button
              class="event-row pressable-soft"
              :class="{ 'is-selected': splitActive && selected?.eventId === event.eventId }"
              type="button"
              :aria-haspopup="splitActive ? undefined : 'dialog'"
              :aria-pressed="splitActive ? selected?.eventId === event.eventId : undefined"
              @click="openEvent(event)"
            >
              <span class="event-row__rarity num" :class="`is-${categoryColor(event.category)}`">{{ event.rarity || "—" }}</span>
              <span class="event-row__main">
                <span class="event-row__title">
                  <strong>{{ event.name }}</strong>
                  <StatusBadge v-if="event.releaseStatus !== 'implemented'" :label="statusText(event.releaseStatus)" tone="warning" />
                </span>
                <span class="event-row__desc">{{ event.description }}</span>
              </span>
              <span class="event-row__prob">
                <EventProbabilityMeter :probability="appearance(event)" :max="maxAppearance" />
                <span v-if="appearance(event) === null" class="event-row__noprob">—</span>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
    <UEmpty v-else :title="events.length ? '没有找到' : '暂无事件'" variant="naked"><template v-if="events.length && hasFilters" #actions><UButton label="清除条件" color="neutral" variant="outline" @click="clearFilters" /></template></UEmpty>
    <aside v-if="splitActive && selected" class="detail-pane" aria-label="事件详情">
      <header class="detail-pane__head">
        <h2 class="detail-pane__title">{{ selected.name }}</h2>
        <ReuseHeaderTags />
      </header>
      <ReuseDetailContent />
    </aside>
    </div>


    <template v-if="hydrated && !isSplit">
      <UModal
        v-if="isDesktop"
        v-model:open="overlayOpen"
        :title="selected?.name ?? '事件详情'"
        close
        scrollable
        :transition="allowMotion"
        :ui="{ content: 'overlay-sheet overlay-sheet--modal event-detail-surface glass-heavy elevation-3 w-[calc(100vw-2rem)] max-w-2xl max-h-[calc(100dvh-2rem)]', header: 'overlay-sheet__header glass-segment p-4 sm:p-6', body: 'overlay-sheet__body p-4 sm:p-6' }"
      >
        <template #description>
          <ReuseHeaderTags />
        </template>
        <template #body>
          <ReuseDetailContent />
        </template>
      </UModal>

      <UDrawer
        v-else
        v-model:open="overlayOpen"
        direction="bottom"
        :title="selected?.name ?? '事件详情'"
        close
        :should-scale-background="false"
        :set-background-color-on-scale="false"
        :ui="{ content: 'overlay-sheet overlay-sheet--drawer event-detail-surface glass-heavy elevation-3 max-h-[calc(100dvh-1rem)]', container: 'overlay-sheet__container', header: 'overlay-sheet__header glass-segment p-4', body: 'overlay-sheet__body p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]' }"
      >
        <template #description>
          <ReuseHeaderTags />
        </template>
        <template #body>
          <ReuseDetailContent />
        </template>
      </UDrawer>
    </template>
  </section>
</template>

<style scoped>
.event-directory { display: grid; gap: var(--space-5); }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.filters__search { width: min(100%, 24rem); }
.filters__more { display: grid; gap: var(--space-4); width: min(22rem, 85vw); padding: var(--space-4); }
.filters__facet { display: flex; flex-wrap: wrap; gap: var(--space-2); min-width: 0; margin: 0; padding: 0; border: 0; }
.filters__facet legend { margin-bottom: var(--space-2); padding: 0; color: var(--quiet); font-size: var(--type-caption-size); }
.event-groups { display: grid; gap: var(--space-8); }
.event-group { display: grid; gap: var(--space-3); }
.group-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--line); }
.group-heading h2 { margin: 0; font-size: var(--type-caption-size); font-weight: 600; letter-spacing: 0.01em; }
.group-heading span { color: var(--quiet); }

/* Results: compact rows; in split view the detail pane sits beside them. */
.results { display: grid; min-width: 0; gap: var(--space-6); align-items: start; }
.results--split { grid-template-columns: minmax(0, 1fr) minmax(22rem, 26rem); }
.event-list { display: grid; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); list-style: none; overflow: hidden; }
.event-list > li + li { border-top: 1px solid var(--line); }
.event-row { position: relative; display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) minmax(7rem, 10rem); align-items: center; gap: var(--space-4); width: 100%; padding: var(--space-3) var(--space-4); border: 0; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; transition: background-color 140ms ease; }
.event-row:hover { background: var(--surface-raised); }
.event-row.is-selected { background: color-mix(in oklch, var(--accent) 10%, transparent); }
.event-row.is-selected::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--accent); }
.event-row__rarity { display: grid; height: 2.75rem; place-items: center; border: 1px solid var(--line-strong); border-radius: var(--radius-control); color: var(--text); font-size: .8125rem; font-weight: 700; }
.event-row__rarity.is-success { border-color: color-mix(in oklch, var(--success) 50%, var(--line)); color: var(--success); }
.event-row__rarity.is-error { border-color: color-mix(in oklch, var(--danger) 50%, var(--line)); color: var(--danger); }
.event-row__rarity.is-info { border-color: color-mix(in oklch, var(--info) 50%, var(--line)); color: var(--info); }
.event-row__main { display: grid; min-width: 0; gap: 2px; }
.event-row__title { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.event-row__title strong { overflow: hidden; font-size: .9875rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.event-row__desc { overflow: hidden; color: var(--muted); font-size: var(--type-body-sm-size); text-overflow: ellipsis; white-space: nowrap; }
.event-row__prob { min-width: 0; }
.event-row__noprob { color: var(--quiet); font-size: var(--type-caption-size); }
.detail-pane { position: sticky; top: var(--sticky-chrome-top); display: grid; gap: var(--space-4); max-height: calc(100dvh - var(--sticky-chrome-top) - var(--space-4)); padding: var(--space-5); overflow-y: auto; border: 1px solid var(--line-strong); border-radius: var(--radius-card); background: var(--surface); scrollbar-width: thin; }
.detail-pane__head { padding-bottom: var(--space-4); border-bottom: 1px solid var(--line); }
.detail-pane__title { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; line-height: 1.2; }
.event-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.detail { display: grid; gap: var(--space-4); }
.detail-header-tags { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
.detail-probability { display: grid; gap: var(--space-2); padding: var(--space-4); }
.detail-probability__value { color: var(--text); font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.detail-probability p { margin: 0; color: var(--muted); }
.detail-probability__rank { color: var(--quiet); font-size: var(--type-caption-size); }
.detail-probability b { color: var(--text); font-weight: 600; }
.description { margin: 0; color: var(--text); line-height: 1.65; }
.challenges { display: grid; gap: var(--space-2); }
.challenges h3 { margin: 0; }
.outcomes { display: grid; gap: var(--space-2); }
.outcomes h3 { margin: 0; }
.outcome { display: grid; gap: var(--space-2); padding: var(--space-3); }
.outcome__head { display: flex; align-items: center; gap: var(--space-2); }
.outcome__desc { margin: 0; color: var(--muted); font-size: var(--type-body-sm-size); line-height: 1.6; }
.challenge-link {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  color: var(--text);
  background: var(--surface);
  text-decoration: none;
}
.challenge-link:hover, .challenge-link:focus-visible { border-color: var(--line-strong); }
.challenge-link span, .muted { color: var(--quiet); font-size: var(--type-label-sm-size); }
@container (max-width: 39.99rem) {
  .event-row { grid-template-columns: 2.5rem minmax(0, 1fr); padding: var(--space-3); }
  .event-row__rarity { height: 2.5rem; }
  .event-row__prob { grid-column: 2; }
  .event-row__desc { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
}
</style>

<style>
@media (prefers-reduced-motion: reduce) {
  .event-detail-surface { transition-duration: 1ms !important; }
}
</style>
