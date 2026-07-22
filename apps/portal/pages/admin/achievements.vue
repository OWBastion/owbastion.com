<script setup lang="ts">
import type { TableColumn, TabsItem } from "@nuxt/ui";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "成就管理 · 躲避堡垒 3" });

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
};
type MapAchievement = {
  challengeId: string;
  family: "map";
  type: "map_completion";
  name: string;
  mapId: string;
  mapName: string;
  difficulty?: string;
  status: AchievementStatus;
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
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
  status: AchievementStatus;
  gameVersion: string;
  hasChallenge: false;
};
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
const activeTab = ref("generic");
const achievementTabs = [
  { label: "通用成就", value: "generic", slot: "generic" as const },
  { label: "地图挑战", value: "map", slot: "map" as const },
] satisfies TabsItem[];

const isTitle = (item: AdminAchievement): item is TitleAchievement | CatalogTitle => item.family === "achievement" || item.family === "title_catalog";
const isChallengeTitle = (item: AdminAchievement): item is TitleAchievement => item.family === "achievement";
const isMap = (item: AdminAchievement): item is MapAchievement => item.family === "map";
const isDeveloperOnly = (item: CatalogTitle) => item.category === "开发保留";
const isDeveloperOnlyCatalog = (item: TitleAchievement | CatalogTitle): item is CatalogTitle => item.family === "title_catalog" && isDeveloperOnly(item);
const itemName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
const statusText = (value: AchievementStatus) => value === "scheduled" ? "未开放" : value === "active" ? "已开放" : value === "sunsetting" ? "即将结束" : "已下线";
const statusTone = (value: AchievementStatus) => value === "active" ? "success" : "warning";
const isSaving = (item: AdminAchievement) => savingId.value === item.challengeId;
const statusColumnFilters = computed({
  get: () => status.value === "all" ? [] : [{ id: "status", value: status.value }],
  set: (filters: Array<{ id: string; value: unknown }>) => {
    const value = filters.find((filter) => filter.id === "status")?.value;
    status.value = value === "scheduled" || value === "active" || value === "sunsetting" || value === "retired" ? value : "all";
  },
});
const titleItems = computed(() => items.value.filter(isTitle));
const mapItems = computed(() => items.value.filter(isMap));
const editingItem = computed(() => {
  return titleItems.value.find((candidate) => candidate.challengeId === editingId.value) ?? null;
});
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
      rowspan: { td: (cell) => getGroupRowSpan(cell, (item) => item.category) },
      class: { td: (cell) => getGroupCellClass(cell, (item) => item.category) },
    },
  },
  { accessorKey: "titleName", header: "称号" },
  { accessorKey: "condition", header: "完成条件" },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作", enableHiding: false },
];
const mapColumns: TableColumn<MapAchievement>[] = [
  {
    accessorKey: "mapName",
    header: "地图",
    meta: {
      rowspan: { td: (cell) => getGroupRowSpan(cell, (item) => item.mapName) },
      class: { td: (cell) => getGroupCellClass(cell, (item) => item.mapName) },
    },
  },
  { accessorKey: "name", header: "挑战" },
  { accessorKey: "difficulty", header: "难度" },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作", enableHiding: false },
];
async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await api<{ items: AdminAchievement[] }>("/v1/achievements");
    items.value = response.items;
    for (const item of items.value) if (isChallengeTitle(item) || isMap(item)) retirementVersions[item.challengeId] ??= item.retiredVersion ?? "";
    if (editingId.value && !items.value.some((item) => item.challengeId === editingId.value)) editingId.value = null;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取成就目录，请稍后重试。";
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
    ...(status === "sunsetting" && (retiredVersion ?? item.retiredVersion)?.trim() ? { retiredVersion: (retiredVersion ?? item.retiredVersion)!.trim() } : {}),
    ...(status === "scheduled" ? {
      ...(item.startsAt && item.startsAt > 0 ? { startsAt: item.startsAt } : {}),
      ...(item.endsAt && item.endsAt > 0 ? { endsAt: item.endsAt } : {}),
    } : {}),
  };
}

