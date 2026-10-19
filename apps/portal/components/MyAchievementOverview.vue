<script setup lang="ts">
import type { PublicAchievement } from "./AchievementCatalog.vue";
import type { OwnedTitle } from "~/types/title";
import type { PlayerChallengeProgress, PortalMap } from "~/composables/usePortalApi";
import { findOwnedTitle } from "~/utils/achievement-status";
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
const isAchievementCardEarned = (card: AchievementCard) => card.kind === "ended" || ownedTitleKeys.value.has(card.challenge.titleKey);
const ownedGlobalTitleForCard = (card: AchievementCard) => card.kind === "ended"
  ? card.title
  : findOwnedTitle(props.titles, { titleKey: card.challenge.titleKey });
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

type Tile = {
  key: string;
  name: string;
  icon: { url: string | null | undefined; icon: string };
  condition: string;
  owned?: OwnedTitle;
  earned: boolean;
  note?: string;
  progress?: PlayerChallengeProgress;
};
const mapNameFor = (mapId: string) => props.maps.find((map) => map.mapId === mapId)?.mapName ?? mapId;
const progressByChallenge = computed(() => new Map(props.challengeProgress.map((item) => [item.challengeId, item])));
const cardTile = (card: AchievementCard): Tile => card.kind === "catalog"
  ? {
      key: card.challenge.challengeId,
      name: card.challenge.titleName,
      icon: { url: card.challenge.iconUrl, icon: card.challenge.icon },
      condition: card.challenge.condition,
      owned: ownedGlobalTitleForCard(card),
      earned: isAchievementCardEarned(card),
      note: card.challenge.status === "scheduled" ? "未开放" : card.challenge.status === "sunsetting" ? "即将结束" : undefined,
      progress: card.challenge.progressRule ? progressByChallenge.value.get(card.challenge.challengeId) : undefined,
    }
  : { key: card.title.grantId, name: card.title.label, icon: { url: card.title.iconUrl, icon: card.title.icon }, condition: card.title.condition, owned: card.title, earned: true, note: "不再发放" };
const titleTile = (title: OwnedTitle): Tile => ({
  key: title.grantId,
  name: title.label,
  icon: { url: title.iconUrl, icon: title.icon },
  condition: title.condition,
  owned: title,
  earned: true,
  note: title.mapId && title.gameplayRevisionId && !props.maps.some((map) => map.mapId === title.mapId && map.defaultGameplayRevisionId === title.gameplayRevisionId) ? "历史版本" : undefined,
});
const tileGroups = computed(() => [
  ...groups.value.map((group) => ({ name: group.category, tiles: group.cards.map(cardTile) })),
  ...mapTitleGroups.value.map((group) => ({ name: group.name, tiles: group.titles.map(titleTile) })),
]);

const selectedKey = shallowRef<string | null>(null);
// Looked up live so the sheet reflects an equip change as soon as the titles prop updates.
const selected = computed(() => tileGroups.value.flatMap((group) => group.tiles).find((tile) => tile.key === selectedKey.value) ?? null);
const sheetOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selectedKey.value = null; } });

const mapProgressRows = computed(() => buildMapProgressRows({ maps: props.maps, challenges: props.mapChallenges, titles: props.titles }).filter((row) => row.challenges.length));
</script>

