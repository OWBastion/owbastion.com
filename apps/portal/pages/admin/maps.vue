<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import type { Map } from "~/composables/useSubmissionUpload";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "地图管理 · 躲避堡垒 3" });

type MapChallenge = { mapId: string };
type Rating = Map["difficultyRating"];
type MapRow = Omit<Map, "mechanics"> & { mechanics: string; challengeCount: number };

const api = useAdminApi();
const maps = shallowRef<Map[]>([]);
const challenges = shallowRef<MapChallenge[]>([]);
const query = shallowRef("");
const globalFilter = shallowRef("");
const ratingFilter = shallowRef<"all" | Exclude<Rating, null>>("all");
const loading = shallowRef(true);
const errorMessage = shallowRef("");

const ratings = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;
const defaultSorting: SortingState = [{ id: "mapName", desc: false }];
const sorting = shallowRef<SortingState>([...defaultSorting]);
const sortingOptions = [
  { id: "mapName", label: "地图" },
  { id: "difficultyRating", label: "地图评级" },
  { id: "challengeCount", label: "挑战" },
  { id: "gameVersion", label: "游戏版本" },
];
const columns: TableColumn<MapRow>[] = [
  { accessorKey: "mapName", header: "地图" },
  { accessorKey: "difficultyRating", header: "地图评级" },
  { accessorKey: "mechanics", header: "特殊机制" },
  { accessorKey: "challengeCount", header: "挑战" },
  { accessorKey: "gameVersion", header: "游戏版本" },
  { id: "actions", header: "操作", enableHiding: false },
];
const mapRows = computed<MapRow[]>(() => maps.value
  .filter((map) => ratingFilter.value === "all" || map.difficultyRating === ratingFilter.value)
  .map((map) => ({
    ...map,
    mechanics: map.mechanics.join("、") || "暂无记录",
    challengeCount: challenges.value.filter((challenge) => challenge.mapId === map.mapId).length,
  })));

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [mapResponse, challengeResponse] = await Promise.all([
      api<{ items: Map[] }>("/v1/maps"),
      api<{ items: MapChallenge[] }>("/v1/achievements?type=map"),
    ]);
    maps.value = mapResponse.items;
    challenges.value = challengeResponse.items;
  } catch (cause) {
    errorMessage.value = portalErrorDetails(cause, "无法读取地图目录，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

watch(query, (value) => { globalFilter.value = value; });
onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="地图管理" :count="loading ? '读取中…' : `${maps.length} 张`">
    <template #messages>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    </template>

    <section aria-label="地图目录">
      <AdminDataTable
        v-model:global-filter="globalFilter"
        v-model:sorting="sorting"
        :sorting-options="sortingOptions"
        :default-sorting="defaultSorting"
        :data="mapRows"
        :columns="columns"
        :mobile-columns="[
          { id: 'mapName', priority: 'primary', order: 0 },
          { id: 'difficultyRating', priority: 'primary', order: 1 },
          { id: 'challengeCount', priority: 'primary', order: 2 },
          { id: 'mechanics', priority: 'detail', order: 3 },
          { id: 'gameVersion', priority: 'detail', order: 4 },
        ]"
        row-key="mapId"
        :loading="loading"
        empty="暂无地图记录。"
        table-key="maps"
        table-min-width="760px"
        class="admin-table maps-table"
      >
        <template #filters>
          <UInput v-model="query" size="md" aria-label="搜索地图" placeholder="搜索地图名称或 ID" />
          <USelect v-model="ratingFilter" size="md" aria-label="筛选地图评级" :items="[{ label: '全部评级', value: 'all' }, ...ratings.map((rating) => ({ label: rating, value: rating }))]" />
        </template>
        <template #mobile-primary>
          <UInput v-model="query" class="w-full" size="md" aria-label="搜索地图" placeholder="搜索地图名称或 ID" />
        </template>
        <template #mobile-secondary>
          <USelect v-model="ratingFilter" size="md" aria-label="筛选地图评级" :items="[{ label: '全部评级', value: 'all' }, ...ratings.map((rating) => ({ label: rating, value: rating }))]" />
        </template>
        <template #mapName-cell="{ row }"><strong>{{ row.original.mapName }}</strong></template>
        <template #difficultyRating-cell="{ row }">
          <StatusBadge v-if="row.original.difficultyRating" :label="row.original.difficultyRating" tone="default" />
          <span v-else class="table-meta">暂无记录</span>
        </template>
        <template #mechanics-cell="{ row }"><span class="table-meta">{{ row.original.mechanics }}</span></template>
        <template #challengeCount-cell="{ row }"><span>{{ row.original.challengeCount }} 项</span></template>
        <template #gameVersion-cell="{ row }"><span class="table-meta">{{ row.original.gameVersion }}</span></template>
        <template #actions-cell="{ row }">
          <div class="table-actions">
            <UButton :to="`/admin/maps/${encodeURIComponent(row.original.mapId)}`" label="打开编辑器" size="sm" color="neutral" variant="outline" />
          </div>
        </template>
      </AdminDataTable>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color: var(--quiet); font-size: var(--type-caption-size); }
.maps-table :deep(table[data-slot="base"]) { width: 100%; table-layout: fixed; }
.maps-table :deep(th:nth-child(1)), .maps-table :deep(td:nth-child(1)) { width: 24%; }
.maps-table :deep(th:nth-child(2)), .maps-table :deep(td:nth-child(2)) { width: 13%; }
.maps-table :deep(th:nth-child(3)), .maps-table :deep(td:nth-child(3)) { width: 27%; }
.maps-table :deep(th:nth-child(4)), .maps-table :deep(td:nth-child(4)) { width: 11%; }
.maps-table :deep(th:nth-child(5)), .maps-table :deep(td:nth-child(5)) { width: 14%; }
</style>
