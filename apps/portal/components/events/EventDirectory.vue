<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import type { EventChallenge, RandomEvent } from "~/types/random-event";
import EffectGlossaryTooltip from "~/components/events/EffectGlossaryTooltip.vue";
import PlayerReviewPanel from "~/components/reviews/PlayerReviewPanel.vue";
import { useReviewSummaries } from "~/composables/useReviewSummaries";
import { calculateEventProbabilities, formatProbability } from "~/utils/event-probabilities";

const props = defineProps<{ events: RandomEvent[]; authenticated: boolean }>();
const query = shallowRef("");
const category = shallowRef("all");
const rarity = shallowRef("all");
const status = shallowRef<RandomEvent["releaseStatus"] | "all">("implemented");
const selected = shallowRef<RandomEvent | null>(null);
const overlayOpen = shallowRef(false);
const hydrated = shallowRef(false);
const isDesktop = useMediaQuery("(min-width: 768px)");
const reducedMotion = usePreferredReducedMotion();
const allowMotion = computed(() => reducedMotion.value !== "reduce");
const [DefineDetailContent, ReuseDetailContent] = createReusableTemplate();
const [DefineHeaderTags, ReuseHeaderTags] = createReusableTemplate();

const categories = computed(() => [...new Set(props.events.map((event) => event.category))].sort());
const rarities = computed(() => [...new Set(props.events.map((event) => event.rarity))].sort());
const filteredEvents = computed(() => props.events.filter((event) => (status.value === "all" || event.releaseStatus === status.value) && (category.value === "all" || event.category === category.value) && (rarity.value === "all" || event.rarity === rarity.value) && (!query.value.trim() || `${event.name}${event.description}`.includes(query.value.trim()))));
const groupedEvents = computed(() => {
  const groups = new Map<string, RandomEvent[]>();
  for (const event of filteredEvents.value) groups.set(event.gameVersion, [...(groups.get(event.gameVersion) ?? []), event]);
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left, undefined, { numeric: true }))
    .map(([version, events]) => ({ version, events: events.sort((left, right) => left.name.localeCompare(right.name)) }));
});
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
const probability = (event: RandomEvent) => calculateEventProbabilities(event, props.events);
const reviewSummaries = useReviewSummaries("event", () => props.events.map((event) => event.eventId));
const reviewLoading = computed(() => reviewSummaries.loading.value);
const reviewError = computed(() => reviewSummaries.error.value);
const refreshReviewSummaries = () => reviewSummaries.refresh();

onMounted(() => { hydrated.value = true; });
</script>

