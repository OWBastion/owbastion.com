<script setup lang="ts">
import type { TableColumn, FormError, FormSubmitEvent } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import type { Map } from "~/composables/useSubmissionUpload";
import type { MapAchievement } from "~/components/admin/admin-achievement-types";
import { achievementStatusLabel, achievementStatusTone } from "~/components/admin/admin-achievement-types";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import { mapVariantLabel } from "~/utils/map-variant";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "地图管理 · 躲避堡垒 3" });

type MapChallenge = MapAchievement;
type Rating = Map["difficultyRating"];
type MapRow = Omit<Map, "mechanics"> & { mechanics: string; challengeCount: number };
type MetadataForm = {
  coverUrl: string;
  backgroundUrl: string;
  difficultyRating: Rating;
  mechanics: string[];
};

const api = useAdminApi();
const maps = ref<Map[]>([]);
const challenges = ref<MapChallenge[]>([]);
const selectedMap = ref<Map | null>(null);
const query = ref("");
const ratingFilter = ref<"all" | Exclude<Rating, null>>("all");
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const directoryError = ref("");
const editorError = ref("");
const coverBroken = ref(false);
const backgroundBroken = ref(false);
const globalFilter = ref("");
const form = reactive<MetadataForm>({
  coverUrl: "",
  backgroundUrl: "",
  difficultyRating: null,
  mechanics: [],
});
const panelOpen = computed({
  get: () => selectedMap.value !== null,
  set: (open) => {
    if (!open) {
      selectedMap.value = null;
      editorError.value = "";
      coverBroken.value = false;
      backgroundBroken.value = false;
    }
  },
});

const ratings = ["T0", "T1", "T2", "T3", "T4", "T5"] as const;
const defaultMapSorting: SortingState = [{ id: "mapName", desc: false }];
const mapSorting = shallowRef<SortingState>([...defaultMapSorting]);
const mapSortingOptions = [
  { id: "mapName", label: "地图" },
  { id: "difficultyRating", label: "地图评级" },
  { id: "challengeCount", label: "挑战" },
  { id: "gameVersion", label: "游戏版本" },
];
const defaultChallengeSorting: SortingState = [{ id: "name", desc: false }];
const challengeSorting = shallowRef<SortingState>([...defaultChallengeSorting]);
const challengeSortingOptions = [
  { id: "name", label: "挑战" },
  { id: "difficulty", label: "挑战难度" },
  { id: "status", label: "状态" },
];
const columns: TableColumn<MapRow>[] = [
  { accessorKey: "mapName", header: "地图", meta: { class: { th: "map-col-name", td: "map-col-name" } } },
  { accessorKey: "difficultyRating", header: "地图评级", meta: { class: { th: "map-col-rating", td: "map-col-rating" } } },
  { accessorKey: "mechanics", header: "特殊机制", meta: { class: { th: "map-col-mechanics", td: "map-col-mechanics" } } },
  { accessorKey: "challengeCount", header: "挑战", meta: { class: { th: "map-col-count", td: "map-col-count" } } },
  { accessorKey: "gameVersion", header: "游戏版本", meta: { class: { th: "map-col-version", td: "map-col-version" } } },
  { id: "actions", header: "操作", enableHiding: false, meta: { class: { th: "map-col-actions", td: "map-col-actions" } } },
];
const challengeColumns: TableColumn<MapChallenge>[] = [
  { accessorKey: "name", header: "挑战", meta: { class: { th: "challenge-col-name", td: "challenge-col-name" } } },
  { accessorKey: "difficulty", header: "挑战难度", meta: { class: { th: "challenge-col-difficulty", td: "challenge-col-difficulty" } } },
  { accessorKey: "status", header: "状态", meta: { class: { th: "challenge-col-status", td: "challenge-col-status" } } },
  { id: "actions", header: "操作", enableHiding: false, meta: { class: { th: "challenge-col-actions", td: "challenge-col-actions" } } },
];
const challengeMobileColumns = [
  { id: "name", priority: "primary" as const, order: 0 },
  { id: "status", priority: "primary" as const, order: 1 },
  { id: "difficulty", priority: "detail" as const, order: 2 },
];
const mapRows = computed<MapRow[]>(() => maps.value
  .filter((map) => ratingFilter.value === "all" || map.difficultyRating === ratingFilter.value)
  .map((map) => ({
    ...map,
    mechanics: map.mechanics.join("、") || "暂无记录",
    challengeCount: challenges.value.filter((challenge) => challenge.mapId === map.mapId).length,
  })));
