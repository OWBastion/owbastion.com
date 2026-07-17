<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Map } from "~/composables/useSubmissionUpload";
import type { AdminAchievement } from "~/pages/admin/achievements.vue";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "地图管理 · 躲避堡垒 3" });

type MapChallenge = Extract<AdminAchievement, { family: "map" }>;
type Rating = Map["difficultyRating"];
type MapRow = Omit<Map, "mechanics"> & { mechanics: string; challengeCount: number };

const api = useAdminApi();
const maps = ref<Map[]>([]);
const challenges = ref<MapChallenge[]>([]);
const selectedMap = ref<Map | null>(null);
const query = ref("");
const ratingFilter = ref<"all" | Exclude<Rating, null>>("all");
const draftRating = ref<Rating>(null);
const draftMechanics = ref<string[]>([]);
const newMechanic = ref("");
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const actionMessage = ref("");
const globalFilter = ref("");
const panelOpen = computed({ get: () => selectedMap.value !== null, set: (open) => { if (!open) selectedMap.value = null; } });

const ratings = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;
const columns: TableColumn<MapRow>[] = [
  { accessorKey: "mapName", header: "地图" },
  { accessorKey: "difficultyRating", header: "地图评级" },
  { accessorKey: "mechanics", header: "特殊机制" },
  { accessorKey: "challengeCount", header: "挑战" },
  { accessorKey: "gameVersion", header: "游戏版本" },
  { id: "actions", header: "操作", enableHiding: false },
];
const challengeColumns: TableColumn<MapChallenge>[] = [
  { accessorKey: "name", header: "挑战" },
  { accessorKey: "difficulty", header: "挑战难度" },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作", enableHiding: false },
];
const mapRows = computed<MapRow[]>(() => maps.value
  .filter((map) => ratingFilter.value === "all" || map.difficultyRating === ratingFilter.value)
  .map((map) => ({ ...map, mechanics: map.mechanics.join("、") || "暂无记录", challengeCount: challenges.value.filter((challenge) => challenge.mapId === map.mapId).length })));
const selectedChallenges = computed(() => selectedMap.value ? challenges.value.filter((challenge) => challenge.mapId === selectedMap.value?.mapId) : []);
const statusText = (status: MapChallenge["status"]) => status === "active" ? "已开放" : status === "sunsetting" ? "即将结束" : "已下线";
const statusTone = (status: MapChallenge["status"]) => status === "active" ? "success" : "warning";

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
    if (selectedMap.value) selectedMap.value = maps.value.find((map) => map.mapId === selectedMap.value?.mapId) ?? null;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取地图目录，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

function openMap(map: Map) {
  selectedMap.value = map;
  draftRating.value = map.difficultyRating;
  draftMechanics.value = [...map.mechanics];
  newMechanic.value = "";
}

function addMechanic() {
  const value = newMechanic.value.trim();
  if (!value || draftMechanics.value.includes(value) || draftMechanics.value.length >= 16) return;
  draftMechanics.value.push(value);
  newMechanic.value = "";
}

function removeMechanic(value: string) {
  draftMechanics.value = draftMechanics.value.filter((mechanic) => mechanic !== value);
}

