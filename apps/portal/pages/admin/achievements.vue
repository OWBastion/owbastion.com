<script setup lang="ts">
import type { TableColumn, TabsItem } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import AdminMapAchievementWorkspace from "~/components/admin/AdminMapAchievementWorkspace.vue";
import AdminAchievementEditorDialog from "~/components/admin/AdminAchievementEditorDialog.vue";
import {
  type AchievementStatus,
  type AdminAchievement,
  type AdminMap,
  type CatalogTitle,
  type MapAchievement,
  type TitleAchievement,
  DEFAULT_EVIDENCE_RULE,
  achievementStatusLabel,
  achievementStatusTone,
  isCatalog,
  isChallengeTitle,
  isDeveloperOnly,
  isMap,
  isTitle,
  itemIdentity,
  itemName,
} from "~/components/admin/admin-achievement-types";
import { mapVariantLabel } from "~/utils/map-variant";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "成就与称号 · 躲避堡垒 3" });

type TableCell<Item> = {
  row: { id: string; original: Item };
  getContext(): { table: { getRowModel(): { rows: Array<{ id: string; original: Item }> } } };
};

const api = useAdminApi();
const items = ref<AdminAchievement[]>([]);
const titleStatus = ref<"all" | AchievementStatus>("all");
const catalogStatus = ref<"all" | AchievementStatus>("all");
const editingId = ref<string | null>(null);
const planningId = ref<string | null>(null);
const retirementVersions = reactive<Record<string, string>>({});
const endTarget = ref<AdminAchievement | null>(null);
const endTrigger = ref<HTMLElement | null>(null);
const loading = ref(true);
const savingId = ref<string | null>(null);
const iconFile = shallowRef<File | null>(null);
const iconUploading = shallowRef(false);
const toast = useToast();
const errorMessage = ref("");
const route = useRoute();
const activeTab = ref(route.query.section === "map" ? "map" : route.query.section === "catalog" ? "catalog" : "generic");
const createOpen = shallowRef(false);
const creating = shallowRef(false);
const maps = ref<AdminMap[]>([]);
const defaultTitleSorting: SortingState = [
  { id: "category", desc: false },
  { id: "titleName", desc: false },
];
const defaultCatalogSorting: SortingState = [
  { id: "category", desc: false },
  { id: "titleName", desc: false },
];
const titleSorting = shallowRef<SortingState>([...defaultTitleSorting]);
const catalogSorting = shallowRef<SortingState>([...defaultCatalogSorting]);
const titleSortingOptions = [
  { id: "category", label: "系列" },
  { id: "titleName", label: "称号" },
  { id: "status", label: "状态" },
];
const catalogSortingOptions = [
  { id: "category", label: "系列" },
  { id: "titleName", label: "称号" },
  { id: "scope", label: "称号范围" },
  { id: "status", label: "状态" },
];
/* A-04 — briefly flash a row after an in-place update so the change is
   visible without reloading the whole page. */
const updatedCatalogIds = new Set<string>();
function flashRow(id: string) {
  updatedCatalogIds.add(id);
  window.setTimeout(() => updatedCatalogIds.delete(id), 420);
}
const achievementTabs = [
  { label: "通用成就", value: "generic", slot: "generic" as const },
  { label: "地图成就", value: "map", slot: "map" as const },
  { label: "称号目录", value: "catalog", slot: "catalog" as const },
] satisfies TabsItem[];

