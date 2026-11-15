<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";
import type { ActiveChallenge } from "@owbastion/contracts";
import type { Map, MapChallenge } from "~/types/challenge";
import type { OwnedTitle } from "~/types/title";
import { findOwnedTitle } from "~/utils/achievement-status";
import { mapRatingBonusLabel } from "~/utils/map-rating";
import PlayerReviewPanel from "../reviews/PlayerReviewPanel.vue";

const props = defineProps<{
  map: Map | null;
  challenges: MapChallenge[];
  authenticated: boolean;
  titles?: OwnedTitle[];
  active?: ActiveChallenge | null;
  now?: number;
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
const mapIndex = computed(() => props.map?.mapId.split(".").at(-1)?.slice(0, 2).toUpperCase() ?? "");
const tier = computed(() => /^T(\d)$/.exec(props.map?.difficultyRating ?? "")?.[1]);
const ratingBonus = computed(() => mapRatingBonusLabel(props.map?.difficultyRating));
const challengeStatusLabel = (status: MapChallenge["status"]) => status === "sunsetting" ? "即将结束" : "";
const isOwned = (challenge: MapChallenge) => Boolean(props.titles && challenge.titleKey && findOwnedTitle(props.titles, { titleKey: challenge.titleKey, mapId: challenge.mapId, gameplayRevisionId: challenge.gameplayRevisionId }));
const isLive = (challenge: MapChallenge) => Boolean(props.active && challenge.kind === "pioneer");
const earnedCount = computed(() => mapChallenges.value.filter(isOwned).length);
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
        <span v-if="map.difficultyRating" class="detail-hero__tier num" :data-tier="tier">{{ map.difficultyRating }}</span>
      </div>
      <div class="detail-content">
        <section v-if="active" class="detail-live" aria-label="限时挑战">
          <UIcon name="i-lucide-flag" aria-hidden="true" />
          <span class="detail-live__text"><strong>{{ active.titleName }}</strong><small>限时挑战</small></span>
          <span class="detail-live__time num">{{ remainingLabel(active.endsAt, now ?? Date.now()) }}</span>
        </section>
        <div v-if="ratingBonus || map.mechanics?.length" class="detail-section mechanics">
          <UBadge v-if="ratingBonus" :label="`精通经验 ${ratingBonus}`" color="primary" variant="subtle" />
          <UBadge v-for="mechanic in map.mechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle" />
        </div>
        <section v-if="mapChallenges.length" class="detail-section" aria-labelledby="map-challenges-title">
          <h3 id="map-challenges-title" class="detail-heading">地图称号<span v-if="titles" class="num">{{ earnedCount }}/{{ mapChallenges.length }}</span></h3>
          <ul class="title-grid">
            <li v-for="challenge in mapChallenges" :key="challenge.challengeId" :class="{ 'is-owned': isOwned(challenge), 'is-live': isLive(challenge) }">
              <UIcon :name="isOwned(challenge) ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="title-grid__mark" :aria-label="isOwned(challenge) ? '已获得' : undefined" :aria-hidden="isOwned(challenge) ? undefined : true" />
              <strong>{{ challenge.name }}</strong>
              <span class="title-grid__meta">{{ [challenge.difficulty, challengeStatusLabel(challenge.status)].filter(Boolean).join(" · ") }}</span>
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
.detail-live { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-5); padding: var(--space-3) var(--space-4); border: 1px solid color-mix(in oklch, var(--signal) 45%, var(--line)); border-radius: var(--radius-card); background: var(--signal-surface); }
.detail-live > :first-child { flex: none; color: var(--signal); }
.detail-live__text { display: grid; flex: 1; min-width: 0; }
.detail-live__text small { color: var(--muted); font-size: var(--type-caption-size); }
.detail-live__time { padding: .15rem .6rem; border-radius: var(--radius-control); color: var(--on-signal); background: var(--signal); font-size: .875rem; font-weight: 700; white-space: nowrap; }
.detail-heading { display: flex; align-items: baseline; justify-content: space-between; margin: 0; color: var(--muted); font-size: var(--type-label-size); font-weight: 600; letter-spacing: .1em; }
.detail-heading .num { color: var(--quiet); font-size: var(--type-label-sm-size); letter-spacing: 0; }
.detail-section:first-child { padding-top: var(--space-5); border-top: 0; }
.detail-hero { position: relative; display: grid; place-items: center; aspect-ratio: 21 / 8; overflow: hidden; color: var(--accent); background: repeating-linear-gradient(135deg, transparent 0 10px, color-mix(in oklch, var(--accent) 7%, transparent) 10px 11px), radial-gradient(80% 90% at 70% 0%, color-mix(in oklch, var(--accent) 16%, transparent), transparent 70%), var(--surface-raised); }
.detail-hero img { width: 100%; height: 100%; object-fit: cover; }
.detail-hero__index { font-family: var(--font-display); font-size: clamp(4rem, 18cqi, 8rem); font-weight: 700; opacity: .2; }
.detail-hero__tier { position: absolute; top: var(--space-4); right: var(--space-4); min-width: 3rem; padding: .2rem .6rem; border-radius: calc(var(--radius-control) / 1.5); color: oklch(15% 0.02 150); background: oklch(80% 0.02 150); font-size: 1rem; font-weight: 700; text-align: center; }
.detail-hero__tier[data-tier="5"] { background: var(--tier-5); }
.detail-hero__tier[data-tier="4"] { background: var(--tier-4); }
.detail-hero__tier[data-tier="3"] { background: var(--tier-3); }
.detail-hero__tier[data-tier="2"] { background: var(--tier-2); }
.detail-hero__tier[data-tier="1"] { background: var(--tier-1); }
.detail-hero__tier[data-tier="0"] { color: oklch(98% 0.01 30); background: var(--tier-0); }
.mechanics { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.title-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.title-grid li { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); }
.title-grid__mark { grid-row: span 2; color: var(--quiet); }
.title-grid strong { min-width: 0; overflow-wrap: anywhere; color: var(--text); font-size: .875rem; }
.title-grid__meta { color: var(--quiet); font-size: var(--type-caption-size); }
.title-grid__meta:empty { display: none; }
.title-grid li.is-owned { border-color: color-mix(in oklch, var(--accent) 40%, var(--line)); }
.title-grid li.is-owned .title-grid__mark { color: var(--accent); }
.title-grid li.is-live { border-color: color-mix(in oklch, var(--signal) 55%, var(--line)); }
.title-grid li.is-live .title-grid__mark { color: var(--signal); }
@container (max-width: 23.99rem) {
  .title-grid { grid-template-columns: minmax(0, 1fr); }
  .detail-content { padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right)); }
  .detail-section { gap: var(--space-3); padding: var(--space-4) 0; }
  .detail-section:first-child { padding-top: var(--space-4); }
    }
@media (prefers-reduced-motion: reduce) { .detail-card :deep(*) { scroll-behavior: auto; } }
</style>

<style>
@media (prefers-reduced-motion: reduce) {
  .map-detail-surface { transition-duration: 1ms !important; }
}
</style>
