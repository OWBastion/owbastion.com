<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import type { Map, MapChallenge } from "~/types/challenge";
import type { OwnedTitle } from "~/types/title";
import { achievementState, findOwnedTitle } from "~/utils/achievement-status";
import PlayerReviewPanel from "../reviews/PlayerReviewPanel.vue";

const props = defineProps<{
  map: Map | null;
  challenges: MapChallenge[];
  authenticated: boolean;
  titles?: OwnedTitle[];
}>();

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ "review-changed": [] }>();
const difficultyRank = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;
const mapChallenges = computed(() => {
  if (!props.map) return [];
  return [...props.challenges.filter((challenge) => challenge.mapId === props.map?.mapId)].sort((left, right) => {
    if (left.kind === "pioneer" && right.kind !== "pioneer") return -1;
    if (right.kind === "pioneer" && left.kind !== "pioneer") return 1;
    const rank = (value?: string) => {
      const index = difficultyRank.indexOf(value as (typeof difficultyRank)[number]);
      return index === -1 ? difficultyRank.length : index;
    };
    return rank(left.difficulty) - rank(right.difficulty) || left.name.localeCompare(right.name, "zh-CN");
  });
});
const difficultyLabel = computed(() => mapChallenges.value.map((challenge) => challenge.difficulty).filter(Boolean).join("、") || "暂无记录");
const mapIndex = computed(() => props.map?.mapId.split(".").at(-1)?.slice(0, 2).toUpperCase() ?? "");
const tier = computed(() => Number(/^T(\d)$/.exec(props.map?.difficultyRating ?? "")?.[1] ?? 0));
const challengeStatusLabel = (status: MapChallenge["status"]) => status === "sunsetting" ? "即将结束" : "";
const hydrated = shallowRef(false);
const isDesktop = useMediaQuery("(min-width: 768px)");
const reducedMotion = usePreferredReducedMotion();
const allowMotion = computed(() => reducedMotion.value !== "reduce");
const [DefineDetailContent, ReuseDetailContent] = createReusableTemplate();

onMounted(() => { hydrated.value = true; });
</script>

<template>
  <DefineDetailContent>
    <div v-if="map" class="detail-card">
      <div class="detail-hero" aria-hidden="true">
        <img v-if="map.coverUrl" :src="map.coverUrl" alt="" />
        <span v-else class="detail-hero__index">{{ mapIndex }}</span>
        <span class="detail-hero__tier num" :data-tier="tier">{{ map.difficultyRating ?? "—" }}</span>
      </div>
      <div class="detail-content">
        <section class="detail-section" aria-labelledby="map-overview-title">
          <h3 id="map-overview-title" class="sr-only">地图概览</h3>
          <dl class="detail-stats">
            <div><dt>地图评级</dt><dd class="num">{{ map.difficultyRating ?? "暂无记录" }}</dd></div>
            <div><dt>挑战</dt><dd class="num">{{ mapChallenges.length }} 项</dd></div>
            <div><dt>挑战难度</dt><dd>{{ difficultyLabel }}</dd></div>
          </dl>
          <div v-if="map.mechanics?.length" class="mechanics-row"><span>特殊机制</span><div class="mechanics"><UBadge v-for="mechanic in map.mechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle" /></div></div>
        </section>
        <section v-if="mapChallenges.length" class="detail-section" aria-labelledby="map-challenges-title">
          <div class="section-title"><h3 id="map-challenges-title">挑战</h3></div>
          <ul class="challenge-list stacked-list">
            <li v-for="challenge in mapChallenges" :key="challenge.challengeId">
              <strong>{{ challenge.name }}</strong>
              <AchievementStatus v-if="titles && challenge.titleKey" :state="achievementState(findOwnedTitle(titles, { titleKey: challenge.titleKey, mapId: challenge.mapId, gameplayRevisionId: challenge.gameplayRevisionId }))" />
              <span>{{ [challenge.difficulty, challengeStatusLabel(challenge.status)].filter(Boolean).join(" · ") || "—" }}</span>
            </li>
          </ul>
        </section>
        <PlayerReviewPanel v-if="map" target-type="map" :target-id="map.mapId" :gameplay-revision-id="map.defaultGameplayRevisionId ?? null" :authenticated="authenticated" @review-changed="emit('review-changed')" />
      </div>
    </div>
  </DefineDetailContent>

  <template v-if="hydrated">
    <UModal
      v-if="isDesktop"
      v-model:open="open"
      :title="map?.mapName ?? '地图详情'"
      :description="map ? `版本 ${map.gameVersion}` : undefined"
      scrollable
      close
      :transition="allowMotion"
      :ui="{ content: 'overlay-sheet overlay-sheet--modal map-detail-surface glass-heavy elevation-3 w-[calc(100vw-2rem)] max-w-3xl max-h-[calc(100dvh-2rem)]', header: 'overlay-sheet__header glass-segment', body: 'overlay-sheet__body p-0 sm:p-0' }"
    >
      <template #body>
        <ReuseDetailContent />
      </template>
    </UModal>

    <UDrawer
      v-else
      v-model:open="open"
      direction="bottom"
      :title="map?.mapName ?? '地图详情'"
      :description="map ? `版本 ${map.gameVersion}` : undefined"
      close
      :should-scale-background="false"
      :set-background-color-on-scale="false"
      :ui="{ content: 'overlay-sheet overlay-sheet--drawer map-detail-surface glass-heavy elevation-3 max-h-[calc(100dvh-1rem)]', container: 'overlay-sheet__container', header: 'overlay-sheet__header glass-segment', body: 'overlay-sheet__body p-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]' }"
    >
      <template #body>
        <ReuseDetailContent />
      </template>
    </UDrawer>
  </template>