const itemCategory = (item: AdminAchievement) => isTitle(item) ? item.category : "";
const itemTitleName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
const itemScope = (item: AdminAchievement) => isTitle(item) && item.family === "title_catalog" ? item.scope : "";
const catalogScopeLabel = (scope: CatalogTitle["scope"]) => scope === "map" ? "地图称号" : "全局称号";
const catalogDisplayKindLabel = (displayKind: CatalogTitle["displayKind"]) => ({ fixed: "固定称号", map_pioneer: "地图名 + 开拓者", map_name_suffix: "地图名 + 后缀称号" })[displayKind];
const catalogColorLabel = (color: CatalogTitle["color"]) => color?.kind === "palette" ? color.name : color?.kind === "rgb" ? `RGB ${color.value.join(", ")}` : color?.kind === "heroColor" ? `英雄色 ${color.index}` : "未设置";
const isSaving = (item: AdminAchievement) => savingId.value === itemIdentity(item);
function statusFilters(source: typeof titleStatus) {
  return computed({
    get: () => source.value === "all" ? [] : [{ id: "status", value: source.value }],
    set: (filters: Array<{ id: string; value: unknown }>) => {
      const value = filters.find((filter) => filter.id === "status")?.value;
      source.value = value === "scheduled" || value === "active" || value === "sunsetting" || value === "retired" ? value : "all";
    },
  });
}
const titleStatusFilters = statusFilters(titleStatus);
const catalogStatusFilters = statusFilters(catalogStatus);
const titleChallengeItems = computed(() => items.value.filter(isChallengeTitle));
const catalogItems = computed(() => items.value.filter((item): item is CatalogTitle => item.family === "title_catalog"));
const mapItems = computed(() => items.value.filter(isMap));
const editingItem = computed(() => items.value.find((candidate) => itemIdentity(candidate) === editingId.value && (isTitle(candidate) || isMap(candidate))) ?? null);
const editorOpen = computed({
  get: () => editingItem.value !== null,
  set: (open: boolean) => { if (!open) closeEditing(); },
});
const achievementStatusText = (item: AdminAchievement) =>
  isChallengeTitle(item)
    ? achievementStatusLabel(item.status)
    : isCatalog(item) && isDeveloperOnly(item)
      ? item.status === "active" ? "开发保留" : "已下线"
      : item.status === "active" ? "已开放" : "已下线";
const achievementItemStatusTone = (item: AdminAchievement) =>
  isChallengeTitle(item) ? achievementStatusTone(item.status) : "warning";
function isGroupContinuation<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  const rows = cell.getContext().table.getRowModel().rows;
  const rowIndex = rows.findIndex((row) => row.id === cell.row.id);
  return rowIndex > 0 && groupValue(rows[rowIndex - 1]!.original) === groupValue(cell.row.original);
}

function getGroupRowSpan<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  // Continuation cells are fully suppressed; only the lead cell keeps a rowspan.
  if (isGroupContinuation(cell, groupValue)) return undefined;
  const rows = cell.getContext().table.getRowModel().rows;
  const rowIndex = rows.findIndex((row) => row.id === cell.row.id);
  const value = groupValue(cell.row.original);
  let span = 1;
  for (let index = rowIndex + 1; index < rows.length; index++) {
    if (groupValue(rows[index]!.original) !== value) break;
    span++;
  }
  return span > 1 ? String(span) : undefined;
}

function getGroupCellClass<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  return isGroupContinuation(cell, groupValue) ? "achievement-group-cell achievement-group-cell--continued" : "achievement-group-cell";
}

const titleColumns: TableColumn<TitleAchievement>[] = [
  {
    accessorKey: "category",
    header: "系列",
    meta: {
      // Nuxt UI types require string; empty string omits a meaningful rowspan in the DOM.
      rowspan: { td: (cell) => getGroupRowSpan(cell, itemCategory) ?? "" },
      class: {
        th: "achievement-col-category",
        td: (cell) => `${getGroupCellClass(cell, itemCategory)} achievement-col-category`,
      },
    },
  },
  { accessorKey: "titleName", header: "称号", meta: { class: { th: "achievement-col-title", td: "achievement-col-title" } } },
  { accessorKey: "condition", header: "完成条件", meta: { class: { th: "achievement-col-condition", td: "achievement-col-condition" } } },
  { accessorKey: "status", header: "状态", meta: { class: { th: "achievement-col-status", td: "achievement-col-status" } } },
  { id: "actions", header: "操作", enableHiding: false, meta: { class: { th: "achievement-col-actions", td: "achievement-col-actions" } } },
];
const catalogColumns: TableColumn<CatalogTitle>[] = [
  { accessorKey: "titleName", header: "称号", meta: { class: { th: "catalog-col-title", td: "catalog-col-title" } } },
  { accessorKey: "icon", header: "图标", meta: { class: { th: "catalog-col-icon", td: "catalog-col-icon" } } },
  { accessorKey: "category", header: "系列", meta: { class: { th: "catalog-col-category", td: "catalog-col-category" } } },
  { accessorKey: "scope", header: "称号范围", meta: { class: { th: "catalog-col-scope", td: "catalog-col-scope" } } },
  { accessorKey: "displayKind", header: "展示方式", meta: { class: { th: "catalog-col-display", td: "catalog-col-display" } } },
  { accessorKey: "color", header: "颜色", meta: { class: { th: "catalog-col-color", td: "catalog-col-color" } } },
  { id: "linkage", header: "挑战关联", enableHiding: false, meta: { class: { th: "catalog-col-linkage", td: "catalog-col-linkage" } } },
  { accessorKey: "status", header: "状态", meta: { class: { th: "catalog-col-status", td: "catalog-col-status" } } },
  { id: "actions", header: "操作", enableHiding: false, meta: { class: { th: "catalog-col-actions", td: "catalog-col-actions" } } },
];
async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [response, mapResponse] = await Promise.all([
      api<{ items: AdminAchievement[] }>("/v1/achievements"),
      api<{ items: AdminMap[] }>("/v1/maps"),
    ]);
    items.value = response.items;
    maps.value = mapResponse.items;
    for (const item of items.value) if (isChallengeTitle(item) || isMap(item)) retirementVersions[itemIdentity(item)] ??= item.retiredVersion ?? "";
    if (editingId.value && !items.value.some((item) => itemIdentity(item) === editingId.value)) editingId.value = null;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取成就目录，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

