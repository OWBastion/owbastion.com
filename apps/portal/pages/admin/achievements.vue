<script setup lang="ts">
import type { TableColumn, TabsItem } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import AdminMapAchievementWorkspace from "~/components/admin/AdminMapAchievementWorkspace.vue";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "成就与称号 · 躲避堡垒 3" });

type AchievementStatus = "scheduled" | "active" | "sunsetting" | "retired";
type TitleAchievement = {
  challengeId: string;
  family: "achievement";
  type: "title_achievement";
  titleKey: string;
  titleName: string;
  icon: string;
  iconUrl?: string | null;
  category: string;
  categoryOverride: string | null;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  status: AchievementStatus;
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  scope?: "global" | "map";
  mapIds?: string[];
  mapVariant?: "classic";
};
type MapAchievement = {
  challengeId: string;
  family: "map";
  type: "map_completion";
  kind?: "difficulty_completion" | "pioneer" | "classic_completion" | "map_title_achievement";
  titleKey?: string;
  name: string;
  mapId: string;
  mapName: string;
  difficulty?: string;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  status: AchievementStatus;
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
  mapVariant?: "classic";
  mapTitleRule?: { ruleId: string; kind: string; displayKind: "fixed" | "map_pioneer" | "map_name_suffix"; slot: "pioneer" | "conqueror" | "dominator" | null; dynamic: boolean };
};
type CatalogTitle = {
  challengeId: string;
  family: "title_catalog";
  type: "title_catalog";
  titleKey: string;
  titleName: string;
  icon: string;
  iconUrl?: string | null;
  category: string;
  categoryOverride?: string | null;
  condition: string;
  evidenceRule?: string;
  submissionMode?: "manual" | "automatic";
  startsAt?: number | null;
  endsAt?: number | null;
  retiredVersion?: string | null;
  availability: "active" | "retired";
  scope: "global" | "map";
  displayKind: "fixed" | "map_pioneer" | "map_name_suffix";
  color?: { kind: "heroColor"; index: number } | { kind: "rgb"; value: [number, number, number] } | { kind: "palette"; name: "orange" | "red" | "purple" | "gold" | "blue" } | null;
  status: AchievementStatus;
  gameVersion: string;
  hasChallenge: false;
};
type AdminMap = { mapId: string; mapName: string };
export type AdminAchievement = TitleAchievement | MapAchievement | CatalogTitle;
type TableCell<Item> = {
  row: { id: string; original: Item };
  getContext(): { table: { getRowModel(): { rows: Array<{ id: string; original: Item }> } } };
};