const toDateTimeLocal = (value?: number | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
const setScheduleTime = (field: "startsAt" | "endsAt", value: number | null) => { if (editingItem.value && isTitle(editingItem.value)) editingItem.value[field] = value; };

function updatePayload(item: AdminAchievement, status: AchievementStatus, retiredVersion?: string) {
  if (isChallengeTitle(item)) return titleUpdate(item, status, retiredVersion);
  if (isMap(item)) return { family: "map", status, ...(status === "sunsetting" ? { retiredVersion: retiredVersion ?? item.retiredVersion ?? "" } : {}) };
  throw new Error("CATALOG_TITLE_UPDATE_REQUIRES_CATALOG_ENDPOINT");
}

async function saveCatalogTitle(item: CatalogTitle, status: AchievementStatus, includeChallengeFields = true) {
  savingId.value = item.challengeId;
  errorMessage.value = "";
  try {
    await api<void>(`/v1/titles/${encodeURIComponent(item.titleKey)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {
        contractVersion: "1",
        status,
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
    await load();
    return true;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法保存称号状态，请稍后重试。";
    return false;
  } finally {
    savingId.value = null;
  }
}

async function save(item: AdminAchievement, body: Record<string, unknown>, message: string) {
  savingId.value = item.challengeId;
  errorMessage.value = "";
  try {
    await api<void>(`/v1/achievements/${encodeURIComponent(item.challengeId)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", ...body },
    });
    toast.add({ title: message, color: "success" });
    await load();
    return true;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法保存成就规则，请稍后重试。";
    return false;
  } finally {
    savingId.value = null;
  }
}

async function saveTitle(item: TitleAchievement) {
  if (await save(item, titleUpdate(item), "成就规则已保存")) editingId.value = null;
}

async function saveEditingItem(item: TitleAchievement | CatalogTitle) {
  if (isChallengeTitle(item)) {
    await saveTitle(item);
    return;
  }
  if (await saveCatalogTitle(item, item.status, true)) editingId.value = null;
}

async function planSunsetting(item: AdminAchievement) {
  const version = retirementVersions[item.challengeId]?.trim();
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

function toggleEditing(id: string) {
  iconFile.value = null;
  editingId.value = editingId.value === id ? null : id;
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
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法上传成就图标，请稍后重试。";
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
  if (editingItem.value && isTitle(editingItem.value)) editingItem.value.evidenceRule = value;
}

function setSubmissionMode(value: "manual" | "automatic") {
  if (editingItem.value && isTitle(editingItem.value)) editingItem.value.submissionMode = value;
}

function setRetiredVersion(value: string) {
  if (editingItem.value && isTitle(editingItem.value)) editingItem.value.retiredVersion = value || null;
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
  <AdminWorkspace title="成就管理" :count="loading ? '读取中…' : `${items.length} 项`">
    <template #actions><NuxtLink class="migration-link" to="/admin/titles">称号迁移</NuxtLink></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <section class="catalog" aria-labelledby="catalog-title">
      <UTabs v-model="activeTab" :items="achievementTabs" aria-label="成就类型" class="catalog-tabs">
        <template #generic>
        <section class="catalog-section" aria-labelledby="title-achievements-title">
          <div class="section-heading"><div><p class="eyebrow">通用成就</p><h3 id="title-achievements-title">称号挑战</h3></div><span>{{ titleItems.length }} 项</span></div>
          <AdminDataTable v-model:column-filters="statusColumnFilters" :data="titleItems" :columns="titleColumns" :loading="loading" empty="暂无记录。" table-key="achievement-titles" class="admin-table achievement-table">
            <template #filters><USelect v-model="status" size="md" aria-label="筛选成就状态" :items="[{ label: '全部状态', value: 'all' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" /></template>
            <template #category-cell="{ row }"><span class="table-meta">{{ row.original.category }}</span></template>
            <template #titleName-cell="{ row }"><strong>{{ row.original.titleName }}</strong><small class="table-meta">{{ isChallengeTitle(row.original) ? `引入版本 ${row.original.introducedVersion}` : row.original.scope === 'map' ? '地图称号' : '目录称号' }}</small></template>
            <template #condition-cell="{ row }"><span class="condition-cell">{{ row.original.condition }}</span></template>
            <template #status-cell="{ row }"><StatusBadge :label="achievementStatusText(row.original)" :tone="achievementStatusTone(row.original)" /></template>
            <template #actions-cell="{ row }"><div class="table-actions"><button v-if="isTitle(row.original)" class="table-action" type="button" :aria-label="editingId === row.original.challengeId ? '收起编辑' : isChallengeTitle(row.original) ? '编辑规则' : '编辑状态'" :disabled="isSaving(row.original)" @click="toggleEditing(row.original.challengeId)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button><template v-if="isChallengeTitle(row.original)"><UPopover v-if="row.original.status !== 'retired'" :open="planningId === row.original.challengeId" @update:open="(open) => { planningId = open ? row.original.challengeId : null; }"><button class="table-action" type="button" aria-label="计划下线" :disabled="isSaving(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><circle cx="16" cy="16" r="3" /><path d="M16 14.5v1.7l1.1.7" /></svg></button><template #content><UCard class="plan-popover-card"><form class="plan-popover" @submit.prevent="planSunsetting(row.original)"><UFormField label="计划下线版本" required><UInput v-model="retirementVersions[row.original.challengeId]" required placeholder="例如 26.0713.1" :disabled="isSaving(row.original)" /></UFormField><UButton type="submit" label="确认计划" :loading="isSaving(row.original)" :disabled="!retirementVersions[row.original.challengeId]?.trim()" /></form></UCard></template></UPopover><button v-if="row.original.status !== 'retired'" class="table-action table-action-danger" type="button" aria-label="结束挑战" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" /></svg></button><button v-else class="table-action" type="button" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg></button></template><template v-else><button v-if="row.original.status === 'active'" class="table-action table-action-danger" type="button" aria-label="下线称号" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" /></svg></button><button v-else class="table-action" type="button" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg></button></template></div></template>
          </AdminDataTable>
          <UModal v-model:open="editorOpen" title="编辑规则" :description="editingItem?.titleName" scrollable :ui="{ content: 'max-w-2xl', body: 'p-0 sm:p-0' }">
            <template #body>
              <form v-if="editingItem" id="achievement-editor" class="editor" @submit.prevent="saveEditingItem(editingItem)">
                <UFormField class="editor-field" label="完成条件" required><UTextarea class="editor-control" v-model="editingItem.condition" required maxlength="1024" :disabled="isSaving(editingItem)" /></UFormField>
                <UFormField class="editor-field" label="截图规则" required><UTextarea class="editor-control" :model-value="editingItem.evidenceRule ?? defaultEvidenceRule" required maxlength="2048" :disabled="isSaving(editingItem)" @update:model-value="setEvidenceRule" /></UFormField>
                <UFormField class="editor-field" label="提交方式"><USelect class="editor-control" :model-value="editingItem.submissionMode ?? 'manual'" :disabled="isSaving(editingItem)" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :ui="{ base: 'w-full' }" @update:model-value="setSubmissionMode($event as 'manual' | 'automatic')" /></UFormField>
                <UFormField class="editor-field" label="状态"><USelect class="editor-control" v-model="editingItem.status" :disabled="isSaving(editingItem)" :items="isDeveloperOnlyCatalog(editingItem) ? catalogStatusItems(editingItem) : [{ label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" :ui="{ base: 'w-full' }" /></UFormField>
                <UFormField class="editor-field" label="开始时间"><AdminDateTimePicker class="editor-control" :model-value="editingItem.startsAt" :disabled="isSaving(editingItem)" placeholder="选择开始时间" @update:model-value="setScheduleTime('startsAt', $event)" /></UFormField>
                <UFormField class="editor-field" label="结束时间"><AdminDateTimePicker class="editor-control" :model-value="editingItem.endsAt" :disabled="isSaving(editingItem)" placeholder="选择结束时间" @update:model-value="setScheduleTime('endsAt', $event)" /></UFormField>
                <UFormField class="editor-field" label="计划下线版本"><UInput class="editor-control" :model-value="editingItem.retiredVersion ?? ''" placeholder="例如 26.0713.1" :disabled="isSaving(editingItem)" @update:model-value="setRetiredVersion" /></UFormField>
                <UFormField class="editor-field" label="自定义图标" hint="留空使用默认图标。"><div class="icon-upload"><div v-if="editingItem.iconUrl" class="icon-preview"><img :src="editingItem.iconUrl" alt="当前成就图标" /></div><UInput class="editor-control" type="url" :model-value="editingItem.iconUrl ?? ''" placeholder="https://cdn.example.com/icon.webp" maxlength="2048" :disabled="isSaving(editingItem)" @update:model-value="setIconUrl" /><details class="icon-upload-option"><summary>上传图标</summary><div class="icon-upload-content"><p>PNG、JPG 或 WebP，最大 512 KB。</p><UFileUpload v-model="iconFile" accept="image/png,image/jpeg,image/webp" :multiple="false" label="选择图标文件" :disabled="iconUploading || isSaving(editingItem)" /><UButton type="button" label="上传图标" color="neutral" variant="outline" :loading="iconUploading" :disabled="!iconFile || isSaving(editingItem)" @click="uploadIcon" /></div></details></div></UFormField>
                <UFormField class="editor-field" label="展示分类" :hint="`留空则使用 Bastion 系列“${editingItem.category}”`"><UInput class="editor-control" :model-value="editingItem.categoryOverride ?? ''" :disabled="isSaving(editingItem)" :placeholder="editingItem.category" maxlength="128" @update:model-value="setCategoryOverride" /></UFormField>
              </form>
            </template>
            <template #footer>
              <UButton class="min-h-7" label="取消" color="neutral" variant="outline" size="xs" :disabled="editingItem ? isSaving(editingItem) : false" @click="closeEditing" />
              <UButton class="min-h-7" label="保存规则" size="xs" form="achievement-editor" :loading="editingItem ? isSaving(editingItem) : false" type="submit" />
            </template>
          </UModal>
        </section>
        </template>

        <template #map>
        <section class="catalog-section" aria-labelledby="map-achievements-title">
          <div class="section-heading"><div><p class="eyebrow">地图挑战</p><h3 id="map-achievements-title">按地图管理</h3></div><span>{{ mapItems.length }} 项</span></div>
          <AdminDataTable v-model:column-filters="statusColumnFilters" :data="mapItems" :columns="mapColumns" :loading="loading" empty="暂无记录。" table-key="achievement-maps" class="admin-table achievement-table">
            <template #filters><USelect v-model="status" size="md" aria-label="筛选成就状态" :items="[{ label: '全部状态', value: 'all' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" /></template>
            <template #mapName-cell="{ row }"><span class="table-meta">{{ row.original.mapName }}</span></template>
            <template #name-cell="{ row }"><strong>{{ row.original.name }}</strong></template>
            <template #difficulty-cell="{ row }"><span>{{ row.original.difficulty ?? '地图通关' }}</span></template>
            <template #status-cell="{ row }"><StatusBadge :label="statusText(row.original.status)" :tone="statusTone(row.original.status)" /></template>
            <template #actions-cell="{ row }"><div class="table-actions"><template v-if="row.original.status !== 'retired'"><UPopover :open="planningId === row.original.challengeId" @update:open="(open) => { planningId = open ? row.original.challengeId : null; }"><button class="table-action" type="button" aria-label="计划下线" :disabled="isSaving(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><circle cx="16" cy="16" r="3" /><path d="M16 14.5v1.7l1.1.7" /></svg></button><template #content><UCard class="plan-popover-card"><form class="plan-popover" @submit.prevent="planSunsetting(row.original)"><UFormField label="计划下线版本" required><UInput v-model="retirementVersions[row.original.challengeId]" required placeholder="例如 26.0713.1" :disabled="isSaving(row.original)" /></UFormField><UButton type="submit" label="确认计划" :loading="isSaving(row.original)" :disabled="!retirementVersions[row.original.challengeId]?.trim()" /></form></UCard></template></UPopover><button class="table-action table-action-danger" type="button" aria-label="结束挑战" :disabled="isSaving(row.original)" @click="openEnd(row.original, $event.currentTarget)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 9h6v6H9z" /></svg></button></template><button v-else class="table-action" type="button" aria-label="重新开放" :disabled="isSaving(row.original)" @click="reopen(row.original)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg></button></div></template>
          </AdminDataTable>
        </section>
        </template>
      </UTabs>
    </section>

    <UModal :open="endTarget !== null" title="结束挑战" @update:open="(open) => { if (!open) closeEnd(); }"><template #body><form v-if="endTarget" class="end-dialog" @submit.prevent="endChallenge"><p>结束后不再接受新的截图提交。</p><div class="editor-actions"><UButton label="取消" color="neutral" variant="outline" :disabled="isSaving(endTarget)" @click="closeEnd" /><UButton label="结束挑战" color="error" type="submit" :loading="isSaving(endTarget)" /></div></form></template></UModal>
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
.table-actions { display: flex; align-items: center; justify-content: flex-start; gap: 4px; }
.table-action { display: inline-grid; width: 34px; height: 34px; place-items: center; padding: 0; border: 0; border-radius: 8px; color: var(--muted); background: transparent; cursor: pointer; }
.table-action:hover { color: var(--text); background: var(--surface-raised); }
.table-action:disabled { cursor: wait; opacity: .5; }
.table-action svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.table-action-danger { color: var(--error); }
.table-action-danger:hover { background: color-mix(in srgb, var(--error) 12%, transparent); }
.editor, .end-dialog, .plan-popover { display: grid; gap: 16px; }
.icon-upload { display: grid; gap: 10px; }
.icon-upload-option { border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; }
.icon-upload-option summary { padding-top: 10px; cursor: pointer; }
.icon-upload-content { display: grid; gap: 10px; padding-top: 10px; }
.icon-upload-content p { margin: 0; color: var(--quiet); font-size: .78rem; }
.icon-preview { display: grid; width: 64px; height: 64px; place-items: center; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); }
.icon-preview img { width: 42px; height: 42px; object-fit: contain; }
.editor { padding: 24px; gap: 20px; }
.editor-field, .editor-control { width: 100%; }
.editor :deep(textarea) { min-height: 104px; }
.editor-actions { display: flex; justify-content: flex-end; gap: 8px; }
.plan-popover-card { width: min(280px, calc(100vw - 32px)); }
.plan-popover :deep(.portal-button), .end-dialog :deep(.portal-button) { min-height: 28px; padding-inline: 8px; font-size: .76rem; }
.end-dialog p { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }
.portal-button { transition: transform 140ms ease, border-color 140ms ease, background 140ms ease; }
.portal-button:active { transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .portal-button { transition: opacity 140ms ease, border-color 140ms ease, background 140ms ease; }.portal-button:active { transform: none; } }
@media (max-width: 560px) { .catalog-heading, .section-heading { align-items: flex-start; flex-wrap: wrap; }.editor-actions { justify-content: stretch; }.editor-actions .portal-button { flex: 1; } }
</style>