function titleUpdate(item: TitleAchievement, status: AchievementStatus = item.status, retiredVersion?: string) {
  return {
    family: "achievement",
    condition: item.condition,
    evidenceRule: item.evidenceRule,
    submissionMode: item.submissionMode,
    categoryOverride: item.categoryOverride?.trim() || null,
    iconUrl: item.iconUrl?.trim() || null,
    status,
    ...(item.scope ? { scope: item.scope, mapIds: item.scope === "map" ? item.mapIds ?? [] : [] } : {}),
    ...(item.scope === "map" ? { mapVariant: item.mapVariant } : {}),
    ...(status === "sunsetting" && (retiredVersion ?? item.retiredVersion)?.trim() ? { retiredVersion: (retiredVersion ?? item.retiredVersion)!.trim() } : {}),
    ...(status === "scheduled" ? {
      ...(item.startsAt && item.startsAt > 0 ? { startsAt: item.startsAt } : {}),
      ...(item.endsAt && item.endsAt > 0 ? { endsAt: item.endsAt } : {}),
    } : {}),
  };
}

async function openCreate() {
  errorMessage.value = "";
  try {
    const response = await api<{ items: AdminMap[] }>("/v1/maps");
    maps.value = response.items;
    createOpen.value = true;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取地图目录，请稍后重试。").description;
  }
}

async function loadMapOptions() {
  if (maps.value.length) return;
  try { maps.value = (await api<{ items: AdminMap[] }>("/v1/maps")).items; } catch { /* the editor can still save an unchanged scope */ }
}

async function createAchievement(payload: Record<string, unknown>, iconFile: File | null) {
  creating.value = true;
  errorMessage.value = "";
  let iconUploadError = "";
  try {
    const created = await api<AdminAchievement>("/v1/achievements", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: payload });
    items.value = [created, ...items.value];
    if (iconFile) {
      const body = new FormData();
      body.append("file", iconFile);
      try {
        await api<{ iconUrl: string }>(`/v1/titles/${encodeURIComponent(String(payload.titleKey))}/icon`, { method: "POST", body });
      } catch (error) {
        iconUploadError = portalErrorDetails(error, "成就已创建，但图标上传失败，请稍后在编辑中重试。").description;
      }
    }
    toast.add({ title: "成就挑战已创建", color: "success" });
    createOpen.value = false;
    if (iconUploadError) errorMessage.value = iconUploadError;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法创建成就挑战，请稍后重试。").description;
  } finally {
    creating.value = false;
  }
}


function updatePayload(item: AdminAchievement, status: AchievementStatus, retiredVersion?: string) {
  if (isChallengeTitle(item)) return titleUpdate(item, status, retiredVersion);
  if (isMap(item)) return { family: "map", name: item.name, difficulty: item.difficulty ?? null, condition: item.condition, evidenceRule: item.evidenceRule, submissionMode: item.submissionMode, status, ...(status === "sunsetting" ? { retiredVersion: retiredVersion ?? item.retiredVersion ?? "" } : {}) };
  throw new Error("CATALOG_TITLE_UPDATE_REQUIRES_CATALOG_ENDPOINT");
}