async function saveMetadata() {
  if (!selectedMap.value) return;
  saving.value = true;
  errorMessage.value = "";
  actionMessage.value = "保存中…";
  try {
    const updated = await api<Map>(`/v1/maps/${encodeURIComponent(selectedMap.value.mapId)}/metadata`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", difficultyRating: draftRating.value, mechanics: draftMechanics.value },
    });
    maps.value = maps.value.map((map) => map.mapId === updated.mapId ? updated : map);
    selectedMap.value = updated;
    actionMessage.value = "地图属性已保存";
  } catch (error: any) {
    actionMessage.value = "";
    errorMessage.value = error?.data?.error?.message ?? "无法保存地图属性，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

async function updateChallenge(challenge: MapChallenge, status: MapChallenge["status"]) {
  const retiredVersion = status === "sunsetting" ? window.prompt("请输入计划下线版本")?.trim() : undefined;
  if (status === "sunsetting" && !retiredVersion) return;
  if (status === "retired" && !window.confirm(`确认结束“${challenge.name}”？`)) return;
  saving.value = true;
  errorMessage.value = "";
  actionMessage.value = "保存中…";
  try {
    await api(`/v1/achievements/${encodeURIComponent(challenge.challengeId)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", family: "map", status, ...(status === "sunsetting" ? { retiredVersion } : {}) },
    });
    actionMessage.value = status === "active" ? "挑战已重新开放" : status === "sunsetting" ? "挑战已计划下线" : "挑战已下线";
    await load();
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法保存挑战状态，请稍后重试。";
    actionMessage.value = "";
  } finally {
    saving.value = false;
  }
}

watch([query, ratingFilter], () => { globalFilter.value = query.value; });
onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="地图管理" :count="loading ? '读取中…' : `${maps.length} 张`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /><UAlert v-if="actionMessage" color="primary" variant="subtle" :description="actionMessage" /></template>
    <section aria-label="地图目录">
      <AdminDataTable v-model:global-filter="globalFilter" :data="mapRows" :columns="columns" :loading="loading" empty="暂无地图记录。" table-key="maps" scroll-height="36rem" class="admin-table">
        <template #filters><UInput v-model="query" size="md" aria-label="搜索地图" placeholder="搜索地图名称或 ID" /><USelect v-model="ratingFilter" size="md" aria-label="筛选地图评级" :items="[{ label: '全部评级', value: 'all' }, ...ratings.map((rating) => ({ label: rating, value: rating }))]" /></template>
        <template #mapName-cell="{ row }"><strong>{{ row.original.mapName }}</strong><small class="table-meta">{{ row.original.mapId }}</small></template>
        <template #difficultyRating-cell="{ row }"><StatusBadge v-if="row.original.difficultyRating" :label="row.original.difficultyRating" tone="success" /><span v-else class="table-meta">暂无记录</span></template>
        <template #mechanics-cell="{ row }"><span class="table-meta">{{ row.original.mechanics }}</span></template>
        <template #challengeCount-cell="{ row }"><span>{{ row.original.challengeCount }} 项</span></template>
        <template #gameVersion-cell="{ row }"><span class="table-meta">{{ row.original.gameVersion }}</span></template>
        <template #actions-cell="{ row }"><UButton label="查看" color="neutral" variant="link" @click="openMap(maps.find((map) => map.mapId === row.original.mapId)!)" /></template>
      </AdminDataTable>
    </section>

    <USlideover v-model:open="panelOpen" :title="selectedMap ? `${selectedMap.mapName} · 地图属性` : ''" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <section v-if="selectedMap" class="map-detail">
          <div class="detail-heading"><div><p class="eyebrow">地图属性</p><h2>{{ selectedMap.mapName }}</h2><p class="table-meta">{{ selectedMap.mapId }} · {{ selectedMap.gameVersion }}</p></div></div>
          <form class="editor" @submit.prevent="saveMetadata">
            <UFormField label="地图难度评级" hint="这是地图综合评级，不等同于挑战难度。"><USelect v-model="draftRating" :items="[{ label: '暂无评级', value: null }, ...ratings.map((rating) => ({ label: rating, value: rating }))]" :disabled="saving" /></UFormField>
            <UFormField label="特殊机制" hint="最多 16 个标签，每个标签不超过 64 个字符。"><div class="tag-editor"><div class="tags"><UBadge v-for="mechanic in draftMechanics" :key="mechanic" :label="mechanic" color="neutral" variant="subtle"><template #trailing><button type="button" class="tag-remove" :aria-label="`删除${mechanic}`" @click="removeMechanic(mechanic)">×</button></template></UBadge></div><div class="tag-input"><UInput v-model="newMechanic" aria-label="新增特殊机制" placeholder="输入机制标签" maxlength="64" @keyup.enter="addMechanic" /><UButton type="button" label="添加" color="neutral" variant="outline" :disabled="!newMechanic.trim() || draftMechanics.length >= 16" @click="addMechanic" /></div></div></UFormField>
            <div class="editor-actions"><UButton type="submit" label="保存属性" :loading="saving" /></div>
          </form>
          <section class="challenge-section" aria-labelledby="map-challenges-title"><div class="section-heading"><div><p class="eyebrow">挑战目录</p><h3 id="map-challenges-title">挑战难度</h3></div><span>{{ selectedChallenges.length }} 项</span></div><AdminDataTable :data="selectedChallenges" :columns="challengeColumns" :loading="loading" empty="暂无挑战记录。" :table-key="`map-challenges-${selectedMap.mapId}`" class="admin-table nested-table"><template #name-cell="{ row }"><strong>{{ row.original.name }}</strong></template><template #difficulty-cell="{ row }"><span>{{ row.original.difficulty ?? '地图通关' }}</span></template><template #status-cell="{ row }"><StatusBadge :label="statusText(row.original.status)" :tone="statusTone(row.original.status)" /></template><template #actions-cell="{ row }"><div class="table-actions"><UButton v-if="row.original.status !== 'retired'" label="计划下线" color="neutral" variant="link" :disabled="saving" @click="updateChallenge(row.original, 'sunsetting')" /><UButton v-if="row.original.status !== 'retired'" label="结束" color="error" variant="link" :disabled="saving" @click="updateChallenge(row.original, 'retired')" /><UButton v-else label="重新开放" color="neutral" variant="link" :disabled="saving" @click="updateChallenge(row.original, 'active')" /></div></template></AdminDataTable></section>
        </section>
      </template>
    </USlideover>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { display: block; color: var(--quiet); font-size: .76rem; }.map-detail { display: grid; gap: 26px; }.detail-heading h2 { margin: 0; font-size: 2rem; letter-spacing: -.05em; }.detail-heading p { margin: 7px 0 0; }.editor { display: grid; gap: 20px; padding: 18px 0; border-block: 1px solid var(--line); }.tag-editor { display: grid; gap: 10px; }.tags { display: flex; flex-wrap: wrap; gap: 6px; }.tag-remove { margin-left: 4px; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; }.tag-input { display: flex; gap: 8px; }.tag-input > :first-child { flex: 1; }.editor-actions { display: flex; justify-content: flex-end; }.challenge-section { display: grid; gap: 12px; }.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }.section-heading h3 { margin: 3px 0 0; font-size: 1.25rem; letter-spacing: -.035em; }.section-heading > span { color: var(--quiet); font-size: .78rem; }.table-actions { display: flex; flex-wrap: wrap; gap: 2px; }.nested-table :deep(table[data-slot="base"]) { min-width: 540px; }
@media (prefers-reduced-motion: reduce) { .tag-remove { transition: none; } }
@media (max-width: 520px) { .tag-input { align-items: stretch; flex-direction: column; }.editor-actions .portal-button { width: 100%; }.detail-heading h2 { font-size: 1.7rem; } }
</style>