<template>
  <section class="event-directory" aria-label="随机事件目录">
    <div class="filters">
      <UInput v-model="query" size="lg" placeholder="搜索事件" aria-label="搜索事件" />
      <USelect v-model="status" size="lg" :items="[{ label: '已实装事件', value: 'implemented' }, { label: '全部状态', value: 'all' }, { label: '已移除事件', value: 'removed' }]" aria-label="筛选事件状态" />
      <USelect v-model="category" size="lg" :items="[{ label: '全部类别', value: 'all' }, ...categories.map((value) => ({ label: value, value }))]" aria-label="筛选事件类别" />
      <USelect v-model="rarity" size="lg" :items="[{ label: '全部稀有度', value: 'all' }, ...rarities.map((value) => ({ label: value, value }))]" aria-label="筛选事件稀有度" />
    </div>

    <div v-if="groupedEvents.length" class="event-groups">
      <section v-for="group in groupedEvents" :key="group.version" class="event-group" :aria-labelledby="`event-version-${group.version}`">
        <div class="group-heading">
          <h2 :id="`event-version-${group.version}`">{{ group.version }}</h2>
          <span class="type-label-sm">{{ group.events.length }} 项事件</span>
        </div>
        <div class="directory-grid">
          <article v-for="event in group.events" :key="event.eventId" class="event-card interactive-card">
            <button class="event-card-main pressable-soft" type="button" aria-haspopup="dialog" @click="openEvent(event)">
              <div class="event-card-title-row">
                <h3 class="type-card-title">{{ event.name }}</h3>
                <StatusBadge :label="statusText(event.releaseStatus)" :tone="event.releaseStatus === 'implemented' ? 'success' : 'warning'" />
              </div>
              <div class="card-meta type-label-sm">
                <span class="event-category">{{ event.category }}</span>
                <span class="event-rarity">{{ event.rarity }}</span>
              </div>
              <p class="type-label-sm">{{ event.description }}</p>
            </button>
            <div class="event-card-footer">
              <ReviewSummaryBadge :summary="reviewSummaries.summaryFor(event.eventId)" :loading="reviewLoading" :error="reviewError" />
              <div class="event-tags">
                <EffectGlossaryTooltip v-for="annotation in visibleEffectChips(event).annotations" :key="annotation.term.key" :annotation="annotation" />
                <UBadge v-for="tag in visibleEffectChips(event).rawTags" :key="`raw-${tag}`" :label="tag" color="neutral" variant="subtle" />
                <span v-if="visibleEffectChips(event).overflow" class="effect-overflow type-caption">+{{ visibleEffectChips(event).overflow }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
    <UEmpty v-else title="暂无事件" variant="naked" />

    <DefineHeaderTags>
      <div v-if="selected" class="detail-header-tags">
        <UBadge :label="selected.category" :color="categoryColor(selected.category)" variant="subtle" />
        <UBadge :label="selected.rarity" color="primary" variant="subtle" />
        <UBadge :label="selected.gameVersion" color="neutral" variant="subtle" />
      </div>
    </DefineHeaderTags>

    <DefineDetailContent>
      <div v-if="selected" class="detail">
        <p class="description">{{ selected.description }}</p>
        <dl class="detail-grid">
          <div class="detail-grid__row"><dt>持续时间</dt><dd :class="{ 'detail-grid__empty': selected.durationSeconds === null }">{{ selected.durationSeconds === null ? "暂无记录" : `${selected.durationSeconds} 秒` }}</dd></div>
          <div class="detail-grid__row"><dt>内置冷却</dt><dd :class="{ 'detail-grid__empty': selected.cooldownSeconds === null }">{{ selected.cooldownSeconds === null ? "暂无记录" : `${selected.cooldownSeconds} 秒` }}</dd></div>
          <div class="detail-grid__row"><dt>权重</dt><dd :class="{ 'detail-grid__empty': selected.weight === null || selected.weight === undefined }">{{ selected.weight ?? "暂无记录" }}</dd></div>
        </dl>
        <UAccordion :items="[{ label: '概率统计', slot: 'probability' }]">
          <template #probability>
            <dl class="detail-grid">
              <div class="detail-grid__row"><dt>类别概率</dt><dd>{{ formatProbability(probability(selected).categoryProbability) }}</dd></div>
              <div class="detail-grid__row"><dt>单次失败率</dt><dd>{{ formatProbability(probability(selected).failureProbability) }}</dd></div>
              <div class="detail-grid__row"><dt>保底触发率</dt><dd>{{ formatProbability(probability(selected).guaranteeProbability) }}</dd></div>
              <div class="detail-grid__row"><dt>最终出现概率</dt><dd>{{ formatProbability(probability(selected).appearanceProbability) }}</dd></div>
              <div class="detail-grid__row"><dt>全局出现概率</dt><dd>{{ formatProbability(probability(selected).globalAppearanceProbability) }}</dd></div>
            </dl>
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
.event-directory { display: grid; gap: var(--space-5); }
.filters { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.filters > * { flex: 1 1 10rem; min-width: 0; }
.filters > :first-child { flex-grow: 2; flex-basis: 16rem; }
.filters :deep([data-slot="base"]),
.filters :deep(button),
.filters :deep(input) { min-height: var(--control-lg); }
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
.event-rarity::before { content: "·"; margin-right: var(--space-2); }
.event-card p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.event-card-footer { display: grid; gap: var(--space-3); align-content: end; padding: var(--space-3) var(--space-4) var(--space-4); }
.event-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.effect-overflow { color: var(--quiet); }
.detail { display: grid; gap: var(--space-4); }
.detail-header-tags { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-2); }
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