async function saveCatalogTitle(item: CatalogTitle, status: AchievementStatus, includeChallengeFields = false) {
  savingId.value = itemIdentity(item);
  errorMessage.value = "";
  try {
    await api<void>(`/v1/titles/${encodeURIComponent(item.titleKey)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: {
        contractVersion: "1",
        status,
        label: item.titleName,
        icon: item.icon,
        category: item.category,
        scope: item.scope,
        displayKind: item.displayKind,
        color: item.color ?? null,
        ...(includeChallengeFields ? {
          condition: item.condition,
          evidenceRule: item.evidenceRule?.trim() || DEFAULT_EVIDENCE_RULE,
          submissionMode: item.submissionMode ?? "manual",
          categoryOverride: item.categoryOverride?.trim() || null,
          iconUrl: item.iconUrl?.trim() || null,
          ...(status === "sunsetting" && item.retiredVersion?.trim() ? { retiredVersion: item.retiredVersion.trim() } : {}),
          ...(status === "scheduled" ? {
            ...(item.startsAt && item.startsAt > 0 ? { startsAt: item.startsAt } : {}),
            ...(item.endsAt && item.endsAt > 0 ? { endsAt: item.endsAt } : {}),
          } : {}),
        } : {}),
      },
    });
    toast.add({ title: status === "active" ? "称号已重新开放" : "称号已下线", color: "success" });
    // A-04 — update the catalog row in place instead of reloading the whole page.
    const updated = items.value.find((candidate): candidate is CatalogTitle => candidate.challengeId === item.challengeId && candidate.family === "title_catalog");
    if (updated) {
      updated.status = status;
      updated.availability = status === "retired" ? "retired" : "active";
      if (includeChallengeFields) {
        if (item.condition !== undefined) updated.condition = item.condition;
        if (item.evidenceRule !== undefined) updated.evidenceRule = item.evidenceRule;
        if (item.submissionMode !== undefined) updated.submissionMode = item.submissionMode;
        if (item.categoryOverride !== undefined) updated.categoryOverride = item.categoryOverride;
        if (item.iconUrl !== undefined) updated.iconUrl = item.iconUrl;
        if (item.retiredVersion !== undefined) updated.retiredVersion = item.retiredVersion;
        if (item.startsAt !== undefined) updated.startsAt = item.startsAt;
        if (item.endsAt !== undefined) updated.endsAt = item.endsAt;
      }
      flashRow(updated.challengeId);
    }
    return true;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存称号状态，请稍后重试。").description;
    return false;
  } finally {
    savingId.value = null;
  }
}

async function save(item: AdminAchievement, body: Record<string, unknown>, message: string) {
  savingId.value = itemIdentity(item);
  errorMessage.value = "";
  try {
    const updated = await api<AdminAchievement>(`/v1/achievements/${encodeURIComponent(item.challengeId)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", ...body },
    });
    items.value = items.value.map((candidate) => itemIdentity(candidate) === itemIdentity(updated) ? updated : candidate);
    toast.add({ title: message, color: "success" });
    return true;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存成就规则，请稍后重试。").description;
    return false;
  } finally {
    savingId.value = null;
  }
}

async function saveTitle(item: TitleAchievement) {
  if (await save(item, titleUpdate(item), "成就规则已保存")) editingId.value = null;
}

async function saveMap(item: MapAchievement) {
  if (await save(item, updatePayload(item, item.status), "地图挑战规则已保存")) editingId.value = null;
}

async function saveEditingItem(item: AdminAchievement) {
  if (isChallengeTitle(item)) {
    await saveTitle(item);
    return;
  }
  if (isMap(item)) {
    await saveMap(item);
    return;
  }
  if (await saveCatalogTitle(item, item.status)) editingId.value = null;
}

async function planSunsetting(item: AdminAchievement) {
  const version = retirementVersions[itemIdentity(item)]?.trim();
  if (!version) return;
  if (await save(item, updatePayload(item, "sunsetting", version), item.status === "active" ? "挑战已计划下线" : "计划下线版本已保存")) planningId.value = null;
}

