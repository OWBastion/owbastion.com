<script setup lang="ts">
import type { PublicAchievement } from "./AchievementCatalog.vue";
import type { OwnedTitle } from "~/types/title";
import type { PlayerChallengeProgress, PortalMap } from "~/composables/usePortalApi";
import { achievementState, findOwnedTitle } from "~/utils/achievement-status";
import { buildMapProgressRows, type MapProgressChallenge } from "~/utils/map-progress";

type HistoricalTitleGroup = {
  name: string;
  titles: OwnedTitle[];
};
type AchievementCard =
  | { kind: "catalog"; challenge: PublicAchievement }
  | { kind: "ended"; title: OwnedTitle };
type AchievementGroup = { category: string; cards: AchievementCard[] };

const props = withDefaults(defineProps<{
  challenges: PublicAchievement[];
  titles: OwnedTitle[];
  maps?: PortalMap[];
  mapChallenges?: MapProgressChallenge[];
  challengeProgress?: PlayerChallengeProgress[];
  savingEquip?: boolean;
  allTitles?: boolean;
}>(), { maps: () => [], mapChallenges: () => [], challengeProgress: () => [] });
const emit = defineEmits<{ toggleEquipped: [grantId: string] }>();
const globalTitles = computed(() => props.titles.filter((title) => title.scope === "global"));
const equippedCount = computed(() => globalTitles.value.filter((title) => title.equipped).length);
const recoveryRequired = computed(() => !props.allTitles && globalTitles.value.length > 10 && equippedCount.value === 0);
const canEquip = (title: OwnedTitle) => title.scope === "global" && (title.equipped || equippedCount.value < 10);

const ownedTitleKeys = computed(() => new Set(props.titles.map((title) => title.titleKey)));
const earnedCatalogCount = computed(() => props.challenges.filter((challenge) => ownedTitleKeys.value.has(challenge.titleKey)).length);
const catalogTitleKeys = computed(() => new Set(props.challenges.map((challenge) => challenge.titleKey)));
const endedGlobalTitles = computed(() => props.titles.filter((title) => title.scope === "global" && !catalogTitleKeys.value.has(title.titleKey)));
const currentMapTitleKeys = computed(() => new Set(props.mapChallenges
  .filter((challenge) => challenge.titleKey && props.maps.some((map) => map.mapId === challenge.mapId && map.defaultGameplayRevisionId === challenge.gameplayRevisionId))
  .map((challenge) => `${challenge.mapId}:${challenge.gameplayRevisionId}:${challenge.titleKey}`)));
const isCurrentMapTitle = (title: OwnedTitle) => title.scope === "map"
  && Boolean(title.mapId && title.gameplayRevisionId)
  && currentMapTitleKeys.value.has(`${title.mapId}:${title.gameplayRevisionId}:${title.titleKey}`);