</template>

<style scoped>
/* container-type lives on the card so .detail-content (below) can query the
   card's own width; a size container cannot query itself. */
.detail-card { container-type: inline-size; min-width: 0; padding-block: 0 max(var(--space-5), env(safe-area-inset-bottom)); }
.detail-content { display: grid; gap: 0; padding-inline: clamp(var(--space-4), 4vw, var(--space-6)); }
.detail-section { display: grid; gap: var(--space-4); padding: var(--space-5) 0; border-top: 1px solid var(--line); }
.detail-section:first-child { padding-top: var(--space-5); border-top: 0; }
.section-title { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.section-title h3 { margin: 0; color: var(--text); font-size: 1rem; letter-spacing: -.025em; }
.section-title > span { color: var(--quiet); font-size: .75rem; }
.detail-hero { position: relative; display: grid; place-items: center; aspect-ratio: 21 / 8; overflow: hidden; color: var(--accent); background: repeating-linear-gradient(135deg, transparent 0 10px, color-mix(in oklch, var(--accent) 7%, transparent) 10px 11px), radial-gradient(80% 90% at 70% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 70%), var(--surface-raised); }
.detail-hero img { width: 100%; height: 100%; object-fit: cover; }
.detail-hero__index { font-family: var(--font-display); font-size: clamp(4rem, 18cqi, 8rem); font-weight: 700; opacity: .2; }
.detail-hero__tier { position: absolute; top: var(--space-4); right: var(--space-4); min-width: 3rem; padding: .2rem .6rem; border-radius: calc(var(--radius-control) / 1.5); color: oklch(15% 0.02 150); background: oklch(80% 0.02 150); font-size: 1rem; font-weight: 700; text-align: center; }
.detail-hero__tier[data-tier="1"] { background: oklch(85% 0.17 135); }
.detail-hero__tier[data-tier="2"] { background: oklch(86% 0.16 110); }
.detail-hero__tier[data-tier="3"] { background: oklch(84% 0.15 80); }
.detail-hero__tier[data-tier="4"] { background: oklch(76% 0.16 55); }
.detail-hero__tier[data-tier="5"] { color: oklch(98% 0.01 30); background: oklch(62% 0.2 28); }
.detail-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border: 1px solid var(--line); border-radius: var(--radius-control); }
.detail-stats > div { display: grid; gap: 2px; padding: var(--space-3) var(--space-4); min-width: 0; }
.detail-stats > div + div { border-left: 1px solid var(--line); }
.detail-stats dt { color: var(--quiet); font-size: var(--type-caption-size); }
.detail-stats dd { margin: 0; overflow-wrap: anywhere; color: var(--text); font-size: .9375rem; font-weight: 600; }
.challenge-list { gap: 0; }
.challenge-list li + li { border-top: 1px solid var(--line); }
.challenge-list li { display: flex; align-items: center; padding-block: var(--space-3); justify-content: space-between; gap: var(--space-3); }
.challenge-list strong { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; color: var(--text); font-size: .84rem; }
.challenge-list span:not(.status-badge) { flex: 0 0 auto; color: var(--quiet); font-size: .76rem; }
@container (max-width: 23.99rem) {
  .detail-content { padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right)); }
  .detail-section { gap: var(--space-3); padding: var(--space-4) 0; }
  .detail-section:first-child { padding-top: var(--space-4); }
  .detail-stats { grid-template-columns: 1fr; }
  .detail-stats > div + div { border-top: 1px solid var(--line); border-left: 0; }
}
@media (prefers-reduced-motion: reduce) { .detail-card :deep(*) { scroll-behavior: auto; } }
</style>

<style>
@media (prefers-reduced-motion: reduce) {
  .map-detail-surface { transition-duration: 1ms !important; }
}
</style>