async function reopen(item: AdminAchievement) {
  if (item.family === "title_catalog") return saveCatalogTitle(item, "active", false);
  await save(item, updatePayload(item, "active"), "挑战已重新开放");
}

function openEnd(item: AdminAchievement, trigger: EventTarget | null) {
  endTarget.value = item;
  endTrigger.value = trigger instanceof HTMLElement ? trigger : null;
}

function closeEnd() {
  const trigger = endTrigger.value;
  endTarget.value = null;
  endTrigger.value = null;
  void nextTick(() => trigger?.isConnected && trigger.focus());
}

function toggleEditing(id: string, mapId?: string, gameplayRevisionId?: string) {
  iconFile.value = null;
  const item = items.value.find((candidate) => candidate.challengeId === id && (!mapId || !isMap(candidate) || candidate.mapId === mapId && (!gameplayRevisionId || candidate.gameplayRevisionId === gameplayRevisionId)));
  const identity = item ? itemIdentity(item) : id;
  editingId.value = editingId.value === identity ? null : identity;
  if (editingId.value) void loadMapOptions();
}

function closeEditing() {
  iconFile.value = null;
  editingId.value = null;
}

async function uploadIcon() {
  const item = editingItem.value;
  const file = iconFile.value;
  if (!item || !isTitle(item) || !file) return;
  iconUploading.value = true;
  errorMessage.value = "";
  try {
    const body = new FormData();
    body.append("file", file);
    const response = await api<{ iconUrl: string }>(`/v1/titles/${encodeURIComponent(item.titleKey)}/icon`, { method: "POST", body });
    item.iconUrl = response.iconUrl;
    iconFile.value = null;
    toast.add({ title: "成就图标已上传", color: "success" });
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法上传成就图标，请稍后重试。").description;
  } finally {
    iconUploading.value = false;
  }
}








async function endChallenge() {
  const item = endTarget.value;
  if (!item) return;
  if (item.family === "title_catalog") {
    await saveCatalogTitle(item, "retired", false);
    closeEnd();
    return;
  }
  if (await save(item, updatePayload(item, "retired"), "挑战已下线")) closeEnd();
}

onMounted(() => void load());

</script>

