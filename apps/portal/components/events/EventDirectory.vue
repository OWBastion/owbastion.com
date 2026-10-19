<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import type { EventChallenge, RandomEvent } from "~/types/random-event";
import EffectGlossaryTooltip from "~/components/events/EffectGlossaryTooltip.vue";
import PlayerReviewPanel from "~/components/reviews/PlayerReviewPanel.vue";
import { useReviewSummaries } from "~/composables/useReviewSummaries";
import { calculateEventProbabilities, formatProbability } from "~/utils/event-probabilities";
import { commonEffectTags, emptyEventFilters, facetCount, facetOptions, groupEvents, matchesEvent, sortEvents, type EventFacet, type EventFilters, type EventGrouping, type EventSort } from "~/utils/event-filters";
import EventProbabilityMeter from "~/components/events/EventProbabilityMeter.vue";

const props = defineProps<{ events: RandomEvent[]; authenticated: boolean }>();
const filters = reactive<EventFilters>(emptyEventFilters());
const sort = shallowRef<EventSort>("latest");
const grouping = shallowRef<EventGrouping>("none");
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
const ranking = computed(() => {
  const ranked = props.events.filter((event) => appearance(event) !== null).sort((left, right) => (appearance(right) ?? 0) - (appearance(left) ?? 0));
  return { rankOf: new Map(ranked.map((event, index) => [event.eventId, index + 1])), total: ranked.length };
});

