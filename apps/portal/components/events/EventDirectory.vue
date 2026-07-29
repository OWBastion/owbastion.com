<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import type { RandomEvent } from "~/types/random-event";
import EffectGlossaryTooltip from "~/components/events/EffectGlossaryTooltip.vue";
import { calculateEventProbabilities, formatProbability } from "~/utils/event-probabilities";

const props = defineProps<{ events: RandomEvent[] }>();
const query = shallowRef("");
const category = shallowRef("all");
const rarity = shallowRef("all");
const status = shallowRef<RandomEvent["releaseStatus"] | "all">("implemented");
const selected = shallowRef<RandomEvent | null>(null);
const hydrated = shallowRef(false);
const isDesktop = useMediaQuery("(min-width: 768px)");
const reducedMotion = usePreferredReducedMotion();
const [DefineDetailContent, ReuseDetailContent] = createReusableTemplate();

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
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (open) => { if (!open) selected.value = null; },
});
const statusText = (value: RandomEvent["releaseStatus"]) => value === "implemented" ? "已实装" : value === "removed" ? "已移除" : "开发中";
const categoryColor = (value: string) => value === "减益" ? "error" : value === "增益" ? "success" : value === "机制" ? "info" : "neutral";
const unannotatedEffectTags = (event: RandomEvent) => event.effectTags.filter((value) => !event.effectAnnotations.some((annotation) => annotation.tag === value));
const probability = (event: RandomEvent) => calculateEventProbabilities(event, props.events);

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
          <span>{{ group.events.length }} 项事件</span>
        </div>
        <div class="event-grid">
          <button v-for="event in group.events" :key="event.eventId" class="event-card pressable-soft" type="button" @click="selected = event">
            <div class="card-top">
              <div class="card-badges">
                <UBadge :label="event.category" :color="categoryColor(event.category)" variant="subtle" />
                <span class="event-rarity">{{ event.rarity }}</span>
              </div>
              <StatusBadge :label="statusText(event.releaseStatus)" :tone="event.releaseStatus === 'implemented' ? 'success' : 'warning'" />
            </div>
            <h3>{{ event.name }}</h3>
            <p>{{ event.description }}</p>
            <div class="event-tags">
              <EffectGlossaryTooltip v-for="annotation in event.effectAnnotations" :key="annotation.term.key" :annotation="annotation" />
              <UBadge
                v-for="tag in event.effectTags.filter((value) => !event.effectAnnotations.some((annotation) => annotation.tag === value))"
                :key="`raw-${tag}`"
                :label="tag"
                color="neutral"
                variant="subtle"
              />
            </div>
          </button>
        </div>
      </section>
    </div>
    <UEmpty v-else title="暂无事件" description="没有符合当前筛选条件的事件。" variant="naked" />

    <DefineDetailContent>
      <div v-if="selected" class="detail">
        <UBadge :label="selected.category" :color="categoryColor(selected.category)" variant="subtle" class="detail-category" />
        <p class="description">{{ selected.description }}</p>
        <dl>
          <div><dt>稀有度</dt><dd>{{ selected.rarity }}</dd></div>
          <div><dt>持续时间</dt><dd>{{ selected.durationSeconds === null ? "暂无记录" : `${selected.durationSeconds} 秒` }}</dd></div>
          <div><dt>内置冷却</dt><dd>{{ selected.cooldownSeconds === null ? "暂无记录" : `${selected.cooldownSeconds} 秒` }}</dd></div>
          <div><dt>权重</dt><dd>{{ selected.weight ?? "暂无记录" }}</dd></div>
          <div><dt>类别概率</dt><dd>{{ formatProbability(probability(selected).categoryProbability) }}</dd></div>
          <div><dt>同类事件数</dt><dd>{{ probability(selected).groupSize }}</dd></div>
          <div><dt>组内总权重</dt><dd>{{ probability(selected).groupTotalWeight ?? "暂无记录" }}</dd></div>
          <div><dt>单次失败率</dt><dd>{{ formatProbability(probability(selected).failureProbability) }}</dd></div>
          <div><dt>保底触发率</dt><dd>{{ formatProbability(probability(selected).guaranteeProbability) }}</dd></div>
          <div><dt>最终出现概率</dt><dd>{{ formatProbability(probability(selected).appearanceProbability) }}</dd></div>
          <div><dt>全局出现概率</dt><dd>{{ formatProbability(probability(selected).globalAppearanceProbability) }}</dd></div>
        </dl>
        <div class="event-tags">
          <EffectGlossaryTooltip v-for="annotation in selected.effectAnnotations" :key="annotation.term.key" :annotation="annotation" />
          <UBadge v-for="tag in unannotatedEffectTags(selected)" :key="`detail-${tag}`" :label="tag" color="neutral" variant="subtle" />
        </div>
        <section class="challenges">
          <h3>开放挑战</h3>
          <p v-if="!selected.challenges.length" class="muted">暂无开放挑战。</p>
          <NuxtLink v-for="challenge in selected.challenges" :key="challenge.challengeId" to="/achievements" class="challenge-link pressable-soft">
            {{ challenge.family === "map" ? challenge.name : challenge.titleName }}
            <span>查看成就 →</span>
          </NuxtLink>
        </section>
      </div>
    </DefineDetailContent>

    <template v-if="hydrated">
      <UModal
        v-if="isDesktop"
        v-model:open="detailOpen"
        :title="selected?.name ?? '事件详情'"
        :description="selected ? `版本 ${selected.gameVersion}` : undefined"
        close
        scrollable
        :transition="reducedMotion !== 'reduce'"
        :ui="{ content: 'event-detail-surface event-detail-modal w-[calc(100vw-2rem)] max-w-2xl max-h-[calc(100dvh-2rem)]' }"
      >
        <template #body>
          <ReuseDetailContent />
        </template>
      </UModal>

      <UDrawer
        v-else
        v-model:open="detailOpen"
        direction="bottom"
        :title="selected?.name ?? '事件详情'"
        :description="selected ? `版本 ${selected.gameVersion}` : undefined"
        close
        should-scale-background
        set-background-color-on-scale
        :ui="{ content: 'event-detail-surface event-detail-drawer max-h-[calc(100dvh-1rem)]', body: 'pb-[max(1rem,env(safe-area-inset-bottom))]' }"
      >
        <template #body>
          <ReuseDetailContent />
        </template>
      </UDrawer>
    </template>
  </section>