const api = useAdminApi();
const items = ref<AdminAchievement[]>([]);
const status = ref<"all" | AchievementStatus>("all");
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
const titleSorting = shallowRef<SortingState>([...defaultTitleSorting]);
const titleSortingOptions = [
  { id: "category", label: "系列" },
  { id: "titleName", label: "称号" },
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

const isTitle = (item: AdminAchievement): item is TitleAchievement | CatalogTitle => item.family === "achievement" || item.family === "title_catalog";
const isChallengeTitle = (item: AdminAchievement): item is TitleAchievement => item.family === "achievement";
const isMap = (item: AdminAchievement): item is MapAchievement => item.family === "map";
const isCatalog = (item: AdminAchievement): item is CatalogTitle => item.family === "title_catalog";
const itemIdentity = (item: AdminAchievement) => isMap(item) ? `${item.mapId}:${item.challengeId}` : item.challengeId;
const isDeveloperOnly = (item: CatalogTitle) => item.category === "开发保留";
const isDeveloperOnlyCatalog = (item: AdminAchievement): item is CatalogTitle => item.family === "title_catalog" && isDeveloperOnly(item);
const itemName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
const itemCategory = (item: AdminAchievement) => isTitle(item) ? item.category : "";
const itemTitleName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
const itemScope = (item: AdminAchievement) => isTitle(item) && item.family === "title_catalog" ? item.scope : "";
const catalogScopeLabel = (scope: CatalogTitle["scope"]) => scope === "map" ? "地图称号" : "全局称号";
const catalogDisplayKindLabel = (displayKind: CatalogTitle["displayKind"]) => ({ fixed: "固定称号", map_pioneer: "地图名 + 开拓者", map_name_suffix: "地图名 + 后缀称号" })[displayKind];
const catalogColorLabel = (color: CatalogTitle["color"]) => color?.kind === "palette" ? color.name : color?.kind === "rgb" ? `RGB ${color.value.join(", ")}` : color?.kind === "heroColor" ? `英雄色 ${color.index}` : "未设置";
const catalogColorValue = (color: CatalogTitle["color"]) => color?.kind === "palette" ? color.name : "none";
const statusText = (value: AchievementStatus) => value === "scheduled" ? "未开放" : value === "active" ? "已开放" : value === "sunsetting" ? "即将结束" : "已下线";
const statusTone = (value: AchievementStatus) => value === "active" ? "success" : "warning";
const isSaving = (item: AdminAchievement) => savingId.value === itemIdentity(item);
const statusColumnFilters = computed({
  get: () => status.value === "all" ? [] : [{ id: "status", value: status.value }],
  set: (filters: Array<{ id: string; value: unknown }>) => {
    const value = filters.find((filter) => filter.id === "status")?.value;
    status.value = value === "scheduled" || value === "active" || value === "sunsetting" || value === "retired" ? value : "all";
  },
});
const titleChallengeItems = computed(() => items.value.filter(isChallengeTitle));
const catalogItems = computed(() => items.value.filter((item): item is CatalogTitle => item.family === "title_catalog"));
const mapItems = computed(() => items.value.filter(isMap));
const editingItem = computed(() => items.value.find((candidate) => itemIdentity(candidate) === editingId.value && (isTitle(candidate) || isMap(candidate))) ?? null);
const editorOpen = computed({
  get: () => editingItem.value !== null,
  set: (open: boolean) => { if (!open) closeEditing(); },
});
const achievementStatusText = (item: AdminAchievement) => isChallengeTitle(item) ? statusText(item.status) : isTitle(item) && isDeveloperOnly(item) ? item.status === "active" ? "开发保留" : "已下线" : item.status === "active" ? "已开放" : "已下线";
const achievementStatusTone = (item: AdminAchievement) => isChallengeTitle(item) ? statusTone(item.status) : "warning";
const defaultEvidenceRule = "上传包含结算画面、称号条件与玩家信息的完整截图。";
const catalogStatusItems = (item: CatalogTitle) => isDeveloperOnly(item) ? [{ label: "开发保留", value: "active" }, { label: "已下线", value: "retired" }] : [{ label: "未开放", value: "scheduled" }, { label: "已开放", value: "active" }, { label: "即将结束", value: "sunsetting" }, { label: "已下线", value: "retired" }];
function isGroupContinuation<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  const rows = cell.getContext().table.getRowModel().rows;
  const rowIndex = rows.findIndex((row) => row.id === cell.row.id);
  return rowIndex > 0 && groupValue(rows[rowIndex - 1]!.original) === groupValue(cell.row.original);
}

function getGroupRowSpan<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  if (isGroupContinuation(cell, groupValue)) return "1";
  const rows = cell.getContext().table.getRowModel().rows;
  const rowIndex = rows.findIndex((row) => row.id === cell.row.id);
  const value = groupValue(cell.row.original);
  let span = 1;
  for (let index = rowIndex + 1; index < rows.length; index++) {
    if (groupValue(rows[index]!.original) !== value) break;
    span++;
  }
  return `${span}`;
}

function getGroupCellClass<Item>(cell: TableCell<Item>, groupValue: (item: Item) => string) {
  return isGroupContinuation(cell, groupValue) ? "hidden" : "align-middle";
}

