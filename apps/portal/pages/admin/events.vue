<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { createReusableTemplate, useMediaQuery } from "@vueuse/core";
import { getGroupedRowModel, type ColumnPinningState, type GroupingOptions, type GroupingState, type SortingState } from "@tanstack/vue-table";
import type { RandomEvent } from "~/types/random-event";
import { calculateEventProbabilities, formatProbability } from "~/utils/event-probabilities";
import { bodyFromEvent, type bodyFromForm } from "~/utils/event-editor";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "事件管理 · 躲避堡垒 3" });

type ImportPreview = { sourceHash: string; validRowCount: number; errors: Array<{ row: number; message: string }>; rows: Array<{ name: string; category: string; releaseStatus: string }> };
type EventVersion = { gameVersion: string; availability: "available" | "suspended"; eventCount: number };
type EventBody = ReturnType<typeof bodyFromForm>;
const NEW = "new";
const UNGROUPED = "";
const defaultEventSorting: SortingState = [
  { id: "gameVersion", desc: true },
  { id: "name", desc: false },
];

const api = useAdminApi();
const toast = useToast();
const events = ref<RandomEvent[]>([]);
const versions = ref<EventVersion[]>([]);
const query = shallowRef("");
const showArchived = shallowRef(false);
const sorting = shallowRef<SortingState>([...defaultEventSorting]);
const grouping = shallowRef<GroupingState>([]);
const columnPinning = shallowRef<ColumnPinningState>({ left: ["name"], right: [] });
const groupFilter = shallowRef<string[]>([]);
const selectedId = shallowRef<string | null>(null);
const pendingId = shallowRef<string | null>(null);
const dirty = shallowRef(false);
const dialogOpen = shallowRef(false);
const archiveOpen = shallowRef(false);
const importOpen = shallowRef(false);
const importFile = shallowRef<File | null>(null);
const importPreview = ref<ImportPreview | null>(null);
const saving = shallowRef(false);
const importing = shallowRef(false);
const versionSaving = shallowRef<string | null>(null);
const error = shallowRef("");
// The editor docks beside the table from the wide page breakpoint; below it the editor opens as a dialog.
const docked = useMediaQuery("(min-width: 64rem)");
const [DefineGroupChips, ReuseGroupChips] = createReusableTemplate();

