<script setup lang="ts">
import type { Map, MapChallenge } from "~/types/challenge";
import type { OwnedTitle } from "~/types/title";
import MapCard from "./MapCard.vue";
import MapDetailModal from "./MapDetailModal.vue";
import { useReviewSummaries } from "~/composables/useReviewSummaries";
import { verifiedRunMapRatings } from "@owbastion/domain";
import { isMapRating, mapRatingBonusLabel } from "~/utils/map-rating";

const props = defineProps<{
  maps: Map[];
  challenges: MapChallenge[];
  authenticated: boolean;
  titles?: OwnedTitle[];
  selectedMapId?: string;
}>();

const selectedMap = shallowRef<Map | null>(null);
const modalOpen = shallowRef(false);
const reviewSummaries = useReviewSummaries("map", () => props.maps.map((map) => map.mapId), () => props.maps.map((map) => map.defaultGameplayRevisionId ?? null));
const refreshReviewSummaries = () => reviewSummaries.refresh();
// Filters: free-text over names and mechanics, plus one rating at a time.
const query = shallowRef("");
const ratingFilter = shallowRef("all");
const UNRATED = "unrated";
const ratingKey = (map: Map) => isMapRating(map.difficultyRating) ? map.difficultyRating : UNRATED;
// Rating groups run from the largest mastery-XP bonus down; unrated maps come last.
const groupOrder: string[] = [...verifiedRunMapRatings, UNRATED];
const ratingOptions = computed(() => {
  const present = new Set<string>(props.maps.map(ratingKey));
  return [{ value: "all", label: "全部" }, ...groupOrder.filter((key) => present.has(key)).map((key) => ({ value: key, label: key === UNRATED ? "未评级" : key }))];
});
const groups = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const visible = props.maps.filter((map) =>
    (ratingFilter.value === "all" || ratingKey(map) === ratingFilter.value)
    && (!needle || [map.mapName, ...map.mechanics].some((text) => text.toLowerCase().includes(needle))));
  return groupOrder
    .map((key) => ({ key, label: key === UNRATED ? "未评级" : key, bonus: mapRatingBonusLabel(key), maps: visible.filter((map) => ratingKey(map) === key) }))
    .filter((group) => group.maps.length);
});

const route = useRoute();
const router = useRouter();
const syncingQuery = shallowRef(false);

const writeMapQuery = async (mapId: string | undefined) => {
  const current = typeof route.query.mapId === "string" ? route.query.mapId : undefined;
  if (current === mapId) return;
  syncingQuery.value = true;
  const query = { ...route.query };
  if (mapId) query.mapId = mapId;
  else delete query.mapId;
  await router.replace({ path: route.path, query }).catch(() => {});
  syncingQuery.value = false;
};

const showMap = (map: Map) => {
  selectedMap.value = map;
  modalOpen.value = true;
};

const openMap = (map: Map) => {
  showMap(map);
  void writeMapQuery(map.mapId);
};

const openSelectedMap = () => {
  if (syncingQuery.value) return;
  if (!props.selectedMapId) {
    modalOpen.value = false;
    return;
  }
  const map = props.maps.find((candidate) => candidate.mapId === props.selectedMapId);
  if (!map) {
    void writeMapQuery(undefined);
    return;
  }
  if (selectedMap.value?.mapId !== map.mapId || !modalOpen.value) showMap(map);
};

watch([() => props.selectedMapId, () => props.maps], openSelectedMap, { immediate: true });
watch(modalOpen, (open) => {
  if (open) return;
  void writeMapQuery(undefined);
});

</script>

<template>
  <section class="map-directory" aria-label="地图列表">
    <div v-if="props.maps.length" class="map-toolbar">
      <UInput v-model="query" class="map-toolbar__search" size="lg" icon="i-lucide-search" placeholder="搜索" aria-label="搜索地图" />
      <div class="seg" role="group" aria-label="按评级筛选">
        <button v-for="option in ratingOptions" :key="option.value" type="button" :aria-pressed="ratingFilter === option.value" @click="ratingFilter = option.value">{{ option.label }}</button>
      </div>
    </div>
    <div v-if="groups.length" class="map-groups">
      <section v-for="group in groups" :key="group.key" class="map-group" :aria-labelledby="`map-group-${group.key}`">
        <div class="group-heading">
          <h2 :id="`map-group-${group.key}`">{{ group.label }}<span v-if="group.bonus" class="group-heading__bonus num">精通经验 {{ group.bonus }}</span></h2>
          <span class="type-label-sm num">{{ group.maps.length }} 张</span>
        </div>
        <div class="map-grid"><MapCard v-for="map in group.maps" :key="map.mapId" :map="map" :review-summary="reviewSummaries.summaryFor(map.mapId, map.defaultGameplayRevisionId)" @select="openMap(map)" /></div>
      </section>
    </div>
    <UEmpty v-else :title="props.maps.length ? '没有找到' : '暂无地图'" variant="naked" />
    <MapDetailModal v-model:open="modalOpen" :map="selectedMap" :challenges="props.challenges" :authenticated="props.authenticated" :titles="props.titles" @review-changed="refreshReviewSummaries" />
  </section>
</template>

<style scoped>
.map-directory { display: grid; gap: var(--space-6); }
.map-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.map-toolbar__search { width: min(100%, 24rem); }
.map-groups { display: grid; gap: var(--space-8); }
.map-group { display: grid; gap: var(--space-3); }
.group-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--line); }
.group-heading h2 { display: flex; align-items: baseline; gap: var(--space-3); margin: 0; font-size: var(--type-caption-size); font-weight: 600; letter-spacing: 0.01em; }
.group-heading__bonus { color: var(--text); font-weight: 600; }
.group-heading > span { color: var(--quiet); }
/* 17rem minimum track, capped at four columns. */
.map-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, max(17rem, calc((100% - 3 * var(--space-4)) / 4))), 1fr)); gap: var(--space-4); }
</style>