const groupOptions = computed(() => facetOptions(props.events, "groups"));
const tagOptions = computed(() => commonEffectTags(props.events));
const categoryOptions = computed(() => facetOptions(props.events, "categories"));
const rarityOptions = computed(() => facetOptions(props.events, "rarities"));
const versionOptions = computed(() => [...new Set(props.events.map((event) => event.gameVersion))].sort((left, right) => right.localeCompare(left, undefined, { numeric: true })));
const panelOpen = shallowRef(false);
const activeCount = computed(() => activeChips.value.length + (filters.version !== "all" ? 1 : 0) + (sort.value !== "latest" ? 1 : 0) + (grouping.value !== "none" ? 1 : 0));
const filteredEvents = computed(() => sortEvents(props.events.filter((event) => matchesEvent(event, filters)), sort.value, appearance));
const sections = computed(() => groupEvents(filteredEvents.value, grouping.value));
const activeChips = computed(() => ([["groups", filters.groups], ["tags", filters.tags], ["categories", filters.categories], ["rarities", filters.rarities]] as const).flatMap(([facet, values]) => values.map((value) => ({ facet, value }))));
const hasActiveFilters = computed(() => activeChips.value.length > 0 || Boolean(filters.query.trim()) || filters.version !== "all");
const isOn = (facet: EventFacet, value: string) => filters[facet].includes(value);
const toggle = (facet: EventFacet, value: string) => { filters[facet] = isOn(facet, value) ? filters[facet].filter((item) => item !== value) : [...filters[facet], value]; };
const countFor = (facet: EventFacet, value: string) => facetCount(props.events, filters, facet, value);
const clearFilters = () => Object.assign(filters, { ...emptyEventFilters(), status: filters.status });
const detailFacts = (event: RandomEvent) => [
  event.durationSeconds === null ? null : `${event.durationSeconds} 秒`,
  event.cooldownSeconds ? `冷却 ${event.cooldownSeconds} 秒` : null,
  event.weight === null ? null : `权重 ${event.weight}`,
].filter((fact): fact is string => fact !== null);
const drawsPerAppearance = (event: RandomEvent) => { const value = appearance(event); return value ? Math.max(1, Math.round(1 / value)) : null; };
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
      <UInput v-model="filters.query" class="filters__search" size="lg" placeholder="搜索名称、说明、事件组或效果" aria-label="搜索事件" />
      <UButton class="filter-toggle" :label="activeCount ? `筛选与排序 · ${activeCount}` : '筛选与排序'" icon="i-lucide-sliders-horizontal" color="neutral" variant="outline" size="lg" block :aria-expanded="panelOpen" aria-controls="event-filter-panel" @click="panelOpen = !panelOpen" />
      <div id="event-filter-panel" class="filter-panel" :data-open="panelOpen">
      <USelect v-model="sort" size="lg" :items="[{ label: '最新版本', value: 'latest' }, { label: '名称', value: 'name' }, { label: '出现概率高到低', value: 'probability' }]" aria-label="排序方式" />
      <USelect v-model="grouping" size="lg" :items="[{ label: '不分组', value: 'none' }, { label: '按事件组', value: 'group' }, { label: '按版本', value: 'version' }, { label: '按类别', value: 'category' }]" aria-label="分组方式" />
    <div v-if="groupOptions.length || tagOptions.length" class="quick-filters">
      <div v-if="groupOptions.length" class="chip-row" role="group" aria-label="事件组">
        <span class="chip-row__label type-label-sm">事件组</span>
        <FilterChip v-for="value in groupOptions" :key="value" :label="value" :count="countFor('groups', value)" :pressed="isOn('groups', value)" :disabled="!isOn('groups', value) && !countFor('groups', value)" @toggle="toggle('groups', value)" />
      </div>
      <div v-if="tagOptions.length" class="chip-row" role="group" aria-label="常见效果">
        <span class="chip-row__label type-label-sm">常见效果</span>
        <FilterChip v-for="value in tagOptions" :key="value" :label="value" :count="countFor('tags', value)" :pressed="isOn('tags', value)" :disabled="!isOn('tags', value) && !countFor('tags', value)" @toggle="toggle('tags', value)" />
      </div>
    </div>

    <div class="refine-filters">
      <div v-if="categoryOptions.length" class="chip-row" role="group" aria-label="类别">
        <FilterChip v-for="value in categoryOptions" :key="value" :label="value" :count="countFor('categories', value)" :pressed="isOn('categories', value)" :disabled="!isOn('categories', value) && !countFor('categories', value)" @toggle="toggle('categories', value)" />
      </div>
      <div v-if="rarityOptions.length" class="chip-row" role="group" aria-label="稀有度">
        <FilterChip v-for="value in rarityOptions" :key="value" :label="value" :count="countFor('rarities', value)" :pressed="isOn('rarities', value)" :disabled="!isOn('rarities', value) && !countFor('rarities', value)" @toggle="toggle('rarities', value)" />
      </div>
      <USelect v-model="filters.version" size="md" :items="[{ label: '全部版本', value: 'all' }, ...versionOptions.map((value) => ({ label: value, value }))]" aria-label="筛选事件版本" />
      <USelect v-model="filters.status" size="md" :items="[{ label: '已实装事件', value: 'implemented' }, { label: '全部状态', value: 'all' }, { label: '已移除事件', value: 'removed' }]" aria-label="筛选事件状态" />
    </div>
      </div>
    </div>

    <div class="result-summary" aria-live="polite">
      <span class="type-label num">{{ filteredEvents.length }} 项事件</span>
      <UButton v-if="hasActiveFilters" label="清除条件" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
    </div>

    <DefineHeaderTags>
      <div v-if="selected" class="detail-header-tags">
        <UBadge v-if="selected.eventGroup" :label="selected.eventGroup" color="primary" variant="outline" />
        <UBadge :label="selected.category" :color="categoryColor(selected.category)" variant="subtle" />
        <UBadge v-if="selected.rarity" :label="selected.rarity" color="neutral" variant="outline" />
        <UBadge :label="selected.gameVersion" color="neutral" variant="subtle" />
        <StatusBadge v-bind="eventRatingChip(selected.eventId)" />
      </div>
    </DefineHeaderTags>

    <DefineDetailContent>
      <div v-if="selected" class="detail">
        <p class="description">{{ selected.description }}</p>
        <section v-if="appearance(selected) !== null" class="detail-probability surface-card" aria-label="出现概率">
          <div class="detail-probability__value num">{{ formatProbability(appearance(selected)) }}</div>
          <EventProbabilityMeter :probability="appearance(selected)" :max="maxAppearance" />
          <p class="type-label-sm">平均每 <b class="num">{{ drawsPerAppearance(selected) }}</b> 次事件抽取出现 1 次 · 概率第 <b class="num">{{ ranking.rankOf.get(selected.eventId) }}</b> / {{ ranking.total }} 位</p>
        </section>
        <dl class="detail-grid">
          <div class="detail-grid__row"><dt>持续时间</dt><dd :class="{ 'detail-grid__empty': selected.durationSeconds === null }">{{ selected.durationSeconds === null ? "暂无记录" : `${selected.durationSeconds} 秒` }}</dd></div>
          <div class="detail-grid__row"><dt>内置冷却</dt><dd :class="{ 'detail-grid__empty': selected.cooldownSeconds === null }">{{ selected.cooldownSeconds === null ? "暂无记录" : `${selected.cooldownSeconds} 秒` }}</dd></div>
          <div class="detail-grid__row"><dt>权重</dt><dd :class="{ 'detail-grid__empty': selected.weight === null || selected.weight === undefined }">{{ selected.weight ?? "暂无记录" }}</dd></div>
        </dl>
        <UAccordion :items="[{ label: '概率统计', slot: 'probability' }]">
          <template #probability>
            <dl class="detail-grid">
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
        <section class="challenges">
          <h3 class="type-card-title">开放挑战</h3>
          <p v-if="!selected.challenges.length" class="muted">暂无开放挑战。</p>
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
                <span class="event-row__meta">
                  <span class="event-category" :class="`is-${categoryColor(event.category)}`">{{ event.category }}</span>
                  <span v-if="event.eventGroup" class="event-group-label">{{ event.eventGroup }}</span>
                  <span class="event-version num">{{ event.gameVersion }}</span>
                  <span v-if="detailFacts(event).length" class="event-facts num">{{ detailFacts(event).join(" · ") }}</span>
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
    <UEmpty v-else title="没有符合条件的事件" description="去掉部分条件再试试。" variant="naked">
      <template v-if="hasActiveFilters" #actions><UButton label="清除条件" color="neutral" variant="outline" @click="clearFilters" /></template>
    </UEmpty>
    <aside v-if="splitActive && selected" class="detail-pane" aria-label="事件详情">
      <header class="detail-pane__head">
        <p class="eyebrow">Event</p>
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
.filters { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.filters > * { flex: 1 1 10rem; min-width: 0; }
.filters__search { flex-grow: 3; flex-basis: 16rem; }
.filter-toggle { display: none; }
/* On wide layouts the panel dissolves into the filter row; on narrow ones it sits behind the toggle. */
.filter-panel { display: contents; }
.filter-panel > .quick-filters, .filter-panel > .refine-filters { flex: 1 1 100%; }
.filters :deep([data-slot="base"]),
.filters :deep(button),
.filters :deep(input) { min-height: var(--control-lg); }
.quick-filters { display: grid; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.refine-filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
.refine-filters > :deep([data-slot="base"]) { min-width: 9rem; }
.chip-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; }
.chip-row__label { min-width: 4.5rem; color: var(--muted); }
.result-summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); }
.event-groups { display: grid; gap: var(--space-8); }
.event-group { display: grid; gap: var(--space-3); }
.group-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--line); }
.group-heading h2 { margin: 0; font-size: var(--type-caption-size); font-weight: 600; letter-spacing: 0.01em; }
.group-heading span { color: var(--quiet); }
.event-group-label { padding: 0 var(--space-2); border: 1px solid color-mix(in oklch, var(--accent) 55%, var(--line)); border-radius: var(--radius-pill); color: var(--accent); font-weight: 600; }
.event-category { font-weight: 600; }
.event-category.is-success { color: var(--success); }
.event-category.is-error { color: var(--danger); }
.event-category.is-info { color: var(--info); }
.event-version, .event-facts { color: var(--quiet); }