const groupHistoricalTitles = (titles: OwnedTitle[], groupName: (title: OwnedTitle) => string): HistoricalTitleGroup[] => {
  const grouped = new Map<string, OwnedTitle[]>();
  for (const title of titles) grouped.set(groupName(title), [...(grouped.get(groupName(title)) ?? []), title]);

  const slotRank = { pioneer: 0, conqueror: 1, dominator: 2 } as const;
  return [...grouped.entries()]
    .map(([name, titles]) => ({
      name,
      titles: [...titles].sort((left, right) => (left.slot ? slotRank[left.slot] : 9) - (right.slot ? slotRank[right.slot] : 9) || left.label.localeCompare(right.label, "zh-CN")),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
};
const mapTitleGroups = computed(() => groupHistoricalTitles(
  props.titles.filter((title) => title.scope === "map" && !isCurrentMapTitle(title)),
  (title) => title.mapName ?? "地图称号",
));
const mapTitleCount = computed(() => mapTitleGroups.value.reduce((count, group) => count + group.titles.length, 0));
const isAchievementCardEarned = (card: AchievementCard) => card.kind === "ended" || ownedTitleKeys.value.has(card.challenge.titleKey);
const ownedGlobalTitleForCard = (card: AchievementCard) => card.kind === "ended"
  ? card.title
  : findOwnedTitle(props.titles, { titleKey: card.challenge.titleKey });
const stateForCard = (card: AchievementCard) => achievementState(ownedGlobalTitleForCard(card));
const groups = computed(() => {
  const grouped = new Map<string, AchievementCard[]>();
  for (const challenge of props.challenges) grouped.set(challenge.category, [...(grouped.get(challenge.category) ?? []), { kind: "catalog", challenge }]);
  for (const title of endedGlobalTitles.value) grouped.set(title.category, [...(grouped.get(title.category) ?? []), { kind: "ended", title }]);
  const cardName = (card: AchievementCard) => card.kind === "catalog" ? card.challenge.titleName : card.title.label;
  return [...grouped.entries()]
    .map(([category, cards]): AchievementGroup => ({
      category,
      cards: [...cards].sort((left, right) => cardName(left).localeCompare(cardName(right), "zh-CN")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
});

const cardIcon = (card: AchievementCard) => card.kind === "catalog" ? { url: card.challenge.iconUrl, icon: card.challenge.icon } : { url: card.title.iconUrl, icon: card.title.icon };
const cardKey = (card: AchievementCard) => card.kind === "catalog" ? card.challenge.challengeId : card.title.grantId;
const progressByChallenge = computed(() => new Map(props.challengeProgress.map((item) => [item.challengeId, item])));
const progressFor = (card: AchievementCard) => card.kind === "catalog" && card.challenge.progressRule ? progressByChallenge.value.get(card.challenge.challengeId) : undefined;
const mapNameFor = (mapId: string) => props.maps.find((map) => map.mapId === mapId)?.mapName ?? mapId;

const mapProgressRows = computed(() => buildMapProgressRows({ maps: props.maps, challenges: props.mapChallenges, titles: props.titles }));
const targetMapCount = computed(() => mapProgressRows.value.filter((row) => row.challenges.length).length);
const totalChallengeCount = computed(() => mapProgressRows.value.reduce((count, row) => count + row.challenges.length, 0));
const earnedChallengeCount = computed(() => mapProgressRows.value.reduce((count, row) => count + row.earnedChallenges.length, 0));
</script>

<template>
  <div class="collection">
    <nav class="series-index" aria-label="成就分区">
      <p class="series-index__label font-display">GENERAL</p>
      <a v-for="(group, index) in groups" :key="group.category" :href="`#my-series-${index}`" class="series-index__link">
        <span>{{ group.category }}</span><span class="num">{{ group.cards.filter(isAchievementCardEarned).length }}/{{ group.cards.length }}</span>
      </a>
      <p class="series-index__label font-display">MAPS</p>
      <a href="#map-achievements-title" class="series-index__link"><span>地图成就</span><span class="num">{{ earnedChallengeCount }}/{{ totalChallengeCount }}</span></a>
      <a v-if="mapTitleGroups.length" href="#map-titles-title" class="series-index__link"><span>其他地图称号</span><span class="num">{{ mapTitleCount }}</span></a>
    </nav>

    <div class="collection-main">
      <section class="collection-part" aria-labelledby="general-achievements-title">
        <header class="part-head">
          <h2 id="general-achievements-title" class="part-head__title">通用成就</h2>
          <div class="equip-meter" :title="'佩戴的称号会在游戏内可用。修改会在后续游戏版本同步后生效。'">
            <span class="equip-meter__pips" aria-hidden="true"><i v-for="pip in 10" :key="pip" :class="{ on: pip <= equippedCount }" /></span>
            <span class="num">已佩戴 {{ equippedCount }} / 10</span>
            <UButton icon="i-lucide-circle-help" color="neutral" variant="ghost" size="xs" aria-label="佩戴称号说明：佩戴的称号会在游戏内可用。修改会在后续游戏版本同步后生效。" />
          </div>
        </header>
        <UAlert v-if="recoveryRequired" color="warning" variant="subtle" title="需要选择佩戴称号" description="迁移后仍保留了你的全部称号，但尚未初始化佩戴选择。请从下方选择最多 10 个称号。" />

        <section v-for="(group, index) in groups" :id="`my-series-${index}`" :key="group.category" class="series" :aria-labelledby="`my-series-${index}-title`">
          <header class="series__head">
            <h3 :id="`my-series-${index}-title`" class="series__title">{{ group.category }}</h3>
            <span class="series__count num">已获得 {{ group.cards.filter(isAchievementCardEarned).length }} / {{ group.cards.length }}</span>
            <span class="series__progress" aria-hidden="true"><i :style="{ width: `${(group.cards.filter(isAchievementCardEarned).length / group.cards.length) * 100}%` }" /></span>
          </header>
          <ul class="badge-grid">
            <li
              v-for="card in group.cards"
              :key="cardKey(card)"
              class="badge"
              :class="{ 'is-owned': isAchievementCardEarned(card), 'is-locked': !isAchievementCardEarned(card), 'is-equipped': ownedGlobalTitleForCard(card)?.equipped, 'is-scheduled': card.kind === 'catalog' && card.challenge.status === 'scheduled' }"
            >
              <span class="badge__icon" aria-hidden="true">
                <img v-if="cardIcon(card).url" :src="cardIcon(card).url!" alt="" />
                <UIcon v-else :name="`i-lucide-${cardIcon(card).icon}`" />
              </span>
              <strong class="badge__title">{{ card.kind === 'catalog' ? card.challenge.titleName : card.title.label }}</strong>
              <span class="badge__condition">{{ card.kind === 'catalog' ? card.challenge.condition : card.title.condition }}</span>
              <span v-if="progressFor(card)" class="badge__progress">
                <span class="num">{{ progressFor(card)!.completedMaps }} / {{ progressFor(card)!.maps.length }}</span>
                <span class="badge__progress-maps">
                  <span v-for="progressMap in progressFor(card)!.maps" :key="progressMap.mapId" :class="{ done: progressMap.completed }">{{ mapNameFor(progressMap.mapId) }}</span>
                </span>
              </span>
              <span class="badge__foot">
                <AchievementStatus :state="stateForCard(card)" />
                <StatusBadge v-if="card.kind === 'ended'" label="不再发放" />
                <span v-if="card.kind === 'catalog' && card.challenge.status === 'scheduled'" class="badge__note">未开放</span>
                <span v-else-if="card.kind === 'catalog' && card.challenge.status === 'sunsetting'" class="badge__note">即将结束</span>
              </span>
              <UButton
                v-if="ownedGlobalTitleForCard(card)"
                class="badge__equip"
                size="sm"
                block
                :icon="ownedGlobalTitleForCard(card)!.equipped ? 'i-lucide-check' : undefined"
                :color="ownedGlobalTitleForCard(card)!.equipped ? 'primary' : 'neutral'"
                :variant="ownedGlobalTitleForCard(card)!.equipped ? 'soft' : 'outline'"
                :disabled="savingEquip || !canEquip(ownedGlobalTitleForCard(card)!)"
                :aria-label="ownedGlobalTitleForCard(card)!.equipped ? `取消佩戴 ${ownedGlobalTitleForCard(card)!.label}` : `佩戴 ${ownedGlobalTitleForCard(card)!.label}`"
                @click="emit('toggleEquipped', ownedGlobalTitleForCard(card)!.grantId)"
              >{{ ownedGlobalTitleForCard(card)!.equipped ? "佩戴中" : "佩戴" }}</UButton>
            </li>
          </ul>
        </section>
      </section>

      <section class="collection-part" aria-labelledby="map-achievements-title">
        <header class="part-head">
          <h2 id="map-achievements-title" class="part-head__title">地图成就</h2>
          <span v-if="targetMapCount" class="part-head__meta num" aria-live="polite">已获得 {{ earnedChallengeCount }} / {{ totalChallengeCount }}</span>
        </header>
        <ul v-if="mapProgressRows.length" class="map-rows">
          <li v-for="row in mapProgressRows" :key="row.map.mapId">
            <NuxtLink :to="`/me/achievements/maps/${encodeURIComponent(row.map.mapId)}`" class="map-row pressable-soft" :class="{ 'is-complete': row.challenges.length && row.earnedChallenges.length === row.challenges.length }">
              <span class="map-row__initial font-display" aria-hidden="true">{{ row.map.mapName.slice(0, 1) }}</span>
              <span class="map-row__body">
                <strong>{{ row.map.mapName }}</strong>
                <span v-if="row.challenges.length" class="map-row__pips" aria-hidden="true"><i v-for="challenge in row.challenges" :key="challenge.challengeId" :class="{ on: row.earnedChallenges.some((earned) => earned.challengeId === challenge.challengeId) }" /></span>
              </span>
              <span class="map-row__count num">{{ row.challenges.length ? `${row.earnedChallenges.length}/${row.challenges.length}` : "—" }}</span>
              <UIcon name="i-lucide-chevron-right" class="map-row__chevron" aria-hidden="true" />
            </NuxtLink>
          </li>
        </ul>
        <UEmpty v-else title="暂无地图" variant="naked" />
      </section>

      <section v-if="mapTitleGroups.length" class="collection-part" aria-labelledby="map-titles-title">
        <header class="part-head"><h2 id="map-titles-title" class="part-head__title">其他地图称号</h2><span class="part-head__meta num">{{ mapTitleCount }} 项</span></header>
        <section v-for="(group, index) in mapTitleGroups" :key="group.name" class="series" :aria-labelledby="`map-title-${index}`">
          <header class="series__head"><h3 :id="`map-title-${index}`" class="series__title">{{ group.name }}</h3><span class="series__count num">{{ group.titles.length }} 项</span></header>
          <ul class="badge-grid">
            <li v-for="title in group.titles" :key="title.grantId" class="badge is-owned">
              <span class="badge__icon" aria-hidden="true"><img v-if="title.iconUrl" :src="title.iconUrl" alt="" /><UIcon v-else :name="`i-lucide-${title.icon}`" /></span>
              <strong class="badge__title">{{ title.label }}</strong>
              <span class="badge__condition">{{ title.condition }}</span>
              <span class="badge__foot">
                <AchievementStatus :state="achievementState(title)" />
                <StatusBadge v-if="title.mapId && title.gameplayRevisionId && !props.maps.some((map) => map.mapId === title.mapId && map.defaultGameplayRevisionId === title.gameplayRevisionId)" label="历史版本" />
              </span>
            </li>
          </ul>
        </section>
      </section>

      <UEmpty v-if="!groups.length && !mapTitleGroups.length && !maps.length" title="暂无记录" variant="naked" />
    </div>
  </div>
</template>

<style scoped>
.collection { display: grid; gap: var(--space-8); }
.series-index { display: none; }
.collection-main { display: grid; gap: var(--space-12); min-width: 0; }
.collection-part { display: grid; gap: var(--space-8); }
.part-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-6); padding-bottom: var(--space-3); border-bottom: 1px solid var(--line); }
.part-head__title { margin: 0; font-family: var(--font-display); font-size: var(--type-headline-size); font-weight: 700; }
.part-head__meta { color: var(--quiet); font-size: var(--type-label-sm-size); }
.equip-meter { display: inline-flex; align-items: center; gap: var(--space-3); color: var(--muted); font-size: var(--type-label-sm-size); }
.equip-meter__pips { display: inline-flex; gap: 3px; }
.equip-meter__pips i { width: .5rem; height: .9rem; border-radius: calc(var(--radius-control) / 3); background: var(--line-strong); transform: skewX(-12deg); }
.equip-meter__pips i.on { background: var(--accent); box-shadow: 0 0 .5rem color-mix(in oklch, var(--accent) 50%, transparent); }
.series { display: grid; gap: var(--space-5); scroll-margin-top: var(--sticky-chrome-top); }
.series__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2) var(--space-4); }
.series__title { margin: 0; font-size: 1.0625rem; font-weight: 600; }
.series__count { color: var(--quiet); font-size: var(--type-label-sm-size); }
.series__progress { flex: 1 1 100%; height: 3px; overflow: hidden; background: var(--line); }
.series__progress i { display: block; height: 100%; background: var(--accent); }
.badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.badge { position: relative; display: grid; grid-template-rows: auto auto 1fr; justify-items: center; align-content: start; gap: var(--space-2); padding: var(--space-6) var(--space-4) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); text-align: center; }
.badge__icon { display: grid; width: 5rem; height: 5rem; margin-bottom: var(--space-2); place-items: center; color: var(--accent); font-size: 2rem; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: radial-gradient(circle at 50% 35%, color-mix(in oklch, var(--accent) 22%, transparent), transparent 70%), var(--surface-raised); }
.badge__icon img { width: 62%; height: 62%; object-fit: contain; }
.badge__title { color: var(--text); font-size: 1rem; font-weight: 600; overflow-wrap: anywhere; }
.badge__condition { color: var(--muted); font-size: var(--type-body-sm-size); line-height: 1.55; }
.badge__progress { display: grid; justify-items: center; gap: var(--space-1); }
.badge__progress > .num { color: var(--accent); font-size: var(--type-label-sm-size); font-weight: 700; }
.badge__progress-maps { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-1); }
.badge__progress-maps span { padding: 0 var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--quiet); font-size: var(--type-caption-size); }
.badge__progress-maps span.done { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--accent); }
.badge__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: var(--space-2); min-height: 1.5rem; }
.badge__note { color: var(--quiet); font-size: var(--type-caption-size); }
.badge__equip { margin-top: var(--space-2); }
.badge.is-owned { border-color: color-mix(in oklch, var(--accent) 40%, var(--line)); }
.badge.is-owned .badge__icon { background: radial-gradient(circle at 50% 35%, color-mix(in oklch, var(--accent) 45%, transparent), transparent 75%), var(--accent-surface); }
.badge.is-equipped { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent), 0 0 1.5rem color-mix(in oklch, var(--accent) 16%, transparent); }
.badge.is-locked .badge__icon { color: var(--quiet); filter: grayscale(1); opacity: .55; }
.badge.is-locked .badge__title { color: var(--muted); }
.badge.is-scheduled { border-style: dashed; }
.map-rows { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.map-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); color: inherit; text-decoration: none; }
.map-row:hover, .map-row:focus-visible { border-color: color-mix(in oklch, var(--accent) 50%, var(--line)); }
.map-row__initial { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border-radius: var(--radius-control); background: var(--surface-raised); color: var(--muted); font-size: 1.125rem; font-weight: 700; }
.map-row.is-complete .map-row__initial { background: var(--accent); color: var(--on-accent); }
.map-row__body { display: grid; gap: var(--space-2); min-width: 0; }
.map-row__body strong { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.map-row__pips { display: flex; flex-wrap: wrap; gap: 3px; }
.map-row__pips i { width: .9rem; height: .25rem; border-radius: var(--radius-pill); background: var(--line-strong); }
.map-row__pips i.on { background: var(--accent); }
.map-row__count { color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 600; }
.map-row__chevron { color: var(--quiet); }

@container (min-width: 56rem) {
  .collection { grid-template-columns: 12rem minmax(0, 1fr); align-items: start; }
  .series-index { position: sticky; top: var(--sticky-chrome-top); display: grid; gap: 2px; }
  .series-index__label { margin: 0 0 var(--space-2); color: var(--quiet); font-size: var(--type-caption-size); letter-spacing: .14em; }
  .series-index__label:not(:first-child) { margin-top: var(--space-5); }
  .series-index__link { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-left: 2px solid var(--line); color: var(--muted); font-size: var(--type-label-sm-size); text-decoration: none; }
  .series-index__link:hover, .series-index__link:focus-visible { border-left-color: var(--accent); color: var(--text); }
  .series-index__link .num { color: var(--quiet); }
}
@media (prefers-contrast: more) { .badge, .map-row { border-color: var(--text); } }
</style>
