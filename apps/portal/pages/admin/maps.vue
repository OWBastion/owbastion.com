<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Map } from "~/composables/useSubmissionUpload";
import type { AdminAchievement } from "~/pages/admin/achievements.vue";
import { portalErrorDetails } from "~/utils/portal-error";

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
const toast = useToast();
const draftMechanics = ref<string[]>([]);
const draftCoverUrl = ref("");
const draftBackgroundUrl = ref("");
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const globalFilter = ref("");
const panelOpen = computed({ get: () => selectedMap.value !== null, set: (open) => { if (!open) selectedMap.value = null; } });
const challengeAction = shallowRef<{ challenge: MapChallenge; status: MapChallenge["status"] } | null>(null);
const retiredVersion = shallowRef("");

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
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取地图目录，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

function openMap(map: Map) {
  selectedMap.value = map;
  draftRating.value = map.difficultyRating;
  draftMechanics.value = [...map.mechanics];
  draftCoverUrl.value = map.coverUrl ?? "";
  draftBackgroundUrl.value = map.backgroundUrl ?? "";
}

async function saveMetadata() {
  if (!selectedMap.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const updated = await api<Map>(`/v1/maps/${encodeURIComponent(selectedMap.value.mapId)}/metadata`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", difficultyRating: draftRating.value, mechanics: draftMechanics.value, coverUrl: draftCoverUrl.value.trim() || null, backgroundUrl: draftBackgroundUrl.value.trim() || null },
    });
    maps.value = maps.value.map((map) => map.mapId === updated.mapId ? updated : map);
    selectedMap.value = updated;
    toast.add({ title: "地图属性已保存", color: "success" });
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存地图属性，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

function requestChallengeUpdate(challenge: MapChallenge, status: MapChallenge["status"]) {
  if (status === "active") return void updateChallenge(challenge, status);
  retiredVersion.value = challenge.retiredVersion ?? "";
  challengeAction.value = { challenge, status };
}
function closeChallengeAction(force = false) {
  if (saving.value && !force) return;
  challengeAction.value = null;
  retiredVersion.value = "";
}
async function updateChallenge(challenge: MapChallenge, status: MapChallenge["status"], plannedRetiredVersion?: string) {
  const nextRetiredVersion = plannedRetiredVersion?.trim();
  if (status === "sunsetting" && !nextRetiredVersion) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api(`/v1/achievements/${encodeURIComponent(challenge.challengeId)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", family: "map", status, ...(status === "sunsetting" ? { retiredVersion: nextRetiredVersion } : {}) },
    });
    toast.add({ title: status === "active" ? "挑战已重新开放" : status === "sunsetting" ? "挑战已计划下线" : "挑战已下线", color: "success" });
    await load();
    closeChallengeAction(true);
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存挑战状态，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}
async function confirmChallengeAction() {
  if (!challengeAction.value) return;
  await updateChallenge(challengeAction.value.challenge, challengeAction.value.status, retiredVersion.value);
}

watch([query, ratingFilter], () => { globalFilter.value = query.value; });
onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="地图管理" :count="loading ? '读取中…' : `${maps.length} 张`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section aria-label="地图目录">
      <AdminDataTable v-model:global-filter="globalFilter" :data="mapRows" :columns="columns" :loading="loading" empty="暂无地图记录。" table-key="maps" class="admin-table">
        <template #filters><UInput v-model="query" size="md" aria-label="搜索地图" placeholder="搜索地图名称或 ID" /><USelect v-model="ratingFilter" size="md" aria-label="筛选地图评级" :items="[{ label: '全部评级', value: 'all' }, ...ratings.map((rating) => ({ label: rating, value: rating }))]" /></template>
        <template #mapName-cell="{ row }"><strong>{{ row.original.mapName }}</strong></template>
        <template #difficultyRating-cell="{ row }"><StatusBadge v-if="row.original.difficultyRating" :label="row.original.difficultyRating" tone="success" /><span v-else class="table-meta">暂无记录</span></template>
        <template #mechanics-cell="{ row }"><span class="table-meta">{{ row.original.mechanics }}</span></template>
        <template #challengeCount-cell="{ row }"><span>{{ row.original.challengeCount }} 项</span></template>
        <template #gameVersion-cell="{ row }"><span class="table-meta">{{ row.original.gameVersion }}</span></template>
        <template #actions-cell="{ row }"><UButton label="查看" color="neutral" variant="link" @click="openMap(maps.find((map) => map.mapId === row.original.mapId)!)" /></template>
      </AdminDataTable>
    </section>

    <AdminResponsiveDialog v-model:open="panelOpen" :title="selectedMap ? `${selectedMap.mapName} · 地图属性` : ''" size="md">
      <template #body>
        <section v-if="selectedMap" class="map-detail">
          <div class="detail-heading"><div><p class="eyebrow">地图属性</p><h2>{{ selectedMap.mapName }}</h2><p class="table-meta">{{ selectedMap.mapId }} · {{ selectedMap.gameVersion }}</p></div></div>
          <form class="editor" @submit.prevent="saveMetadata">
            <div class="visual-editor"><div class="visual-preview" :style="{ backgroundImage: draftBackgroundUrl.trim() ? `url(${draftBackgroundUrl.trim()})` : undefined }"><img v-if="draftCoverUrl.trim()" :src="draftCoverUrl.trim()" alt="" /><span v-else>{{ selectedMap.mapName }}</span></div><div class="visual-fields"><UFormField label="地图封面地址" hint="显示在前台地图卡片的主视觉中。"><UInput v-model="draftCoverUrl" type="url" placeholder="https://…" :disabled="saving" /><template #hint><div class="field-hint">显示在前台地图卡片的主视觉中。<button v-if="draftCoverUrl" type="button" class="clear-field" @click="draftCoverUrl = ''">清除</button></div></template></UFormField><UFormField label="地图背景地址" hint="作为前台地图卡片的背景图。"><UInput v-model="draftBackgroundUrl" type="url" placeholder="https://…" :disabled="saving" /><template #hint><div class="field-hint">作为前台地图卡片的背景图。<button v-if="draftBackgroundUrl" type="button" class="clear-field" @click="draftBackgroundUrl = ''">清除</button></div></template></UFormField></div></div>
            <UFormField label="地图难度评级" hint="这是地图综合评级，不等同于挑战难度。"><USelect v-model="draftRating" :items="[{ label: '暂无评级', value: null }, ...ratings.map((rating) => ({ label: rating, value: rating }))]" :disabled="saving" /></UFormField>
            <UFormField label="特殊机制" hint="最多 16 个标签，每个标签不超过 64 个字符。"><UInputTags v-model="draftMechanics" placeholder="输入机制标签" :disabled="saving" :max="16" aria-label="特殊机制" /></UFormField>
            <div class="editor-actions"><UButton type="submit" label="保存属性" :loading="saving" /></div>
          </form>
          <section class="challenge-section" aria-labelledby="map-challenges-title"><div class="section-heading"><div><p class="eyebrow">挑战目录</p><h3 id="map-challenges-title">挑战难度</h3></div><span>{{ selectedChallenges.length }} 项</span></div><AdminDataTable :data="selectedChallenges" :columns="challengeColumns" :loading="loading" empty="暂无挑战记录。" :table-key="`map-challenges-${selectedMap.mapId}`" class="admin-table nested-table"><template #name-cell="{ row }"><strong>{{ row.original.name }}</strong></template><template #difficulty-cell="{ row }"><span>{{ row.original.difficulty ?? '地图通关' }}</span></template><template #status-cell="{ row }"><StatusBadge :label="statusText(row.original.status)" :tone="statusTone(row.original.status)" /></template><template #actions-cell="{ row }"><div class="table-actions"><UButton v-if="row.original.status !== 'retired'" label="计划下线" color="neutral" variant="link" :disabled="saving" @click="requestChallengeUpdate(row.original, 'sunsetting')" /><UButton v-if="row.original.status !== 'retired'" label="结束" color="error" variant="link" :disabled="saving" @click="requestChallengeUpdate(row.original, 'retired')" /><UButton v-else label="重新开放" color="neutral" variant="link" :disabled="saving" @click="requestChallengeUpdate(row.original, 'active')" /></div></template></AdminDataTable></section>
        </section>
      </template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog :open="challengeAction !== null" :title="challengeAction?.status === 'sunsetting' ? '计划下线' : '结束挑战'" :description="challengeAction?.challenge.name" size="sm" :dismissible="!saving" @update:open="(open) => { if (!open) closeChallengeAction(); }">
      <template #body><form v-if="challengeAction" id="map-challenge-action" class="challenge-action" @submit.prevent="confirmChallengeAction"><UFormField v-if="challengeAction.status === 'sunsetting'" label="计划下线版本" required><UInput v-model="retiredVersion" required placeholder="例如 26.0713.1" :disabled="saving" /></UFormField><p v-else>结束后不再接受新的截图提交。</p></form></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeChallengeAction" /><UButton :label="challengeAction?.status === 'sunsetting' ? '确认计划' : '结束挑战'" :color="challengeAction?.status === 'sunsetting' ? 'primary' : 'error'" type="submit" form="map-challenge-action" :loading="saving" /></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { display: block; color: var(--quiet); font-size: .76rem; }.map-detail { display: grid; gap: 26px; }.detail-heading h2 { margin: 0; font-size: 2rem; letter-spacing: -.05em; }.detail-heading p { margin: 7px 0 0; }.editor { display: grid; gap: 20px; padding: 18px 0; border-block: 1px solid var(--line); }.visual-editor { display: grid; gap: 16px; grid-template-columns: minmax(150px, .8fr) minmax(0, 1.2fr); }.visual-preview { position: relative; display: grid; min-height: 150px; place-items: center; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; color: var(--accent); background-position: center; background-size: cover; }.visual-preview::before { position: absolute; inset: 0; background: color-mix(in oklch, var(--surface) 58%, transparent); content: ""; }.visual-preview img { position: relative; z-index: 1; max-width: 82%; max-height: 120px; object-fit: contain; filter: drop-shadow(0 8px 14px color-mix(in oklch, var(--shadow) 42%, transparent)); }.visual-preview span { position: relative; z-index: 1; font-weight: 700; }.visual-fields { display: grid; align-content: start; gap: 14px; }.field-hint { display: flex; justify-content: space-between; gap: 8px; }.clear-field { padding: 0; border: 0; color: var(--accent); background: transparent; cursor: pointer; font: inherit; }.editor-actions { display: flex; justify-content: flex-end; }.challenge-section { display: grid; gap: 12px; }.challenge-action { display: grid; gap: 16px; }.challenge-action p { margin: 0; color: var(--muted); }.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }.section-heading h3 { margin: 3px 0 0; font-size: 1.25rem; letter-spacing: -.035em; }.section-heading > span { color: var(--quiet); font-size: .78rem; }.table-actions { display: flex; flex-wrap: wrap; gap: 2px; }.nested-table :deep(table[data-slot="base"]) { min-width: 540px; }
@media (max-width: 520px) { .editor-actions .portal-button { width: 100%; }.detail-heading h2 { font-size: 1.7rem; } }
@media (max-width: 520px) { .visual-editor { grid-template-columns: 1fr; }.visual-preview { min-height: 120px; } }
</style>
