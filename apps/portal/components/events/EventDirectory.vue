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
  overlayOpen.value = true;
};
const statusText = (value: RandomEvent["releaseStatus"]) => value === "implemented" ? "已实装" : value === "removed" ? "已移除" : "开发中";
const challengeHref = (challenge: EventChallenge) => challenge.family === "map"
  ? (challenge.mapId ? `/maps?mapId=${encodeURIComponent(challenge.mapId)}` : "/maps")
  : "/achievements";
const challengeAction = (challenge: EventChallenge) => challenge.family === "map" ? "查看地图" : "查看成就";
const categoryColor = (value: string) => value === "减益" ? "error" : value === "增益" ? "success" : value === "机制" ? "info" : "neutral";
const unannotatedEffectTags = (event: RandomEvent) => event.effectTags.filter((value) => !event.effectAnnotations.some((annotation) => annotation.tag === value));
const visibleEffectChips = (event: RandomEvent) => {
  const rawTags = unannotatedEffectTags(event);
  const annotations = event.effectAnnotations.slice(0, 3);
  return {
    annotations,
    rawTags: rawTags.slice(0, Math.max(0, 3 - annotations.length)),
    overflow: Math.max(0, event.effectAnnotations.length + rawTags.length - 3),
  };
};
const reviewSummaries = useReviewSummaries("event", () => props.events.map((event) => event.eventId));
const reviewLoading = computed(() => reviewSummaries.loading.value);
const reviewError = computed(() => reviewSummaries.error.value);
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
        <UButton v-for="value in groupOptions" :key="value" :label="value" size="md" :color="isOn('groups', value) ? 'primary' : 'neutral'" :variant="isOn('groups', value) ? 'soft' : 'outline'" :aria-pressed="isOn('groups', value)" :disabled="!isOn('groups', value) && !countFor('groups', value)" @click="toggle('groups', value)">
          <template #trailing><span class="chip-count num">{{ countFor("groups", value) }}</span></template>
        </UButton>
      </div>
      <div v-if="tagOptions.length" class="chip-row" role="group" aria-label="常见效果">
        <span class="chip-row__label type-label-sm">常见效果</span>
        <UButton v-for="value in tagOptions" :key="value" :label="value" size="md" :color="isOn('tags', value) ? 'primary' : 'neutral'" :variant="isOn('tags', value) ? 'soft' : 'outline'" :aria-pressed="isOn('tags', value)" :disabled="!isOn('tags', value) && !countFor('tags', value)" @click="toggle('tags', value)">
          <template #trailing><span class="chip-count num">{{ countFor("tags", value) }}</span></template>
        </UButton>
      </div>
    </div>

    <div class="refine-filters">
      <div v-if="categoryOptions.length" class="chip-row" role="group" aria-label="类别">
        <UButton v-for="value in categoryOptions" :key="value" :label="value" size="md" :color="isOn('categories', value) ? 'primary' : 'neutral'" :variant="isOn('categories', value) ? 'soft' : 'outline'" :aria-pressed="isOn('categories', value)" :disabled="!isOn('categories', value) && !countFor('categories', value)" @click="toggle('categories', value)">
          <template #trailing><span class="chip-count num">{{ countFor("categories", value) }}</span></template>
        </UButton>
      </div>
      <div v-if="rarityOptions.length" class="chip-row" role="group" aria-label="稀有度">
        <UButton v-for="value in rarityOptions" :key="value" :label="value" size="md" :color="isOn('rarities', value) ? 'primary' : 'neutral'" :variant="isOn('rarities', value) ? 'soft' : 'outline'" :aria-pressed="isOn('rarities', value)" :disabled="!isOn('rarities', value) && !countFor('rarities', value)" @click="toggle('rarities', value)">
          <template #trailing><span class="chip-count num">{{ countFor("rarities", value) }}</span></template>
        </UButton>
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

    <div v-if="filteredEvents.length" class="event-groups">
      <section v-for="section in sections" :key="section.key" class="event-group" :aria-label="section.label || '事件'">
        <div v-if="section.label" class="group-heading">
          <h2>{{ section.label }}</h2>
          <span class="type-label-sm num">{{ section.events.length }} 项事件</span>
        </div>
        <div class="directory-grid">
          <article v-for="event in section.events" :key="event.eventId" class="event-card interactive-card">
            <button class="event-card-main pressable-soft" type="button" aria-haspopup="dialog" @click="openEvent(event)">
              <div class="event-card-title-row">
                <h3 class="type-card-title">{{ event.name }}</h3>
                <StatusBadge v-if="event.releaseStatus !== 'implemented'" :label="statusText(event.releaseStatus)" tone="warning" />
              </div>
              <div class="card-meta type-label-sm">
                <span v-if="event.eventGroup" class="event-group-label">{{ event.eventGroup }}</span>
                <span class="event-category" :class="`is-${categoryColor(event.category)}`">{{ event.category }}</span>
                <span v-if="event.rarity" class="event-rarity">{{ event.rarity }}</span>
                <span class="event-version num">{{ event.gameVersion }}</span>
              </div>
              <p class="type-label-sm">{{ event.description }}</p>
            </button>
            <div class="event-card-footer">
              <EventProbabilityMeter :probability="appearance(event)" :max="maxAppearance" label="概率" />
              <p v-if="detailFacts(event).length" class="event-facts type-caption num">{{ detailFacts(event).join(" · ") }}</p>
              <div class="event-tags">
                <EffectGlossaryTooltip v-for="annotation in visibleEffectChips(event).annotations" :key="annotation.term.key" :annotation="annotation" />
                <UBadge v-for="tag in visibleEffectChips(event).rawTags" :key="`raw-${tag}`" :label="tag" color="neutral" variant="subtle" />
                <span v-if="visibleEffectChips(event).overflow" class="effect-overflow type-caption">+{{ visibleEffectChips(event).overflow }}</span>
              </div>
              <ReviewSummaryBadge :summary="reviewSummaries.summaryFor(event.eventId)" :loading="reviewLoading" :error="reviewError" />
            </div>
          </article>
        </div>
      </section>
    </div>
    <UEmpty v-else title="没有符合条件的事件" description="去掉部分条件再试试。" variant="naked">
      <template v-if="hasActiveFilters" #actions><UButton label="清除条件" color="neutral" variant="outline" @click="clearFilters" /></template>
    </UEmpty>

    <DefineHeaderTags>
      <div v-if="selected" class="detail-header-tags">
        <UBadge v-if="selected.eventGroup" :label="selected.eventGroup" color="primary" variant="outline" />
        <UBadge :label="selected.category" :color="categoryColor(selected.category)" variant="subtle" />
        <UBadge v-if="selected.rarity" :label="selected.rarity" color="neutral" variant="outline" />
        <UBadge :label="selected.gameVersion" color="neutral" variant="subtle" />
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

    <template v-if="hydrated">
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
.event-directory { container-type: inline-size; display: grid; gap: var(--space-5); }
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
.chip-count { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 500; }
.result-summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); }
.event-groups { display: grid; gap: var(--space-8); }
.event-group { display: grid; gap: var(--space-3); }
.group-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--line); }
.group-heading h2 { margin: 0; font-size: var(--type-caption-size); font-weight: 600; letter-spacing: 0.01em; }
.group-heading span { color: var(--quiet); }
.event-card {
  container-type: inline-size;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  border-radius: var(--radius-card);
  background: color-mix(in oklch, var(--surface-raised) 88%, transparent);
}
.event-card-main {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) 0;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.event-card-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.event-card-title-row h3 { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); color: var(--muted); }
.event-group-label { padding: 0 var(--space-2); border: 1px solid color-mix(in oklch, var(--accent) 55%, var(--line)); border-radius: var(--radius-pill); color: var(--accent); font-weight: 600; }
.event-category { font-weight: 600; }
.event-category.is-success { color: var(--success); }
.event-category.is-error { color: var(--danger); }
.event-category.is-info { color: var(--info); }
.event-rarity { font-weight: 600; }
.event-version { color: var(--quiet); }
.event-facts { margin: 0; color: var(--quiet); }
.event-card p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.event-card-footer { display: grid; gap: var(--space-2); align-content: end; padding: var(--space-3) var(--space-4) var(--space-4); }
.event-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.effect-overflow { color: var(--quiet); }
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
@container (max-width: 23.99rem) {
  .event-card-main { padding: var(--space-3) var(--space-3) 0; }
  .event-card-footer { padding: var(--space-3); }
}
@media (prefers-reduced-transparency: reduce) {
  .event-card { background: var(--surface-raised); }
}
</style>

<style>
@media (prefers-reduced-motion: reduce) {
  .event-detail-surface { transition-duration: 1ms !important; }
}
</style>