<template>
  <AdminWorkspace title="成就与称号">
    <template #actions><UButton label="新建挑战" icon="i-lucide-plus" @click="openCreate" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section class="catalog" aria-labelledby="catalog-title">
      <UTabs v-model="activeTab" :items="achievementTabs" variant="link" aria-label="成就类型" class="catalog-tabs">
        <template #generic>
          <section class="catalog-section" aria-labelledby="title-achievements-title">
            <h2 id="title-achievements-title" class="sr-only">称号挑战</h2>
            <AdminDataTable v-model:column-filters="titleStatusFilters" v-model:sorting="titleSorting" :data="titleChallengeItems" :columns="titleColumns" :loading="loading" :sorting-options="titleSortingOptions" :default-sorting="defaultTitleSorting" empty="暂无记录。" row-key="challengeId" table-key="achievement-titles" table-min-width="860px" class="admin-table achievement-table achievement-table--titles">
              <template #filters>
                <USelect v-model="titleStatus" size="md" aria-label="筛选成就状态" :items="[{ label: '全部状态', value: 'all' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" />
              </template>
              <template #mobile-secondary>
                <USelect v-model="titleStatus" size="md" aria-label="筛选成就状态" :items="[{ label: '全部状态', value: 'all' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" />
              </template>
              <template #category-cell="{ row }"><span class="table-meta">{{ itemCategory(row.original) }}</span></template>
              <template #titleName-cell="{ row }">
                <strong>{{ itemTitleName(row.original) }}</strong>
                <small class="table-meta">{{ isChallengeTitle(row.original) ? `${row.original.scope === 'map' ? `${mapVariantLabel(row.original.mapVariant)} · ` : ''}引入版本 ${row.original.introducedVersion}` : itemScope(row.original) === 'map' ? '地图称号' : '目录称号' }}</small>
              </template>
              <template #condition-cell="{ row }"><span class="condition-cell">{{ row.original.condition }}</span></template>
              <template #status-cell="{ row }">
                <StatusBadge :class="updatedCatalogIds.has(row.original.challengeId) ? 'row-update-flash' : undefined" :label="achievementStatusText(row.original)" :tone="achievementItemStatusTone(row.original)" />
              </template>
              <template #actions-cell="{ row }">
                <div class="table-actions">
                  <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-pencil" :label="editingId === itemIdentity(row.original) ? '收起' : '编辑'" :aria-label="editingId === itemIdentity(row.original) ? '收起编辑' : '编辑规则'" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)" />
                  <UPopover v-if="row.original.status !== 'retired'" :open="planningId === row.original.challengeId" @update:open="(open) => { planningId = open ? row.original.challengeId : null; }">
                    <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-calendar-clock" label="计划" aria-label="计划下线" :disabled="isSaving(row.original)" />
                    <template #content>
                      <UCard class="plan-popover-card">
                        <form class="plan-popover" @submit.prevent="planSunsetting(row.original)">
                          <UFormField label="计划下线版本" required>
                            <UInput v-model="retirementVersions[row.original.challengeId]" required placeholder="例如 26.0713.1" :disabled="isSaving(row.original)" />
                          </UFormField>
                          <UButton type="submit" block label="确认计划" :loading="isSaving(row.original)" :disabled="!retirementVersions[row.original.challengeId]?.trim()" />
                        </form>
                      </UCard>
                    </template>
                  </UPopover>
                  <UButton v-if="row.original.status !== 'retired'" size="sm" color="error" variant="soft" icon="i-lucide-square-stop" label="结束" aria-label="结束挑战" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)" />
                  <UButton v-else size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" label="重开" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)" />
                </div>
              </template>
            </AdminDataTable>
          </section>
        </template>

        <template #map>
          <AdminMapAchievementWorkspace :maps="maps" :challenges="mapItems" :loading="loading" :initial-map-id="typeof route.query.mapId === 'string' ? route.query.mapId : ''" :initial-rule-id="typeof route.query.ruleId === 'string' ? route.query.ruleId : ''" @edit-challenge="(challenge) => { activeTab = 'map'; toggleEditing(challenge.challengeId, challenge.mapId, challenge.gameplayRevisionId); }" />
        </template>

        <template #catalog>
          <section class="catalog-section" aria-labelledby="title-catalog-title">
            <h2 id="title-catalog-title" class="sr-only">称号目录</h2>
            <AdminDataTable v-model:column-filters="catalogStatusFilters" v-model:sorting="catalogSorting" :data="catalogItems" :columns="catalogColumns" :loading="loading" :sorting-options="catalogSortingOptions" :default-sorting="defaultCatalogSorting" empty="暂无称号目录记录。" row-key="challengeId" table-key="achievement-title-catalog" table-min-width="1120px" class="admin-table achievement-table achievement-table--catalog">
              <template #filters>
                <USelect v-model="catalogStatus" size="md" aria-label="筛选称号目录状态" :items="[{ label: '全部状态', value: 'all' }, { label: '已开放', value: 'active' }, { label: '已下线', value: 'retired' }]" />
              </template>
              <template #mobile-secondary>
                <USelect v-model="catalogStatus" size="md" aria-label="筛选称号目录状态" :items="[{ label: '全部状态', value: 'all' }, { label: '已开放', value: 'active' }, { label: '已下线', value: 'retired' }]" />
              </template>
              <template #titleName-cell="{ row }"><strong>{{ row.original.titleName }}</strong></template>
              <template #icon-cell="{ row }"><span class="table-meta">{{ row.original.icon }}</span></template>
              <template #category-cell="{ row }"><span class="table-meta">{{ row.original.category }}</span></template>
              <template #scope-cell="{ row }"><span>{{ catalogScopeLabel(row.original.scope) }}</span></template>
              <template #displayKind-cell="{ row }"><span>{{ catalogDisplayKindLabel(row.original.displayKind) }}</span></template>
              <template #color-cell="{ row }"><span>{{ catalogColorLabel(row.original.color) }}</span></template>
              <template #linkage-cell><span class="table-meta">无关联挑战</span></template>
              <template #status-cell="{ row }">
                <StatusBadge :class="updatedCatalogIds.has(row.original.challengeId) ? 'row-update-flash' : undefined" :label="achievementStatusText(row.original)" :tone="achievementItemStatusTone(row.original)" />
              </template>
              <template #actions-cell="{ row }">
                <div class="table-actions">
                  <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-pencil" label="编辑" aria-label="编辑状态" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)" />
                  <UButton v-if="row.original.status === 'active'" size="sm" color="error" variant="soft" icon="i-lucide-square-stop" label="下线" aria-label="下线称号" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)" />
                  <UButton v-else size="sm" color="neutral" variant="outline" icon="i-lucide-rotate-ccw" label="重开" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)" />
                </div>
              </template>
            </AdminDataTable>
          </section>
        </template>
      </UTabs>
    </section>

    <AdminAchievementEditorDialog
      v-model:open="editorOpen"
      v-model:icon-file="iconFile"
      :item="editingItem"
      :maps="maps"
      :saving="editingItem ? isSaving(editingItem) : false"
      :icon-uploading="iconUploading"
      @save="editingItem && saveEditingItem(editingItem)"
      @cancel="closeEditing"
      @upload-icon="uploadIcon"
    />

    <AdminResponsiveDialog :open="endTarget !== null" title="结束挑战" size="sm" :dismissible="!(endTarget && isSaving(endTarget))" @update:open="(open) => { if (!open) closeEnd(); }">
      <template #body>
        <form v-if="endTarget" id="end-challenge-dialog" class="end-dialog" @submit.prevent="endChallenge">
          <p>结束后不再接受新的截图提交。</p>
        </form>
      </template>
      <template #footer>
        <template v-if="endTarget">
          <UButton label="取消" color="neutral" variant="outline" :disabled="isSaving(endTarget)" @click="closeEnd" />
          <UButton label="结束挑战" color="error" type="submit" form="end-challenge-dialog" :loading="isSaving(endTarget)" />
        </template>
      </template>
    </AdminResponsiveDialog>

    <AdminAchievementCreateDialog v-model:open="createOpen" :maps="maps" :saving="creating" @submit="createAchievement" />
  </AdminWorkspace>