</template>

<style scoped>
.event-card { grid-template-rows: auto auto minmax(0, 1fr) auto; }
.event-directory { display: grid; gap: 22px; }
.filters { display: grid; grid-template-columns: minmax(0, 1fr) repeat(3, minmax(140px, 160px)); gap: 10px; align-items: stretch; }
.filters :deep([data-slot="base"]),
.filters :deep(button),
.filters :deep(input) { min-height: 44px; }
.event-groups { display: grid; gap: 30px; }
.event-group { display: grid; gap: 12px; }
.group-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.group-heading h2 { margin: 0; font-size: .95rem; letter-spacing: .01em; }
.group-heading span { color: var(--quiet); font-size: .8rem; }
.event-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }
.event-card {
  display: grid;
  min-height: 210px;
  align-content: start;
  gap: 13px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text);
  background: color-mix(in oklch, var(--surface-raised) 88%, transparent);
  cursor: pointer;
  text-align: left;
}
.event-card:hover, .event-card:focus-visible { border-color: var(--line-strong); box-shadow: 0 14px 26px -22px var(--shadow); }
.card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-badges { display: flex; align-items: center; gap: 8px; }
.event-rarity { color: var(--accent); font-size: .72rem; font-weight: 750; letter-spacing: .06em; }
.event-card h3 { margin: 0; font-size: 1.08rem; letter-spacing: -.035em; }
.event-card p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--quiet);
  font-size: .84rem;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.event-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.detail { display: grid; gap: 18px; }
.detail-category { width: fit-content; }
.description { margin: 0; color: var(--text); line-height: 1.65; }
.detail dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; margin: 0; border-top: 1px solid var(--line); }
.detail dl div { display: flex; justify-content: space-between; gap: 10px; padding: 11px 0; border-bottom: 1px solid var(--line); }
.detail dl div:nth-child(odd) { padding-right: 16px; }
.detail dt { color: var(--muted); font-size: .8rem; }
.detail dd { margin: 0; font-size: .82rem; font-weight: 650; }
.challenges { display: grid; gap: 8px; }
.challenges h3 { margin: 0; font-size: 1rem; }
.challenge-link {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text);
  background: var(--surface);
  text-decoration: none;
}
.challenge-link:hover, .challenge-link:focus-visible { border-color: var(--line-strong); }
.challenge-link span, .muted { color: var(--quiet); font-size: .8rem; }

@media (max-width: 760px) {
  .filters { grid-template-columns: 1fr 1fr; }
  .filters > :first-child { grid-column: 1 / -1; }
  .event-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .event-grid { grid-template-columns: 1fr; }
  .detail dl { grid-template-columns: 1fr; }
  .detail dl div:nth-child(odd) { padding-right: 0; }
}
@media (prefers-reduced-transparency: reduce) {
  .event-card { background: var(--surface-raised); }
}
</style>

<style>
.event-detail-surface {
  border: 1px solid color-mix(in oklch, var(--line-strong) 78%, transparent);
  background: color-mix(in oklch, var(--surface) 90%, transparent);
  box-shadow: 0 24px 80px color-mix(in oklch, var(--shadow) 80%, transparent);
  backdrop-filter: blur(20px) saturate(1.12);
}
.event-detail-modal { border-radius: 20px; overflow: hidden; }
.event-detail-drawer { border-bottom: 0; border-radius: 20px 20px 0 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .event-detail-surface { transition-duration: 1ms !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .event-detail-surface { background: var(--surface); backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  .event-detail-surface { border-color: var(--text); }
}
</style>