const selectedEvent = computed(() => selectedId.value && selectedId.value !== NEW ? events.value.find((event) => event.eventId === selectedId.value) ?? null : null);
const editing = computed(() => selectedId.value === NEW || selectedEvent.value !== null);
const suspendedVersionCount = computed(() => versions.value.filter((version) => version.availability === "suspended").length);
const groupOptions = computed(() => {
  const counts = new Map<string, number>();
  for (const event of events.value) counts.set(event.eventGroup ?? UNGROUPED, (counts.get(event.eventGroup ?? UNGROUPED) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => Number(left === UNGROUPED) - Number(right === UNGROUPED) || left.localeCompare(right, "zh-CN"));
});
const visibleEvents = computed(() => groupFilter.value.length ? events.value.filter((event) => groupFilter.value.includes(event.eventGroup ?? UNGROUPED)) : events.value);
const pendingName = computed(() => events.value.find((event) => event.eventId === pendingId.value)?.name ?? "新事件");

const releaseStatusText = (status: RandomEvent["releaseStatus"]) => status === "implemented" ? "已实装" : status === "removed" ? "已移除" : "开发中";
const releaseStatusTone = (status: RandomEvent["releaseStatus"]) => status === "implemented" ? "success" : status === "removed" ? "default" : "warning";
const categoryColor = (category: string) => category === "减益" ? "error" : category === "增益" ? "success" : category === "机制" ? "info" : "neutral";
const probability = (event: RandomEvent) => calculateEventProbabilities(event, events.value);
const toggleGroup = (value: string) => { groupFilter.value = groupFilter.value.includes(value) ? groupFilter.value.filter((item) => item !== value) : [...groupFilter.value, value]; };

const eventSortingOptions = [
  { id: "name", label: "事件名称" },
  { id: "category", label: "事件类别" },
  { id: "eventGroup", label: "事件组" },
  { id: "rarity", label: "稀有度级别" },
  { id: "cooldownSeconds", label: "内置冷却" },
  { id: "durationSeconds", label: "持续时间" },
  { id: "weight", label: "权重" },
  { id: "gameVersion", label: "版本" },
  { id: "releaseStatus", label: "状态" },
];
const eventGroupingOptions = [
  { id: "eventGroup", label: "事件组" },
  { id: "category", label: "事件类别" },
  { id: "rarity", label: "稀有度级别" },
  { id: "gameVersion", label: "版本" },
  { id: "releaseStatus", label: "状态" },
];
const tableGroupingOptions: GroupingOptions = { groupedColumnMode: false, getGroupedRowModel: getGroupedRowModel() };
const groupLabel = (columnId: string, value: unknown) => columnId === "releaseStatus" ? releaseStatusText(value as RandomEvent["releaseStatus"]) : String(value || "未设置");
// Long text and tag columns live in the editor; they start hidden so the numeric columns stay comparable beside it.
const defaultHiddenColumns = ["description", "effectTags", "cooldownSeconds", "durationSeconds"];
const eventColumns: TableColumn<RandomEvent>[] = [
  { accessorKey: "name", header: "事件名称", size: 128, meta: { class: { th: "w-32", td: "!whitespace-nowrap" } } },
  { accessorKey: "eventGroup", header: "事件组", meta: { class: { th: "w-24", td: "!whitespace-nowrap" } } },
  { accessorKey: "category", header: "事件类别", meta: { class: { th: "w-20", td: "!whitespace-nowrap" } } },
  { accessorKey: "rarity", header: "稀有度级别", meta: { class: { th: "w-24", td: "!whitespace-nowrap" } } },
  { accessorKey: "weight", header: "权重", meta: { class: { th: "w-16", td: "!whitespace-nowrap" } } },
  { accessorKey: "appearanceProbability", header: "出现概率", meta: { class: { th: "w-28", td: "!whitespace-nowrap" } } },
  { accessorKey: "gameVersion", header: "版本", meta: { class: { th: "w-16", td: "!whitespace-nowrap" } } },
  { accessorKey: "releaseStatus", header: "状态", meta: { class: { th: "w-20", td: "!whitespace-nowrap" } } },
  { accessorKey: "description", header: "事件效果", meta: { class: { th: "w-80", td: "align-top" } } },
  { accessorKey: "cooldownSeconds", header: "内置冷却", meta: { class: { th: "w-20", td: "!whitespace-nowrap" } } },
  { accessorKey: "durationSeconds", header: "持续时间（秒）", meta: { class: { th: "w-28", td: "!whitespace-nowrap" } } },
  { accessorKey: "effectTags", header: "效果类型", meta: { class: { th: "w-44", td: "align-top" } } },
];
const mobileColumns = [
  { id: "name", priority: "primary" as const, order: 0 },
  { id: "category", priority: "primary" as const, order: 1 },
  { id: "releaseStatus", priority: "primary" as const, order: 2 },
  { id: "eventGroup", priority: "detail" as const, order: 3 },
  { id: "rarity", priority: "detail" as const, order: 4 },
  { id: "gameVersion", priority: "detail" as const, order: 5 },
  { id: "weight", priority: "detail" as const, order: 6 },
  { id: "appearanceProbability", priority: "detail" as const, order: 7 },
  { id: "description", priority: "hidden" as const, order: 8 },
  { id: "cooldownSeconds", priority: "hidden" as const, order: 9 },
  { id: "durationSeconds", priority: "hidden" as const, order: 10 },
  { id: "effectTags", priority: "hidden" as const, order: 11 },
];

const adminData = useAdminAsyncData("events", async () => {
  const [eventResult, versionResult] = await Promise.all([
    api<{ items: RandomEvent[] }>(`/v1/events?archived=${showArchived.value}`),
    api<{ items: EventVersion[] }>("/v1/event-versions"),
  ]);
  return { events: eventResult.items, versions: versionResult.items };
}, {
  cacheKey: computed(() => String(showArchived.value)),
  onStart: () => { error.value = ""; },
  onData: (response) => { events.value = response.events; versions.value = response.versions; },
  onError: (cause) => { error.value = portalErrorDetails(cause, "无法读取事件目录或版本状态。").description; },
});
const loading = adminData.loading;
async function reload() { error.value = ""; await adminData.refresh(); }

// Selection never drops unsaved typing: switching away asks first.
function select(id: string) {
  if (id === selectedId.value) return;
  if (dirty.value && docked.value) { pendingId.value = id; return; }
  selectedId.value = id;
  if (!docked.value) dialogOpen.value = true;
}
function discardAndSwitch() { selectedId.value = pendingId.value; pendingId.value = null; }
function closeEditor() { selectedId.value = null; pendingId.value = null; dialogOpen.value = false; }
const openCreate = () => select(NEW);

async function writeEvent(eventId: string | null, body: EventBody) {
  return eventId
    ? await api<RandomEvent>(`/v1/events/${encodeURIComponent(eventId)}`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body })
    : await api<RandomEvent>("/v1/events", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body });
}
async function save(body: EventBody) {
  const previous = selectedEvent.value;
  saving.value = true;
  error.value = "";
  try {
    const saved = await writeEvent(previous?.eventId ?? null, body);
    events.value = previous ? events.value.map((event) => event.eventId === saved.eventId ? saved : event) : [saved, ...events.value];
    selectedId.value = saved.eventId;
    if (!docked.value) dialogOpen.value = false;
    await reload();
    toast.add({
      title: previous ? `已保存「${saved.name}」` : `已创建「${saved.name}」`,
      color: "success",
      actions: [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => (previous ? restore(previous) : archiveEvent(saved.eventId, "已撤销创建")) }],
    });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法保存事件。").description;
  } finally {
    saving.value = false;
  }
}
async function restore(previous: RandomEvent) {
  try {
    const restored = await writeEvent(previous.eventId, bodyFromEvent(previous));
    events.value = events.value.map((event) => event.eventId === restored.eventId ? restored : event);
    await reload();
    toast.add({ title: `已撤销对「${restored.name}」的修改`, color: "success" });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法撤销修改。").description;
  }
}
async function archiveEvent(eventId: string, title: string) {
  saving.value = true;
  try {
    await api(`/v1/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { "Idempotency-Key": createRequestId() } });
    events.value = events.value.filter((event) => event.eventId !== eventId);
    if (selectedId.value === eventId) closeEditor();
    archiveOpen.value = false;
    await reload();
    toast.add({ title, color: "success" });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法归档事件。").description;
  } finally {
    saving.value = false;
  }
}

async function setVersionAvailability(version: EventVersion, availability: EventVersion["availability"], undo = true) {
  versionSaving.value = version.gameVersion;
  error.value = "";
  try {
    const updated = await api<EventVersion>(`/v1/event-versions/${encodeURIComponent(version.gameVersion)}/availability`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", availability } });
    versions.value = versions.value.map((item) => item.gameVersion === updated.gameVersion ? updated : item);
    await reload();
    toast.add({
      title: `${version.gameVersion} ${availability === "suspended" ? "已挂起" : "已恢复"}`,
      description: availability === "suspended" ? "下一次 Bastion 构建输入将移除该版本的事件。" : undefined,
      color: "success",
      actions: undo ? [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => setVersionAvailability(version, availability === "suspended" ? "available" : "suspended", false) }] : [],
    });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法更新事件版本状态。").description;
  } finally {
    versionSaving.value = null;
  }
}

async function previewImport() {
  if (!importFile.value) return;
  importing.value = true;
  error.value = "";
  try {
    importPreview.value = await api<ImportPreview>("/v1/events/imports/preview", { method: "POST", body: { contractVersion: "1", fileName: importFile.value.name, csv: await importFile.value.text() } });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法预检 CSV。").description;
  } finally {
    importing.value = false;
  }
}
async function importEvents() {
  if (!importFile.value || !importPreview.value || importPreview.value.errors.length) return;
  importing.value = true;
  try {
    const result = await api<{ importedCount: number }>("/v1/events/imports", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", fileName: importFile.value.name, csv: await importFile.value.text() } });
    importOpen.value = false;
    importFile.value = null;
    importPreview.value = null;
    await reload();
    toast.add({ title: `已导入 ${result.importedCount} 条事件`, color: "success" });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法导入 CSV。").description;
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <AdminWorkspace title="事件管理" :count="loading ? '读取中…' : `${events.length} 条`">
    <template #actions>
      <UPopover :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" color="neutral" :variant="suspendedVersionCount ? 'soft' : 'outline'" :aria-label="suspendedVersionCount ? `更多，${suspendedVersionCount} 个版本已挂起` : '更多'">
          <template v-if="suspendedVersionCount" #trailing><UBadge :label="`${suspendedVersionCount} 已挂起`" color="warning" variant="subtle" size="sm" /></template>
        </UButton>
        <template #content>
          <div class="events-more">
            <UCheckbox v-model="showArchived" label="包含已归档" />
            <AdminEventVersionSwitches :versions="versions" :saving="versionSaving" @toggle="setVersionAvailability" />
            <UButton label="导入 CSV" color="neutral" variant="outline" icon="i-lucide-upload" block @click="importOpen = !importOpen" />
          </div>
        </template>
      </UPopover>
      <UButton label="新建事件" icon="i-lucide-plus" @click="openCreate" />
    </template>
    <template #messages><UAlert v-if="error" color="error" variant="subtle" :description="error" /></template>
    <DefineGroupChips>
      <div v-if="groupOptions.length > 1" class="events-chips" role="group" aria-label="事件组">
        <FilterChip v-for="[value, count] in groupOptions" :key="value" :label="value || '未分组'" :count="count" :pressed="groupFilter.includes(value)" @toggle="toggleGroup(value)" />
      </div>
    </DefineGroupChips>
    <UCollapsible v-if="importOpen" v-model:open="importOpen">
      <template #content>
        <UCard>
          <template #header><div><p class="text-sm font-medium">导入 CSV</p><p class="text-sm text-muted">低频维护操作：先预检，再确认写入。</p></div></template>
          <div class="grid gap-3">
            <UFileUpload v-model="importFile" accept=".csv,text/csv" label="选择飞书导出的 CSV" />
            <div class="flex gap-2">
              <UButton label="预检" color="neutral" variant="outline" :loading="importing" :disabled="!importFile" @click="previewImport" />
              <UButton v-if="importPreview && !importPreview.errors.length" label="确认导入" :loading="importing" @click="importEvents" />
            </div>
            <UAlert v-if="importPreview?.errors.length" color="error" variant="subtle" :title="`发现 ${importPreview.errors.length} 个问题`" :description="importPreview.errors.map((item) => `第 ${item.row} 行：${item.message}`).join('；')" />
            <UAlert v-else-if="importPreview" color="success" variant="subtle" :description="`可导入 ${importPreview.validRowCount} 条事件。`" />
          </div>
        </UCard>
      </template>
    </UCollapsible>

    <div class="events-workspace">
      <section class="events-list" aria-label="事件目录">
        <!-- The virtualized event catalog needs a stable bounded scroll element, and the editor beside it needs both panes operable. -->
        <AdminDataTable
          v-model:global-filter="query" v-model:sorting="sorting" v-model:grouping="grouping" v-model:column-pinning="columnPinning"
          :data="visibleEvents" :columns="eventColumns" :mobile-columns="mobileColumns" :default-hidden-columns="defaultHiddenColumns"
          row-key="eventId" :loading="loading" :sorting-options="eventSortingOptions" :grouping-options="eventGroupingOptions" :default-sorting="defaultEventSorting"
          :table-grouping-options="tableGroupingOptions" sticky="header" scroll-height="clamp(14rem, calc(100dvh - 18rem), 42rem)" :virtualize="{ estimateSize: 65, overscan: 8 }"
          :active-row-key="selectedId" :mobile-row-action="(row: RandomEvent) => select(row.eventId)" empty="暂无事件记录。" table-key="events" table-min-width="40rem" class="admin-table"
          @row-select="(row: RandomEvent) => select(row.eventId)"
        >
          <template #filters>
            <UInput v-model="query" size="md" aria-label="搜索事件" placeholder="搜索名称、类别或稀有度" icon="i-lucide-search" />
            <ReuseGroupChips />
          </template>
          <template #mobile-primary><UInput v-model="query" class="w-full" size="md" aria-label="搜索事件" placeholder="搜索名称、类别或稀有度" icon="i-lucide-search" /><UButton label="新建事件" icon="i-lucide-plus" @click="openCreate" /></template>
          <template #mobile-secondary>
            <UCheckbox v-model="showArchived" label="包含已归档" />
            <ReuseGroupChips />
            <section class="grid gap-1" aria-label="版本可用性"><h3 class="px-2 text-sm font-medium">版本可用性<UBadge v-if="suspendedVersionCount" :label="`${suspendedVersionCount} 已挂起`" color="warning" variant="subtle" size="sm" class="ml-2" /></h3><AdminEventVersionSwitches :versions="versions" :saving="versionSaving" @toggle="setVersionAvailability" /></section>
            <UButton label="导入 CSV" color="neutral" variant="outline" icon="i-lucide-upload" @click="importOpen = !importOpen" />
          </template>
          <template #name-cell="{ row }">
            <div v-if="row.getIsGrouped()" class="flex items-center gap-2">
              <UButton class="hit-target-lg" size="sm" color="neutral" variant="ghost" square :icon="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" :aria-label="row.getIsExpanded() ? '收起分组' : '展开分组'" @click="row.toggleExpanded()" />
              <strong>{{ groupLabel(row.groupingColumnId ?? "", row.getValue(row.groupingColumnId ?? "")) }}</strong><span class="text-sm text-muted">{{ row.subRows.length }} 条</span>
            </div>
            <strong v-else class="block truncate" :title="row.original.name">{{ row.original.name }}</strong>
          </template>
          <template #eventGroup-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ row.original.eventGroup ?? "—" }}</span></template>
          <template #description-cell="{ row }"><span v-if="!row.getIsGrouped()" class="line-clamp-2 block" :title="row.original.description">{{ row.original.description }}</span></template>
          <template #category-cell="{ row }"><UBadge v-if="!row.getIsGrouped()" :label="row.original.category" :color="categoryColor(row.original.category)" variant="subtle" /></template>
          <template #rarity-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ row.original.rarity || "—" }}</span></template>
          <template #cooldownSeconds-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ row.original.cooldownSeconds ?? "—" }}</span></template>
          <template #durationSeconds-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ row.original.durationSeconds === null ? "—" : `${row.original.durationSeconds} 秒` }}</span></template>
          <template #weight-cell="{ row }"><span v-if="!row.getIsGrouped()" class="num">{{ row.original.weight ?? "—" }}</span></template>
          <template #appearanceProbability-cell="{ row }"><span v-if="!row.getIsGrouped()" class="num">{{ formatProbability(probability(row.original).appearanceProbability) }}</span></template>
          <template #effectTags-cell="{ row }"><div v-if="!row.getIsGrouped() && row.original.effectTags.length" class="flex flex-wrap gap-1"><UBadge v-for="tag in row.original.effectTags" :key="tag" :label="tag" color="neutral" variant="subtle" /></div><span v-else-if="!row.getIsGrouped()">—</span></template>
          <template #releaseStatus-cell="{ row }"><StatusBadge v-if="!row.getIsGrouped()" :label="releaseStatusText(row.original.releaseStatus)" :tone="releaseStatusTone(row.original.releaseStatus)" /></template>
        </AdminDataTable>
      </section>

      <aside v-if="docked" class="events-pane surface-card" aria-label="事件编辑">
        <template v-if="editing">
          <header class="events-pane__header">
            <h2 class="card-heading">{{ selectedEvent ? selectedEvent.name : "新建事件" }}</h2>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" square aria-label="关闭编辑" @click="closeEditor" />
          </header>
          <UAlert v-if="pendingId" color="warning" variant="subtle" title="有未保存的修改" :description="`切换到「${pendingName}」会放弃这些修改。`">
            <template #actions>
              <UButton label="放弃并切换" color="neutral" variant="outline" size="sm" @click="discardAndSwitch" />
              <UButton label="继续编辑" color="neutral" variant="ghost" size="sm" @click="pendingId = null" />
            </template>
          </UAlert>
          <AdminEventEditor v-model:dirty="dirty" :event="selectedEvent" :events="events" :saving="saving" @save="save" @archive="archiveOpen = true" />
        </template>
        <p v-else class="events-pane__empty text-sm text-muted">选择一个事件查看和编辑，或新建事件。</p>
      </aside>
    </div>

    <AdminResponsiveDialog v-if="!docked" v-model:open="dialogOpen" :title="selectedEvent ? `编辑：${selectedEvent.name}` : '新建事件'" size="lg" @update:open="(open: boolean) => { if (!open) closeEditor(); }">
      <template #body><AdminEventEditor v-model:dirty="dirty" :event="selectedEvent" :events="events" :saving="saving" @save="save" @archive="archiveOpen = true" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog v-model:open="archiveOpen" title="归档事件" :description="selectedEvent?.name" size="sm" :dismissible="!saving">
      <template #body><p class="text-sm text-muted">归档后，事件不会出现在默认目录中。</p></template>
      <template #footer><UButton label="确认归档" color="error" variant="soft" :loading="saving" @click="selectedEvent && archiveEvent(selectedEvent.eventId, '事件已归档')" /><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="archiveOpen = false" /></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.events-workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); align-items: start; }
.events-chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); grid-column: 1 / -1; }
.events-more { display: grid; gap: var(--space-3); width: 18rem; padding: var(--space-3); }
.events-pane { display: grid; gap: var(--space-4); min-width: 0; padding: var(--space-4); }
.events-pane__header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.events-pane__header h2 { margin: 0; min-width: 0; overflow-wrap: anywhere; }
@media (min-width: 64rem) {
  .events-workspace { grid-template-columns: minmax(0, 1fr) minmax(22rem, 28rem); }
  .events-pane { position: sticky; top: var(--space-4); max-height: calc(100dvh - var(--space-8)); overflow-y: auto; }
}
</style>