const titleColumns: TableColumn<TitleAchievement | CatalogTitle>[] = [
  {
    accessorKey: "category",
    header: "系列",
    meta: {
      rowspan: { td: (cell) => getGroupRowSpan(cell, itemCategory) },
      class: { td: (cell) => getGroupCellClass(cell, itemCategory) },
    },
  },
  { accessorKey: "titleName", header: "称号" },
  { accessorKey: "condition", header: "完成条件" },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作", enableHiding: false },
];
const catalogColumns: TableColumn<CatalogTitle>[] = [
  { accessorKey: "titleName", header: "称号" },
  { accessorKey: "icon", header: "图标" },
  { accessorKey: "category", header: "系列" },
  { accessorKey: "scope", header: "称号范围" },
  { accessorKey: "displayKind", header: "展示方式" },
  { accessorKey: "color", header: "颜色" },
  { id: "linkage", header: "挑战关联", enableHiding: false },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作", enableHiding: false },
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

const toDateTimeLocal = (value?: number | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
const setScheduleTime = (field: "startsAt" | "endsAt", value: number | null) => { if (editingItem.value && isTitle(editingItem.value)) editingItem.value[field] = value; };

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
          evidenceRule: item.evidenceRule?.trim() || defaultEvidenceRule,
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

function toggleEditing(id: string, mapId?: string) {
  iconFile.value = null;
  const item = items.value.find((candidate) => candidate.challengeId === id && (!mapId || !isMap(candidate) || candidate.mapId === mapId));
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

function setCategoryOverride(value: string) {
  if (editingItem.value && isTitle(editingItem.value)) editingItem.value.categoryOverride = value || null;
}

function setIconUrl(value: string) {
  if (editingItem.value && isTitle(editingItem.value)) editingItem.value.iconUrl = value || null;
}

function setEvidenceRule(value: string) {
  if (editingItem.value && (isTitle(editingItem.value) || isMap(editingItem.value))) editingItem.value.evidenceRule = value;
}

function setSubmissionMode(value: "manual" | "automatic") {
  if (editingItem.value && (isTitle(editingItem.value) || isMap(editingItem.value))) editingItem.value.submissionMode = value;
}

function setScope(value: "global" | "map") {
  if (editingItem.value && isChallengeTitle(editingItem.value)) editingItem.value.scope = value;
}

function setMapIds(value: string[]) {
  if (editingItem.value && isChallengeTitle(editingItem.value)) editingItem.value.mapIds = value;
}
function setMapVariant(value: "classic" | undefined) {
  if (editingItem.value && isChallengeTitle(editingItem.value)) editingItem.value.mapVariant = value;
}
function setCatalogColor(value: string) {
  if (!editingItem.value || !isCatalog(editingItem.value)) return;
  editingItem.value.color = value === "none" ? null : { kind: "palette", name: value as "orange" | "red" | "purple" | "gold" | "blue" };
}

function setRetiredVersion(value: string) {
  if (editingItem.value && (isTitle(editingItem.value) || isMap(editingItem.value))) editingItem.value.retiredVersion = value || null;
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
          <div class="section-heading"><div><p class="eyebrow">通用成就</p><h3 id="title-achievements-title">称号挑战</h3></div><span>{{ titleChallengeItems.length }} 项</span></div>
          <AdminDataTable v-model:column-filters="statusColumnFilters" v-model:sorting="titleSorting" :data="titleChallengeItems" :columns="titleColumns" :loading="loading" :sorting-options="titleSortingOptions" :default-sorting="defaultTitleSorting" empty="暂无记录。" row-key="challengeId" table-key="achievement-titles" class="admin-table achievement-table">
            <template #filters><USelect v-model="status" size="md" aria-label="筛选成就状态" :items="[{ label: '全部状态', value: 'all' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" /></template>
            <template #mobile-secondary><USelect v-model="status" size="md" aria-label="筛选成就状态" :items="[{ label: '全部状态', value: 'all' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" /></template>
            <template #category-cell="{ row }"><span class="table-meta">{{ itemCategory(row.original) }}</span></template>
            <template #titleName-cell="{ row }"><strong>{{ itemTitleName(row.original) }}</strong><small class="table-meta">{{ isChallengeTitle(row.original) ? `${row.original.mapVariant === 'classic' ? '经典版地图 · ' : ''}引入版本 ${row.original.introducedVersion}` : itemScope(row.original) === 'map' ? '地图称号' : '目录称号' }}</small></template>
            <template #condition-cell="{ row }"><span class="condition-cell">{{ row.original.condition }}</span></template>
            <template #status-cell="{ row }"><StatusBadge :class="updatedCatalogIds.has(row.original.challengeId) ? 'row-update-flash' : undefined" :label="achievementStatusText(row.original)" :tone="achievementStatusTone(row.original)" /></template>
<template #actions-cell="{ row }"><div class="table-actions"><button v-if="isChallengeTitle(row.original)" class="table-action" type="button" :aria-label="editingId === row.original.challengeId ? '收起编辑' : '编辑规则'" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button><button v-else class="table-action" type="button" :aria-label="editingId === row.original.challengeId ? '收起编辑' : '编辑状态'" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button><template v-if="isChallengeTitle(row.original)"><UPopover v-if="row.original.status !== 'retired'" :open="planningId === row.original.challengeId" @update:open="(open) => { planningId = open ? row.original.challengeId : null; }"><button class="table-action" type="button" aria-label="计划下线" :disabled="isSaving(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><circle cx="16" cy="16" r="3" /><path d="M16 14.5v1.7l1.1.7" /></svg></button><template #content><UCard class="plan-popover-card"><form class="plan-popover" @submit.prevent="planSunsetting(row.original)"><UFormField label="计划下线版本" required><UInput v-model="retirementVersions[row.original.challengeId]" required placeholder="例如 26.0713.1" :disabled="isSaving(row.original)" /></UFormField><UButton type="submit" label="确认计划" :loading="isSaving(row.original)" :disabled="!retirementVersions[row.original.challengeId]?.trim()" /></form></UCard></template></UPopover><button v-if="row.original.status !== 'retired'" class="table-action table-action-danger" type="button" aria-label="结束挑战" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" /></svg></button><button v-else class="table-action" type="button" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg></button></template><template v-else><button v-if="row.original.status === 'active'" class="table-action table-action-danger" type="button" aria-label="下线称号" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" /></svg></button><button v-else class="table-action" type="button" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg></button></template></div></template>
          </AdminDataTable>
          <AdminResponsiveDialog v-model:open="editorOpen" title="编辑规则" :description="editingItem ? itemName(editingItem) : undefined" size="lg">
            <template #body>
              <form v-if="editingItem" id="achievement-editor" class="editor" @submit.prevent="saveEditingItem(editingItem)">
                <UFormField v-if="isMap(editingItem)" class="editor-field" label="挑战名称" required><UInput class="editor-control" v-model="editingItem.name" required maxlength="256" :disabled="isSaving(editingItem)" /></UFormField>
                <UFormField v-if="isMap(editingItem)" class="editor-field" label="难度"><UInput class="editor-control" v-model="editingItem.difficulty" maxlength="64" :disabled="isSaving(editingItem)" /></UFormField>
                <UFormField class="editor-field editor-field--wide" label="完成条件" required><UTextarea class="editor-control" v-model="editingItem.condition" required maxlength="1024" :disabled="isSaving(editingItem)" /></UFormField>
                <UFormField class="editor-field editor-field--wide" label="截图规则" required><UTextarea class="editor-control" :model-value="editingItem.evidenceRule ?? defaultEvidenceRule" required maxlength="2048" :disabled="isSaving(editingItem)" @update:model-value="setEvidenceRule" /></UFormField>
                <UFormField class="editor-field" label="提交方式"><USelect class="editor-control" :model-value="editingItem.submissionMode ?? 'manual'" :disabled="isSaving(editingItem)" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :ui="{ base: 'w-full' }" @update:model-value="setSubmissionMode($event as 'manual' | 'automatic')" /></UFormField>
                <UFormField class="editor-field" label="状态"><USelect class="editor-control" v-model="editingItem.status" :disabled="isSaving(editingItem)" :items="isMap(editingItem) ? [{ label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }] : isTitle(editingItem) && isDeveloperOnlyCatalog(editingItem) ? catalogStatusItems(editingItem) : [{ label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" :ui="{ base: 'w-full' }" /></UFormField>
                <template v-if="isChallengeTitle(editingItem)"><UFormField class="editor-field" label="称号适用范围"><USelect class="editor-control" :model-value="editingItem.scope ?? 'global'" :disabled="isSaving(editingItem)" :items="[{ label: '全部地图', value: 'global' }, { label: '指定地图', value: 'map' }]" @update:model-value="setScope($event as 'global' | 'map')" /></UFormField><UFormField v-if="editingItem.scope === 'map'" class="editor-field editor-field--wide" label="指定地图"><USelect class="editor-control" :model-value="editingItem.mapIds ?? []" multiple :items="[{ label: '全部有效地图', value: '' }, ...maps.map((map) => ({ label: map.mapName, value: map.mapId }))]" :disabled="isSaving(editingItem)" @update:model-value="setMapIds(($event as string[]).filter(Boolean))" /></UFormField><UFormField v-if="editingItem.scope === 'map'" class="editor-field" label="地图版本"><USelect class="editor-control" :model-value="editingItem.mapVariant" :items="[{ label: '标准版', value: undefined }, { label: '经典版', value: 'classic' }]" :disabled="isSaving(editingItem)" @update:model-value="setMapVariant($event as 'classic' | undefined)" /></UFormField></template>
                <template v-if="isTitle(editingItem)"><UFormField class="editor-field" label="开始时间"><AdminDateTimePicker class="editor-control" :model-value="editingItem.startsAt" :disabled="isSaving(editingItem)" placeholder="选择开始时间" @update:model-value="setScheduleTime('startsAt', $event)" /></UFormField><UFormField class="editor-field" label="结束时间"><AdminDateTimePicker class="editor-control" :model-value="editingItem.endsAt" :disabled="isSaving(editingItem)" placeholder="选择结束时间" @update:model-value="setScheduleTime('endsAt', $event)" /></UFormField></template>
                <UFormField class="editor-field" label="计划下线版本"><UInput class="editor-control" :model-value="editingItem.retiredVersion ?? ''" placeholder="例如 26.0713.1" :disabled="isSaving(editingItem)" @update:model-value="setRetiredVersion" /></UFormField>
                <template v-if="isTitle(editingItem)"><UFormField class="editor-field editor-field--wide" label="自定义图标" hint="留空使用默认图标。"><div class="icon-upload"><div v-if="editingItem.iconUrl" class="icon-preview"><img :src="editingItem.iconUrl" alt="当前成就图标" /></div><UInput class="editor-control" type="url" :model-value="editingItem.iconUrl ?? ''" placeholder="https://cdn.example.com/icon.webp" maxlength="2048" :disabled="isSaving(editingItem)" @update:model-value="setIconUrl" /><details class="icon-upload-option"><summary>上传图标</summary><div class="icon-upload-content"><p>PNG、JPG 或 WebP，最大 512 KB。</p><UFileUpload v-model="iconFile" accept="image/png,image/jpeg,image/webp" :multiple="false" label="选择图标文件" :disabled="iconUploading || isSaving(editingItem)" /><UButton type="button" label="上传图标" color="neutral" variant="outline" :loading="iconUploading" :disabled="!iconFile || isSaving(editingItem)" @click="uploadIcon" /></div></details></div></UFormField><UFormField class="editor-field" label="展示分类" :hint="`留空则使用 Bastion 系列“${editingItem.category}”`"><UInput class="editor-control" :model-value="editingItem.categoryOverride ?? ''" :disabled="isSaving(editingItem)" :placeholder="editingItem.category" maxlength="128" @update:model-value="setCategoryOverride" /></UFormField></template>
              </form>
            </template>
            <template #footer>
              <UButton label="取消" color="neutral" variant="outline" size="sm" :disabled="editingItem ? isSaving(editingItem) : false" @click="closeEditing" />
              <UButton label="保存规则" size="sm" form="achievement-editor" :loading="editingItem ? isSaving(editingItem) : false" type="submit" />
            </template>
          </AdminResponsiveDialog>
        </section>
        </template>

        <template #map>
          <AdminMapAchievementWorkspace :maps="maps" :challenges="mapItems" :loading="loading" :initial-map-id="typeof route.query.mapId === 'string' ? route.query.mapId : ''" :initial-rule-id="typeof route.query.ruleId === 'string' ? route.query.ruleId : ''" @edit-challenge="(challenge) => { activeTab = 'map'; toggleEditing(challenge.challengeId, challenge.mapId); }" />
        </template>
        <template #catalog>
          <section class="catalog-section" aria-labelledby="title-catalog-title">
            <div class="section-heading"><div><p class="eyebrow">称号目录</p><h3 id="title-catalog-title">称号定义</h3></div><span>{{ catalogItems.length }} 项</span></div>
            <AdminDataTable v-model:column-filters="statusColumnFilters" v-model:sorting="titleSorting" :data="catalogItems" :columns="catalogColumns" :loading="loading" :sorting-options="titleSortingOptions" :default-sorting="defaultTitleSorting" empty="暂无称号目录记录。" row-key="challengeId" table-key="achievement-title-catalog" class="admin-table achievement-table">
              <template #filters><USelect v-model="status" size="md" aria-label="筛选称号目录状态" :items="[{ label: '全部状态', value: 'all' }, { label: '已开放', value: 'active' }, { label: '已下线', value: 'retired' }]" /></template>
              <template #mobile-secondary><USelect v-model="status" size="md" aria-label="筛选称号目录状态" :items="[{ label: '全部状态', value: 'all' }, { label: '已开放', value: 'active' }, { label: '已下线', value: 'retired' }]" /></template>
              <template #titleName-cell="{ row }"><strong>{{ row.original.titleName }}</strong><small class="table-meta">目录称号</small></template>
              <template #icon-cell="{ row }"><span class="table-meta">{{ row.original.icon }}</span></template>
              <template #category-cell="{ row }"><span class="table-meta">{{ row.original.category }}</span></template>
              <template #scope-cell="{ row }"><span>{{ catalogScopeLabel(row.original.scope) }}</span></template>
              <template #displayKind-cell="{ row }"><span>{{ catalogDisplayKindLabel(row.original.displayKind) }}</span></template>
              <template #color-cell="{ row }"><span>{{ catalogColorLabel(row.original.color) }}</span></template>
              <template #linkage-cell><span class="table-meta">无挑战，可单独授予</span></template>
              <template #status-cell="{ row }"><StatusBadge :class="updatedCatalogIds.has(row.original.challengeId) ? 'row-update-flash' : undefined" :label="achievementStatusText(row.original)" :tone="achievementStatusTone(row.original)" /></template>
              <template #actions-cell="{ row }"><div class="table-actions"><button class="table-action" type="button" aria-label="编辑状态" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button><button v-if="row.original.status === 'active'" class="table-action table-action-danger" type="button" aria-label="下线称号" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" /></svg></button><button v-else class="table-action" type="button" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg></button></div></template>
            </AdminDataTable>
          </section>
        </template>
      </UTabs>
    </section>

          <AdminResponsiveDialog v-if="activeTab === 'map' || activeTab === 'catalog'" v-model:open="editorOpen" :title="editingItem && isCatalog(editingItem) ? '编辑称号目录' : '编辑规则'" :description="editingItem ? itemName(editingItem) : undefined" size="lg">
            <template #body>
              <form v-if="editingItem" id="achievement-editor" class="editor" @submit.prevent="saveEditingItem(editingItem)">
                <template v-if="isCatalog(editingItem)"><UFormField class="editor-field" label="称号标签" required><UInput class="editor-control" v-model="editingItem.titleName" required maxlength="256" :disabled="isSaving(editingItem)" /></UFormField><UFormField class="editor-field" label="图标键" required><UInput class="editor-control" v-model="editingItem.icon" required maxlength="64" :disabled="isSaving(editingItem)" /></UFormField><UFormField class="editor-field" label="称号系列" required><UInput class="editor-control" v-model="editingItem.category" required maxlength="128" :disabled="isSaving(editingItem)" /></UFormField><UFormField class="editor-field" label="称号范围"><USelect class="editor-control" v-model="editingItem.scope" :items="[{ label: '全局称号', value: 'global' }, { label: '地图称号', value: 'map' }]" :disabled="isSaving(editingItem)" /></UFormField><UFormField class="editor-field" label="展示方式"><USelect class="editor-control" v-model="editingItem.displayKind" :items="[{ label: '固定称号', value: 'fixed' }, { label: '地图名 + 开拓者', value: 'map_pioneer' }, { label: '地图名 + 后缀称号', value: 'map_name_suffix' }]" :disabled="isSaving(editingItem)" /></UFormField><UFormField class="editor-field" label="颜色"><USelect class="editor-control" :model-value="catalogColorValue(editingItem.color)" :items="[{ label: '未设置', value: 'none' }, { label: '橙色', value: 'orange' }, { label: '红色', value: 'red' }, { label: '紫色', value: 'purple' }, { label: '金色', value: 'gold' }, { label: '蓝色', value: 'blue' }]" :disabled="isSaving(editingItem)" @update:model-value="setCatalogColor" /></UFormField></template>
                <UFormField v-if="isMap(editingItem)" class="editor-field" label="挑战名称" required><UInput class="editor-control" v-model="editingItem.name" required maxlength="256" :disabled="isSaving(editingItem)" /></UFormField>
                <UFormField v-if="isMap(editingItem)" class="editor-field" label="难度"><UInput class="editor-control" v-model="editingItem.difficulty" maxlength="64" :disabled="isSaving(editingItem)" /></UFormField>
                <template v-if="!isCatalog(editingItem)"><UFormField class="editor-field editor-field--wide" label="完成条件" required><UTextarea class="editor-control" v-model="editingItem.condition" required maxlength="1024" :disabled="isSaving(editingItem)" /></UFormField><UFormField class="editor-field editor-field--wide" label="截图规则" required><UTextarea class="editor-control" :model-value="editingItem.evidenceRule ?? defaultEvidenceRule" required maxlength="2048" :disabled="isSaving(editingItem)" @update:model-value="setEvidenceRule" /></UFormField><UFormField class="editor-field" label="提交方式"><USelect class="editor-control" :model-value="editingItem.submissionMode ?? 'manual'" :disabled="isSaving(editingItem)" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :ui="{ base: 'w-full' }" @update:model-value="setSubmissionMode($event as 'manual' | 'automatic')" /></UFormField></template>
                <UFormField class="editor-field" label="状态"><USelect class="editor-control" v-model="editingItem.status" :disabled="isSaving(editingItem)" :items="isCatalog(editingItem) ? [{ label: '已开放', value: 'active' }, { label: '已下线', value: 'retired' }] : isMap(editingItem) ? [{ label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }] : isDeveloperOnlyCatalog(editingItem) ? catalogStatusItems(editingItem) : [{ label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" :ui="{ base: 'w-full' }" /></UFormField>
                <template v-if="isTitle(editingItem) && !isCatalog(editingItem)"><UFormField class="editor-field" label="开始时间"><AdminDateTimePicker class="editor-control" :model-value="editingItem.startsAt" :disabled="isSaving(editingItem)" placeholder="选择开始时间" @update:model-value="setScheduleTime('startsAt', $event)" /></UFormField><UFormField class="editor-field" label="结束时间"><AdminDateTimePicker class="editor-control" :model-value="editingItem.endsAt" :disabled="isSaving(editingItem)" placeholder="选择结束时间" @update:model-value="setScheduleTime('endsAt', $event)" /></UFormField></template>
                <UFormField v-if="!isCatalog(editingItem)" class="editor-field" label="计划下线版本"><UInput class="editor-control" :model-value="editingItem.retiredVersion ?? ''" placeholder="例如 26.0713.1" :disabled="isSaving(editingItem)" @update:model-value="setRetiredVersion" /></UFormField>
                <template v-if="isTitle(editingItem) && !isCatalog(editingItem)"><UFormField class="editor-field editor-field--wide" label="自定义图标" hint="留空使用默认图标。"><div class="icon-upload"><div v-if="editingItem.iconUrl" class="icon-preview"><img :src="editingItem.iconUrl" alt="当前成就图标" /></div><UInput class="editor-control" type="url" :model-value="editingItem.iconUrl ?? ''" placeholder="https://cdn.example.com/icon.webp" maxlength="2048" :disabled="isSaving(editingItem)" @update:model-value="setIconUrl" /><details class="icon-upload-option"><summary>上传图标</summary><div class="icon-upload-content"><p>PNG、JPG 或 WebP，最大 512 KB。</p><UFileUpload v-model="iconFile" accept="image/png,image/jpeg,image/webp" :multiple="false" label="选择图标文件" :disabled="iconUploading || isSaving(editingItem)" /><UButton type="button" label="上传图标" color="neutral" variant="outline" :loading="iconUploading" :disabled="!iconFile || isSaving(editingItem)" @click="uploadIcon" /></div></details></div></UFormField><UFormField class="editor-field" label="展示分类" :hint="`留空则使用 Bastion 系列“${editingItem.category}”`"><UInput class="editor-control" :model-value="editingItem.categoryOverride ?? ''" :disabled="isSaving(editingItem)" :placeholder="editingItem.category" maxlength="128" @update:model-value="setCategoryOverride" /></UFormField></template>
              </form>
            </template>
            <template #footer>
              <UButton label="取消" color="neutral" variant="outline" size="sm" :disabled="editingItem ? isSaving(editingItem) : false" @click="closeEditing" />
              <UButton :label="editingItem && isCatalog(editingItem) ? '保存目录' : '保存规则'" size="sm" form="achievement-editor" :loading="editingItem ? isSaving(editingItem) : false" type="submit" />
            </template>
          </AdminResponsiveDialog>
    <AdminResponsiveDialog :open="endTarget !== null" title="结束挑战" size="sm" :dismissible="!(endTarget && isSaving(endTarget))" @update:open="(open) => { if (!open) closeEnd(); }"><template #body><form v-if="endTarget" id="end-challenge-dialog" class="end-dialog" @submit.prevent="endChallenge"><p>结束后不再接受新的截图提交。</p></form></template><template #footer><template v-if="endTarget"><UButton label="取消" color="neutral" variant="outline" :disabled="isSaving(endTarget)" @click="closeEnd" /><UButton label="结束挑战" color="error" type="submit" form="end-challenge-dialog" :loading="isSaving(endTarget)" /></template></template></AdminResponsiveDialog>
    <AdminAchievementCreateDialog v-model:open="createOpen" :maps="maps" :saving="creating" @submit="createAchievement" />
  </AdminWorkspace>
</template>

<style scoped>
.catalog { max-width: none; }
.catalog-tabs { display: grid; gap: 24px; }
.catalog-section { display: grid; gap: 12px; }
.catalog-heading { margin-bottom: 2px; }
.catalog-heading h2 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.6rem); letter-spacing: -.04em; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.section-heading .eyebrow { margin: 0; }
.section-heading h3 { margin: 3px 0 0; font-size: clamp(1.25rem, 2vw, 1.6rem); letter-spacing: -.035em; }
.section-heading > span, .table-meta { color: var(--quiet); font-size: .78rem; }
.achievement-table [data-slot="base"] { min-width: 780px; table-layout: auto; }
.achievement-table [data-slot="th"]:nth-child(1) { width: 14%; }
.achievement-table [data-slot="th"]:nth-child(2) { width: 17%; }
.achievement-table [data-slot="th"]:nth-child(4) { width: 10%; }
.achievement-table [data-slot="th"]:last-child { width: 20%; }
.achievement-table strong, .achievement-table small { display: block; }
.achievement-table small { margin-top: 4px; }
.condition-cell { display: -webkit-box; overflow: hidden; color: var(--muted); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.table-actions { justify-content: flex-start; }
.table-action svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.table-action-danger { color: var(--error); }
.table-action-danger:hover, .table-action-danger:focus-visible { color: var(--error); background: color-mix(in srgb, var(--error) 12%, transparent); }
.editor, .end-dialog, .plan-popover { display: grid; gap: 16px; }
.icon-upload { display: grid; gap: 10px; }
.icon-upload-option { border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; }
.icon-upload-option summary { padding-top: 10px; cursor: pointer; }
.icon-upload-content { display: grid; gap: 10px; padding-top: 10px; }
.icon-upload-content p { margin: 0; color: var(--quiet); font-size: .78rem; }
.icon-preview { display: grid; width: 64px; height: 64px; place-items: center; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); }
.icon-preview img { width: 42px; height: 42px; object-fit: contain; }
.editor { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 24px; gap: 20px; }
.editor-field, .editor-control { width: 100%; }
.editor :deep(textarea) { min-height: 104px; }
.editor-field--wide { grid-column: 1 / -1; }
.editor-actions { display: flex; justify-content: flex-end; gap: 8px; }
.plan-popover-card { width: min(280px, calc(100vw - 32px)); }
.plan-popover :deep(.portal-button), .end-dialog :deep(.portal-button) { min-height: 28px; padding-inline: 8px; font-size: .76rem; }
.end-dialog p { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
.portal-button { transition: transform 140ms ease, border-color 140ms ease, background 140ms ease; }
.portal-button:active { transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .portal-button { transition: opacity 140ms ease, border-color 140ms ease, background 140ms ease; }.portal-button:active { transform: none; } }
@media (max-width: 560px) { .catalog-heading, .section-heading { align-items: flex-start; flex-wrap: wrap; }.editor { grid-template-columns: minmax(0, 1fr); }.editor-field--wide { grid-column: auto; }.editor-actions { justify-content: stretch; }.editor-actions .portal-button { flex: 1; } }
</style>