/* Results: compact rows; in split view the detail pane sits beside them. */
.results { display: grid; min-width: 0; gap: var(--space-6); align-items: start; }
.results--split { grid-template-columns: minmax(0, 1fr) minmax(22rem, 26rem); }
.event-list { display: grid; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); list-style: none; overflow: hidden; }
.event-list > li + li { border-top: 1px solid var(--line); }
.event-row { position: relative; display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) minmax(7rem, 10rem); align-items: center; gap: var(--space-4); width: 100%; padding: var(--space-3) var(--space-4); border: 0; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; transition: background-color 140ms ease; }
.event-row:hover { background: color-mix(in oklch, var(--accent) 5%, transparent); }
.event-row.is-selected { background: color-mix(in oklch, var(--accent) 10%, transparent); }
.event-row.is-selected::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--accent); }
.event-row__rarity { display: grid; height: 2.75rem; place-items: center; border: 1px solid var(--line-strong); border-radius: var(--radius-control); color: var(--text); font-size: .8125rem; font-weight: 700; }
.event-row__rarity.is-success { border-color: color-mix(in oklch, var(--success) 50%, var(--line)); color: var(--success); }
.event-row__rarity.is-error { border-color: color-mix(in oklch, var(--danger) 50%, var(--line)); color: var(--danger); }
.event-row__rarity.is-info { border-color: color-mix(in oklch, var(--info) 50%, var(--line)); color: var(--info); }
.event-row__main { display: grid; min-width: 0; gap: 2px; }
.event-row__title { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.event-row__title strong { overflow: hidden; font-size: .9875rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.event-row__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--space-3); font-size: var(--type-caption-size); }
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
.detail-probability__value { color: var(--accent); font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.detail-probability p { margin: 0; color: var(--muted); }
.detail-probability b { color: var(--text); font-weight: 600; }
.description { margin: 0; color: var(--text); line-height: 1.65; }
.challenges { display: grid; gap: var(--space-2); }
.challenges h3 { margin: 0; }
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
  .filters { flex-direction: column; flex-wrap: nowrap; }
  .filters > * { flex: 0 0 auto; }
  .filter-toggle { display: inline-flex; }
  .filter-panel { display: none; gap: var(--space-3); }
  .filter-panel[data-open="true"] { display: grid; }
}
@container (max-width: 39.99rem) {
  .event-row { grid-template-columns: 2.5rem minmax(0, 1fr); padding: var(--space-3); }
  .event-row__rarity { height: 2.5rem; }
  .event-row__prob { grid-column: 2; }
  .event-row__desc { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
}
/* Wide panels: filters become a sticky side rail so results stay in view while refining. */
@container (min-width: 60rem) {
  .event-directory { grid-template-columns: 16.5rem minmax(0, 1fr); grid-template-rows: auto 1fr; align-items: start; gap: var(--space-4) var(--space-8); }
  .event-directory > :not(.filters) { grid-column: 2; }
  .filters { position: sticky; top: var(--sticky-chrome-top); grid-row: 1 / span 2; flex-direction: column; flex-wrap: nowrap; max-height: calc(100dvh - var(--sticky-chrome-top) - var(--space-4)); padding-right: var(--space-2); overflow-y: auto; scrollbar-width: thin; }
  .filters > *, .filters__search { flex: none; }
  .filter-panel > .quick-filters, .filter-panel > .refine-filters { flex: none; }
  .quick-filters { gap: var(--space-5); padding: var(--space-4) 0; border-width: 1px 0; border-radius: 0; background: none; }
  .quick-filters .chip-row__label { flex: 1 1 100%; }
  .refine-filters { flex-direction: column; align-items: stretch; gap: var(--space-3); }
  .refine-filters > :deep([data-slot="base"]) { min-width: 0; }
  .result-summary { padding-top: 0; border-top: 0; }
}
</style>

<style>
@media (prefers-reduced-motion: reduce) {
  .event-detail-surface { transition-duration: 1ms !important; }
}
</style>
