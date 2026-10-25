<script setup lang="ts">
import type { PublicAchievement } from "./AchievementCatalog.vue";
import type { OwnedTitle } from "~/types/title";
import type { PlayerChallengeProgress, PortalMap } from "~/composables/usePortalApi";
import { findOwnedTitle } from "~/utils/achievement-status";
import { formatDate } from "~/utils/date-time";
import { buildMapProgressRows, type MapProgressChallenge } from "~/utils/map-progress";

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
  series: string;
  progress?: PlayerChallengeProgress;
};
const mapNameFor = (mapId: string) => props.maps.find((map) => map.mapId === mapId)?.mapName ?? mapId;
const progressByChallenge = computed(() => new Map(props.challengeProgress.map((item) => [item.challengeId, item])));
const cardTile = (card: AchievementCard): Omit<Tile, "series"> => card.kind === "catalog"
  ? {
      key: card.challenge.challengeId,
      name: card.challenge.titleName,
      icon: { url: card.challenge.iconUrl, icon: card.challenge.icon },
      condition: card.challenge.condition,
      owned: ownedGlobalTitleForCard(card),
      earned: isAchievementCardEarned(card),
      note: card.challenge.status === "scheduled" ? "未开放" : card.challenge.status === "sunsetting" ? "即将结束" : card.challenge.status === "ended" ? "已结束" : undefined,
      progress: card.challenge.progressRule ? progressByChallenge.value.get(card.challenge.challengeId) : undefined,
    }
  : { key: card.title.grantId, name: card.title.label, icon: { url: card.title.iconUrl, icon: card.title.icon }, condition: card.title.condition, owned: card.title, earned: true, note: "不再发放" };
const tileGroups = computed(() => groups.value.map((group) => ({ name: group.category, tiles: group.cards.map((card) => ({ ...cardTile(card), series: group.category })) })));

const selectedKey = shallowRef<string | null>(null);
// Looked up live so the sheet reflects an equip change as soon as the titles prop updates.
const selected = computed(() => tileGroups.value.flatMap((group) => group.tiles).find((tile) => tile.key === selectedKey.value) ?? null);
const sheetOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selectedKey.value = null; } });

const mapProgressRows = computed(() => buildMapProgressRows({ maps: props.maps, challenges: props.mapChallenges, titles: props.titles }).filter((row) => row.challenges.length));
</script>

<template>
  <div class="collection">
    <p class="equip-count num" :class="{ 'is-warn': recoveryRequired }">{{ recoveryRequired ? "选择要佩戴的称号" : "已佩戴" }} {{ equippedCount }}/10</p>

    <AchievementWall v-if="tileGroups.length">
      <AchievementShelf v-for="(group, groupIndex) in tileGroups" :key="group.name" :title="group.name" :heading-id="`my-series-${groupIndex}`" :count="`${group.tiles.filter((tile) => tile.earned).length}/${group.tiles.length}`">
        <li v-for="(tile, index) in group.tiles" :key="tile.key">
          <AchievementTile :name="tile.name" :icon-url="tile.icon.url" :icon="tile.icon.icon" :earned="tile.earned" :checked="tile.owned?.equipped" :highlighted="tile.owned?.equipped" check-label="已佩戴" :shine-delay="groupIndex * .8 + index * .22" @click="selectedKey = tile.key" />
        </li>
      </AchievementShelf>
    </AchievementWall>

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

    <UModal v-model:open="sheetOpen" :title="selected?.name ?? ''" :description="selected?.series">
      <template #body>
        <div v-if="selected" class="sheet">
          <AchievementIcon class="sheet__icon" entrance :url="selected.icon.url" :icon="selected.icon.icon" :earned="selected.earned" />
          <p v-if="selected.note" class="sheet__note">{{ selected.note }}</p>
          <p class="sheet__condition">{{ selected.condition }}</p>
          <p v-if="selected.owned" class="sheet__granted num">获得于 {{ formatDate(selected.owned.grantedAt) }}</p>
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
.equip-count { justify-self: end; margin: calc(-1 * var(--space-8)) 0 0; padding: var(--space-1) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--muted); font-size: var(--type-label-sm-size); }
.equip-count.is-warn { border-color: var(--warning); color: var(--warning); }
.series { display: grid; gap: var(--space-3); }
.series__title { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin: 0; color: var(--muted); font-size: var(--type-label-size); font-weight: 600; letter-spacing: .1em; }
.series__title .num { color: var(--quiet); font-size: var(--type-label-sm-size); font-weight: 500; letter-spacing: 0; }
.maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.map { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); color: inherit; text-decoration: none; }
.map:hover, .map:focus-visible { border-color: color-mix(in oklch, var(--accent) 50%, var(--line)); }
.map strong { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.map .num { color: var(--quiet); font-size: var(--type-label-sm-size); }
.map.is-complete .num { color: var(--accent); font-weight: 700; }
.sheet { display: grid; justify-items: center; gap: var(--space-4); text-align: center; }
.sheet__icon { --achievement-icon-size: 10rem; }
.sheet__note { margin: 0; padding: var(--space-1) var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 600; }
.sheet__condition { margin: 0; color: var(--muted); }
.sheet__granted { margin: 0; color: var(--quiet); font-size: var(--type-label-sm-size); }
.sheet__progress { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-1); margin: 0; }
.sheet__progress span { padding: 0 var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-pill); color: var(--quiet); font-size: var(--type-caption-size); }
.sheet__progress span.done { border-color: color-mix(in oklch, var(--accent) 45%, var(--line)); color: var(--accent); }
.sheet__locked { display: inline-flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--quiet); font-size: var(--type-label-sm-size); }
</style>
