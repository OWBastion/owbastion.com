<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import type { Map } from "~/types/challenge";
import { createRequestId } from "~/utils/request-id";
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

const { loading } = useAdminAsyncData("maps", async () => {
    const [mapResponse, challengeResponse] = await Promise.all([
      api<{ items: Map[] }>("/v1/maps"),
      api<{ items: MapChallenge[] }>("/v1/achievements?type=map"),
    ]);
    return { maps: mapResponse.items, challenges: challengeResponse.items };
  }, {
    onStart: () => { errorMessage.value = ""; },
    onData: (response) => { maps.value = response.maps; challenges.value = response.challenges; },
    onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取地图目录，请稍后重试。").description; },
  });

watch(query, (value) => { globalFilter.value = value; });

const toast = useToast();
const createOpen = shallowRef(false);
const creating = shallowRef(false);
const createForm = reactive({ mapName: "", mapId: "", gameVersion: "" });

function openCreate() {
  Object.assign(createForm, { mapName: "", mapId: "", gameVersion: "" });
  createOpen.value = true;
}

async function createMap() {
  if (!createForm.mapName.trim() || creating.value) return;
  creating.value = true;
  errorMessage.value = "";
  try {
    const created = await api<Map>("/v1/maps", {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: {
        contractVersion: "1",
        mapName: createForm.mapName.trim(),
        ...(createForm.mapId.trim() ? { mapId: createForm.mapId.trim() } : {}),
        ...(createForm.gameVersion.trim() ? { gameVersion: createForm.gameVersion.trim() } : {}),
      },
    });
    toast.add({ title: `「${created.mapName}」已添加`, description: "已创建默认版本，可继续配置地图评级与空间配置。", color: "success" });
    createOpen.value = false;
    await navigateTo(`/admin/maps/${encodeURIComponent(created.mapId)}`);
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法添加地图，请稍后重试。").description;
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <AdminWorkspace title="地图管理" :count="loading ? '读取中…' : `${maps.length} 张`">
    <template #actions><UButton class="pressable" label="新增地图" icon="i-lucide-plus" @click="openCreate" /></template>
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
        :mobile-row-link="(row) => `/admin/maps/${encodeURIComponent(row.mapId)}`"
        :loading="loading"
        empty="暂无地图记录"
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
            <UButton :to="`/admin/maps/${encodeURIComponent(row.original.mapId)}`" label="编辑" size="sm" color="neutral" variant="outline" />
          </div>
        </template>
      </AdminDataTable>
    </section>
    <AdminResponsiveDialog v-model:open="createOpen" title="新增地图" size="md" :dismissible="!creating">
      <template #body>
        <form id="map-create-form" class="grid gap-4" @submit.prevent="createMap">
          <UFormField label="地图名称" required hint="与截图中的地图名一致，如 皇家赛道。">
            <UInput v-model="createForm.mapName" :disabled="creating" required maxlength="128" />
          </UFormField>
          <details class="more-settings">
            <summary>更多设置</summary>
            <div class="grid gap-4 pt-3">
              <UFormField label="地图标识" hint="留空自动生成；也可填 map.xxx（小写字母、数字、下划线）。">
                <UInput v-model="createForm.mapId" placeholder="例如 map.new_york" :disabled="creating" />
              </UFormField>
              <UFormField label="游戏版本" hint="留空使用最新版本，格式 YY.MMDD.序号。">
                <UInput v-model="createForm.gameVersion" placeholder="例如 26.1003.1" :disabled="creating" />
              </UFormField>
            </div>
          </details>
        </form>
      </template>
      <template #footer>
        <UButton type="submit" form="map-create-form" label="添加" :loading="creating" :disabled="!createForm.mapName.trim()" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="creating" @click="createOpen = false" />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.more-settings { border-top: 1px solid var(--line); color: var(--muted); }
.more-settings summary { padding: var(--space-3) 0; cursor: pointer; }
.table-meta { color: var(--quiet); font-size: var(--type-caption-size); }
.maps-table :deep(table[data-slot="base"]) { width: 100%; table-layout: fixed; }
.maps-table :deep(th:nth-child(1)), .maps-table :deep(td:nth-child(1)) { width: 24%; }
.maps-table :deep(th:nth-child(2)), .maps-table :deep(td:nth-child(2)) { width: 13%; }
.maps-table :deep(th:nth-child(3)), .maps-table :deep(td:nth-child(3)) { width: 27%; }
.maps-table :deep(th:nth-child(4)), .maps-table :deep(td:nth-child(4)) { width: 11%; }
.maps-table :deep(th:nth-child(5)), .maps-table :deep(td:nth-child(5)) { width: 14%; }
</style>