const selectedChallenges = computed(() => selectedMap.value ? challenges.value.filter((challenge) => challenge.mapId === selectedMap.value?.mapId) : []);

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const validateMetadata = (state: MetadataForm): FormError[] => {
  const errors: FormError[] = [];
  const cover = state.coverUrl.trim();
  const background = state.backgroundUrl.trim();
  if (cover && !isHttpUrl(cover)) errors.push({ name: "coverUrl", message: "封面地址需为 http(s) URL。" });
  if (background && !isHttpUrl(background)) errors.push({ name: "backgroundUrl", message: "背景地址需为 http(s) URL。" });
  if (state.mechanics.some((tag) => tag.length > 64)) errors.push({ name: "mechanics", message: "每个机制标签不超过 64 个字符。" });
  if (state.mechanics.length > 16) errors.push({ name: "mechanics", message: "特殊机制最多 16 个标签。" });
  return errors;
};

async function load() {
  loading.value = true;
  directoryError.value = "";
  try {
    const [mapResponse, challengeResponse] = await Promise.all([
      api<{ items: Map[] }>("/v1/maps"),
      api<{ items: MapChallenge[] }>("/v1/achievements?type=map"),
    ]);
    maps.value = mapResponse.items;
    challenges.value = challengeResponse.items;
    if (selectedMap.value) {
      selectedMap.value = maps.value.find((map) => map.mapId === selectedMap.value?.mapId) ?? null;
      if (selectedMap.value) syncForm(selectedMap.value);
    }
  } catch (error) {
    directoryError.value = portalErrorDetails(error, "无法读取地图目录，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

function syncForm(map: Map) {
  form.difficultyRating = map.difficultyRating;
  form.mechanics = [...map.mechanics];
  form.coverUrl = map.coverUrl ?? "";
  form.backgroundUrl = map.backgroundUrl ?? "";
  coverBroken.value = false;
  backgroundBroken.value = false;
  editorError.value = "";
}

function openMap(map: Map) {
  selectedMap.value = map;
  syncForm(map);
}

function clearCover() {
  form.coverUrl = "";
  coverBroken.value = false;
}

function clearBackground() {
  form.backgroundUrl = "";
  backgroundBroken.value = false;
}

function achievementLink(challenge: MapChallenge) {
  return {
    path: "/admin/achievements",
    query: {
      section: "map",
      mapId: challenge.mapId,
      challengeId: challenge.challengeId,
      ...(challenge.mapTitleRule?.dynamic ? { ruleId: challenge.mapTitleRule.ruleId } : {}),
    },
  };
}

function achievementActionLabel(challenge: MapChallenge) {
  return challenge.mapTitleRule?.dynamic ? "查看来源规则" : "在成就与称号中管理";
}

async function saveMetadata(_event: FormSubmitEvent<MetadataForm>) {
  if (!selectedMap.value || saving.value) return;
  saving.value = true;
  editorError.value = "";
  try {
    const updated = await api<Map>(`/v1/maps/${encodeURIComponent(selectedMap.value.mapId)}/metadata`, {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: {
        contractVersion: "1",
        difficultyRating: form.difficultyRating,
        mechanics: form.mechanics,
        coverUrl: form.coverUrl.trim() || null,
        backgroundUrl: form.backgroundUrl.trim() || null,
      },
    });
    maps.value = maps.value.map((map) => map.mapId === updated.mapId ? updated : map);
    selectedMap.value = updated;
    syncForm(updated);
    toast.add({ title: "地图属性已保存", color: "success" });
  } catch (error) {
    editorError.value = portalErrorDetails(error, "无法保存地图属性，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

watch([query, ratingFilter], () => { globalFilter.value = query.value; });
onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="地图管理" :count="loading ? '读取中…' : `${maps.length} 张`">
    <template #messages>
      <UAlert v-if="directoryError" color="error" variant="subtle" :description="directoryError" />
    </template>

    <section aria-label="地图目录">
      <AdminDataTable
        v-model:global-filter="globalFilter"
        v-model:sorting="mapSorting"
        :sorting-options="mapSortingOptions"
        :default-sorting="defaultMapSorting"
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
        table-min-width="820px"
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
            <UButton label="查看" size="sm" color="neutral" variant="outline" @click="openMap(maps.find((map) => map.mapId === row.original.mapId)!)" />
          </div>
        </template>
      </AdminDataTable>
    </section>

    <AdminResponsiveDialog v-model:open="panelOpen" :title="selectedMap ? `${selectedMap.mapName} · 地图属性` : ''" size="md" :dismissible="!saving">
      <template #body>
        <section v-if="selectedMap" class="map-detail">
          <div class="detail-heading">
            <p class="eyebrow">地图属性</p>
            <h2 class="type-headline">{{ selectedMap.mapName }}</h2>
            <p class="table-meta">{{ selectedMap.mapId }} · {{ selectedMap.gameVersion }}</p>
          </div>

          <UAlert v-if="editorError" color="error" variant="subtle" :description="editorError" class="editor-alert" />

          <UForm id="map-metadata-editor" :state="form" :validate="validateMetadata" :disabled="saving" class="editor" @submit="saveMetadata">
            <div class="visual-editor">
              <div
                class="visual-preview"
                :class="{ 'visual-preview--broken': backgroundBroken && form.backgroundUrl.trim() }"
                :style="{ backgroundImage: form.backgroundUrl.trim() && !backgroundBroken ? `url(${form.backgroundUrl.trim()})` : undefined }"
              >
                <img
                  v-if="form.coverUrl.trim() && !coverBroken"
                  :src="form.coverUrl.trim()"
                  :alt="`${selectedMap.mapName}封面预览`"
                  @error="coverBroken = true"
                />
                <span v-else-if="coverBroken && form.coverUrl.trim()" class="preview-fallback">封面无法读取</span>
                <span v-else>{{ selectedMap.mapName }}</span>
                <img
                  v-if="form.backgroundUrl.trim()"
                  class="background-probe"
                  :src="form.backgroundUrl.trim()"
                  alt=""
                  @error="backgroundBroken = true"
                  @load="backgroundBroken = false"
                />
              </div>
              <div class="visual-fields">
                <UFormField name="coverUrl" label="地图封面地址" hint="显示在前台地图卡片的主视觉中。">
                  <div class="field-with-action">
                    <UInput v-model="form.coverUrl" type="url" placeholder="https://…" :disabled="saving" @update:model-value="coverBroken = false" />
                    <UButton v-if="form.coverUrl" label="清除" size="sm" color="neutral" variant="outline" :disabled="saving" aria-label="清除封面地址" @click="clearCover" />
                  </div>
                </UFormField>
                <UFormField name="backgroundUrl" label="地图背景地址" hint="作为前台地图卡片的背景图。">
                  <div class="field-with-action">
                    <UInput v-model="form.backgroundUrl" type="url" placeholder="https://…" :disabled="saving" @update:model-value="backgroundBroken = false" />
                    <UButton v-if="form.backgroundUrl" label="清除" size="sm" color="neutral" variant="outline" :disabled="saving" aria-label="清除背景地址" @click="clearBackground" />
                  </div>
                  <p v-if="backgroundBroken && form.backgroundUrl.trim()" class="field-warning" role="status">背景图无法读取</p>
                </UFormField>
              </div>
            </div>

            <UFormField name="difficultyRating" label="地图难度评级" hint="这是地图综合评级，不等同于挑战难度。">
              <USelect v-model="form.difficultyRating" :items="[{ label: '暂无评级', value: null }, ...ratings.map((rating) => ({ label: rating, value: rating }))]" :disabled="saving" />
            </UFormField>
            <UFormField name="mechanics" label="特殊机制" hint="最多 16 个标签，每个标签不超过 64 个字符。">
              <UInputTags v-model="form.mechanics" placeholder="输入机制标签" :disabled="saving" :max="16" aria-label="特殊机制" />
            </UFormField>
          </UForm>

          <section class="challenge-section" aria-labelledby="map-challenges-title">
            <PageSectionHeader title="挑战难度" eyebrow="挑战目录" heading-id="map-challenges-title" :count="`${selectedChallenges.length} 项`" />
            <AdminDataTable
              v-model:sorting="challengeSorting"
              :sorting-options="challengeSortingOptions"
              :default-sorting="defaultChallengeSorting"
              :data="selectedChallenges"
              :columns="challengeColumns"
              :mobile-columns="challengeMobileColumns"
              :loading="loading"
              empty="暂无挑战记录。"
              :row-key="(challenge) => `${challenge.challengeId}:${challenge.gameplayRevisionId}`"
              :table-key="`map-challenges-${selectedMap.mapId}`"
              table-min-width="560px"
              class="admin-table nested-table"
            >
              <template #name-cell="{ row }">
                <strong>{{ row.original.name }}</strong>
                <small class="table-meta">{{ mapVariantLabel(row.original.mapVariant) }}</small>
              </template>
              <template #difficulty-cell="{ row }"><span>{{ row.original.difficulty ?? "地图通关" }}</span></template>
              <template #status-cell="{ row }">
                <StatusBadge :label="achievementStatusLabel(row.original.status)" :tone="achievementStatusTone(row.original.status)" />
              </template>
              <template #actions-cell="{ row }">
                <div class="table-actions">
                  <UButton
                    :to="achievementLink(row.original)"
                    :label="achievementActionLabel(row.original)"
                    size="sm"
                    color="neutral"
                    variant="outline"
                  />
                </div>
              </template>
            </AdminDataTable>
          </section>
        </section>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="panelOpen = false" />
        <UButton type="submit" form="map-metadata-editor" label="保存属性" :loading="saving" :disabled="saving" />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.table-meta { color: var(--quiet); font-size: var(--type-caption-size); }
.map-detail { display: grid; gap: 22px; }
.detail-heading .eyebrow { margin-bottom: 6px; }
.detail-heading .type-headline { margin: 0; }
.detail-heading .table-meta { margin: 6px 0 0; }
.editor-alert { margin: 0; }
.editor { display: grid; gap: 18px; padding: 4px 0 0; }
.visual-editor {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(150px, .8fr) minmax(0, 1.2fr);
}
.visual-preview {
  position: relative;
  display: grid;
  min-height: 150px;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--accent);
  background-position: center;
  background-size: cover;
  background-color: var(--surface-raised);
}
.visual-preview::before {
  position: absolute;
  inset: 0;
  background: color-mix(in oklch, var(--surface) 58%, transparent);
  content: "";
}
.visual-preview--broken { background-image: none !important; }
.visual-preview img:not(.background-probe) {
  position: relative;
  z-index: 1;
  max-width: 82%;
  max-height: 120px;
  object-fit: contain;
  filter: drop-shadow(0 8px 14px color-mix(in oklch, var(--shadow) 42%, transparent));
}
.visual-preview span,
.preview-fallback {
  position: relative;
  z-index: 1;
  font-weight: 700;
}
.preview-fallback { color: var(--muted); font-size: var(--type-caption-size); font-weight: 650; }
.background-probe {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.visual-fields { display: grid; align-content: start; gap: 14px; min-width: 0; }
.field-with-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.field-warning { margin: 6px 0 0; color: var(--danger); font-size: var(--type-caption-size); }
.challenge-section { display: grid; gap: 12px; }

.maps-table :deep(table[data-slot="base"]),
.nested-table :deep(table[data-slot="base"]) {
  width: 100%;
  table-layout: fixed;
}
.maps-table :deep(.map-col-name) { width: 22%; }
.maps-table :deep(.map-col-rating) { width: 12%; }
.maps-table :deep(.map-col-mechanics) { width: 28%; }
.maps-table :deep(.map-col-count) { width: 10%; }
.maps-table :deep(.map-col-version) { width: 14%; }
.maps-table :deep(.map-col-actions) { width: 6.5rem; min-width: 6.5rem; }

.nested-table :deep(.challenge-col-name) { width: 36%; }
.nested-table :deep(.challenge-col-difficulty) { width: 18%; }
.nested-table :deep(.challenge-col-status) { width: 14%; }
.nested-table :deep(.challenge-col-actions) { width: 12rem; min-width: 12rem; }
.nested-table :deep(strong),
.nested-table :deep(small) { display: block; }
.nested-table :deep(small) { margin-top: 4px; }

@media (max-width: 520px) {
  .visual-editor { grid-template-columns: 1fr; }
  .visual-preview { min-height: 120px; }
  .field-with-action { grid-template-columns: 1fr; }
  .field-with-action :deep(button) { width: 100%; }
}
</style>