</template>

<style scoped>
.catalog { max-width: none; }
.catalog-tabs { display: grid; gap: 24px; }
.catalog-section { display: grid; gap: 12px; }
.catalog-note { margin: -4px 0 0; color: var(--quiet); font-size: var(--type-caption-size); }
.table-meta { color: var(--quiet); font-size: var(--type-caption-size); }

/* Keep fixed layout from AdminDataTable but pin column tracks so header/body stay aligned. */
.achievement-table :deep(table[data-slot="base"]) {
  width: 100%;
  table-layout: fixed;
}
.achievement-table :deep([data-slot="th"]),
.achievement-table :deep([data-slot="td"]) {
  overflow-wrap: anywhere;
  vertical-align: middle;
}
.achievement-table :deep(strong),
.achievement-table :deep(small) { display: block; }
.achievement-table :deep(small) { margin-top: 4px; }

/* Rowspan continuations must not consume a column track. */
.achievement-table :deep(td.achievement-group-cell--continued) {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  border: 0 !important;
}

.achievement-table--titles :deep(.achievement-col-category) { width: 14%; }
.achievement-table--titles :deep(.achievement-col-title) { width: 20%; }
.achievement-table--titles :deep(.achievement-col-condition) { width: 34%; }
.achievement-table--titles :deep(.achievement-col-status) { width: 12%; }
.achievement-table--titles :deep(.achievement-col-actions) { width: 14.5rem; min-width: 14.5rem; }

.achievement-table--catalog :deep(.catalog-col-title) { width: 14%; }
.achievement-table--catalog :deep(.catalog-col-icon) { width: 8%; }
.achievement-table--catalog :deep(.catalog-col-category) { width: 12%; }
.achievement-table--catalog :deep(.catalog-col-scope) { width: 10%; }
.achievement-table--catalog :deep(.catalog-col-display) { width: 14%; }
.achievement-table--catalog :deep(.catalog-col-color) { width: 8%; }
.achievement-table--catalog :deep(.catalog-col-linkage) { width: 14%; }
.achievement-table--catalog :deep(.catalog-col-status) { width: 10%; }
.achievement-table--catalog :deep(.catalog-col-actions) { width: 10.5rem; min-width: 10.5rem; }

.condition-cell {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.plan-popover { display: grid; gap: 12px; }
.plan-popover-card { width: min(280px, calc(100vw - 32px)); }
.end-dialog p { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
</style>