<template>
  <div class="collection">
    <p class="equip-count num" :class="{ 'is-warn': recoveryRequired }">{{ recoveryRequired ? "选择要佩戴的称号" : "已佩戴" }} {{ equippedCount }}/10</p>

    <section v-for="(group, index) in tileGroups" :key="group.name" class="series" :aria-labelledby="`my-series-${index}`">
      <h2 :id="`my-series-${index}`" class="series__title">{{ group.name }}<span class="num">{{ group.tiles.filter((tile) => tile.earned).length }}/{{ group.tiles.length }}</span></h2>
      <ul class="tiles">
        <li v-for="tile in group.tiles" :key="tile.key">
          <AchievementTile :name="tile.name" :icon-url="tile.icon.url" :icon="tile.icon.icon" :earned="tile.earned" :checked="tile.owned?.equipped" :highlighted="tile.owned?.equipped" check-label="已佩戴" @click="selectedKey = tile.key" />
        </li>
      </ul>
    </section>

    <section v-if="mapProgressRows.length" class="series" aria-labelledby="map-achievements-title">
      <h2 id="map-achievements-title" class="series__title">地图<span class="num">{{ mapProgressRows.reduce((sum, row) => sum + row.earnedChallenges.length, 0) }}/{{ mapProgressRows.reduce((sum, row) => sum + row.challenges.length, 0) }}</span></h2>
      <ul class="maps">
        <li v-for="row in mapProgressRows" :key="row.map.mapId">
          <NuxtLink :to="`/me/achievements/maps/${encodeURIComponent(row.map.mapId)}`" class="map" :class="{ 'is-complete': row.earnedChallenges.length === row.challenges.length }">
            <strong>{{ row.map.mapName }}</strong>
            <span class="num">{{ row.earnedChallenges.length }}/{{ row.challenges.length }}</span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <UEmpty v-if="!tileGroups.length && !mapProgressRows.length" title="暂无记录" variant="naked" />

    <UModal v-model:open="sheetOpen" :title="selected?.name ?? ''" :description="selected?.note">
      <template #body>
        <div v-if="selected" class="sheet">
          <AchievementIcon class="sheet__icon" :url="selected.icon.url" :icon="selected.icon.icon" :earned="selected.earned" />
          <p class="sheet__condition">{{ selected.condition }}</p>
          <p v-if="selected.progress" class="sheet__progress">
            <span v-for="progressMap in selected.progress.maps" :key="progressMap.mapId" :class="{ done: progressMap.completed }">{{ mapNameFor(progressMap.mapId) }}</span>
          </p>
          <UButton
            v-if="selected.owned?.scope === 'global'"
            size="xl"
            block
            :color="selected.owned.equipped ? 'neutral' : 'primary'"
            :variant="selected.owned.equipped ? 'soft' : 'solid'"
            :loading="savingEquip"
            :disabled="savingEquip || !canEquip(selected.owned)"
            :label="selected.owned.equipped ? '取消佩戴' : canEquip(selected.owned) ? '佩戴' : '已满 10 个'"
            @click="emit('toggleEquipped', selected.owned.grantId)"
          />
          <p v-else-if="!selected.earned" class="sheet__locked"><UIcon name="i-lucide-lock" aria-hidden="true" />未获得</p>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.collection { display: grid; gap: var(--space-12); }
.equip-count { justify-self: start; margin: calc(-1 * var(--space-8)) 0 0; padding: var(--space-1) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--muted); font-size: var(--type-label-sm-size); }
.equip-count.is-warn { border-color: var(--warning); color: var(--warning); }
.series { display: grid; gap: var(--space-4); }
.series__title { display: flex; align-items: baseline; gap: var(--space-3); margin: 0; font-size: 1.0625rem; font-weight: 600; }
.series__title .num { color: var(--quiet); font-size: var(--type-label-sm-size); font-weight: 500; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.map { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); color: inherit; text-decoration: none; }
.map:hover, .map:focus-visible { border-color: color-mix(in oklch, var(--accent) 50%, var(--line)); }
.map strong { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.map .num { color: var(--quiet); font-size: var(--type-label-sm-size); }
.map.is-complete .num { color: var(--accent); font-weight: 700; }
.sheet { display: grid; justify-items: center; gap: var(--space-4); text-align: center; }
.sheet__icon { --achievement-icon-size: 7rem; }
.sheet__condition { margin: 0; color: var(--muted); }
.sheet__progress { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-1); margin: 0; }
.sheet__progress span { padding: 0 var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--quiet); font-size: var(--type-caption-size); }
.sheet__progress span.done { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--accent); }
.sheet__locked { display: inline-flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--quiet); font-size: var(--type-label-sm-size); }
</style>
