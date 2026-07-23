<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { getGroupedRowModel, type ColumnPinningState, type GroupingOptions, type GroupingState, type SortingState } from "@tanstack/vue-table";
import type { RandomEvent } from "~/types/random-event";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "事件管理 · 躲避堡垒 3" });

type Link = { family: "map" | "achievement"; challengeId: string };
type ImportPreview = { sourceHash: string; validRowCount: number; errors: Array<{ row: number; message: string }>; rows: Array<{ name: string; category: string; releaseStatus: string }> };
const defaultEventSorting: SortingState = [
  { id: "gameVersion", desc: true },
  { id: "name", desc: false },
];

const api = useAdminApi();
const events = ref<RandomEvent[]>([]);
const selectedEvent = shallowRef<RandomEvent | null>(null);
const query = shallowRef("");
const showArchived = shallowRef(false);
const sorting = shallowRef<SortingState>([...defaultEventSorting]);
const grouping = shallowRef<GroupingState>([]);
const columnPinning = shallowRef<ColumnPinningState>({ left: ["name"], right: ["actions"] });
const editorOpen = shallowRef(false);
const probabilityOpen = shallowRef(false);
const importOpen = shallowRef(false);
const importFile = shallowRef<File | null>(null);
const importPreview = ref<ImportPreview | null>(null);
const loading = shallowRef(true);
const toast = useToast();
const saving = shallowRef(false);
const importing = shallowRef(false);
const error = shallowRef("");
const form = reactive({ name: "", category: "", rarity: "", description: "", durationSeconds: null as number | null, cooldownSeconds: null as number | null, weight: null as number | null, appearanceProbability: null as number | null, categoryProbability: null as number | null, groupTotalWeight: null as number | null, groupSize: null as number | null, failureProbability: null as number | null, guaranteeProbability: null as number | null, globalAppearanceProbability: null as number | null, gameVersion: "", effectTags: [] as string[], releaseStatus: "development" as RandomEvent["releaseStatus"], links: [] as Link[] });

const releaseStatusText = (status: RandomEvent["releaseStatus"]) => status === "implemented" ? "已实装" : status === "removed" ? "已移除" : "开发中";
const releaseStatusTone = (status: RandomEvent["releaseStatus"]) => status === "implemented" ? "success" : status === "removed" ? "default" : "warning";
const categoryColor = (category: string) => category === "减益" ? "error" : category === "增益" ? "success" : category === "机制" ? "info" : "neutral";
const probabilityText = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value * 100)}%`;
const challengeLabel = (challenge: RandomEvent["challenges"][number]) => challenge.family === "map" ? challenge.name : challenge.titleName;
const eventSortingOptions = [
  { id: "name", label: "事件名称" },
  { id: "category", label: "事件类别" },
  { id: "rarity", label: "稀有度级别" },
  { id: "cooldownSeconds", label: "内置冷却" },
  { id: "durationSeconds", label: "持续时间" },
  { id: "weight", label: "权重" },
  { id: "appearanceProbability", label: "最终出现概率" },
  { id: "gameVersion", label: "版本" },
  { id: "releaseStatus", label: "状态" },
];
const eventGroupingOptions = [
  { id: "category", label: "事件类别" },
  { id: "rarity", label: "稀有度级别" },
  { id: "gameVersion", label: "版本" },
  { id: "releaseStatus", label: "状态" },
];
const tableGroupingOptions: GroupingOptions = {
  groupedColumnMode: false,
  getGroupedRowModel: getGroupedRowModel(),
};
const groupLabel = (columnId: string, value: unknown) => columnId === "releaseStatus" ? releaseStatusText(value as RandomEvent["releaseStatus"]) : String(value ?? "未设置");
const eventColumns: TableColumn<RandomEvent>[] = [
  { accessorKey: "name", header: "事件名称", size: 128, meta: { class: { th: "w-32", td: "!whitespace-nowrap" } } },
  { accessorKey: "description", header: "事件效果", meta: { class: { th: "w-80", td: "align-top" } } },
  { accessorKey: "category", header: "事件类别", meta: { class: { th: "w-20", td: "!whitespace-nowrap" } } },
  { accessorKey: "rarity", header: "稀有度级别", meta: { class: { th: "w-24", td: "!whitespace-nowrap" } } },
  { accessorKey: "cooldownSeconds", header: "内置冷却", meta: { class: { th: "w-20", td: "!whitespace-nowrap" } } },
  { accessorKey: "durationSeconds", header: "持续时间（秒）", meta: { class: { th: "w-28", td: "!whitespace-nowrap" } } },
  { accessorKey: "weight", header: "权重", meta: { class: { th: "w-16", td: "!whitespace-nowrap" } } },
  { accessorKey: "appearanceProbability", header: "最终出现概率", meta: { class: { th: "w-28", td: "!whitespace-nowrap" } } },
  { accessorKey: "gameVersion", header: "版本", meta: { class: { th: "w-16", td: "!whitespace-nowrap" } } },
  { accessorKey: "effectTags", header: "效果类型", meta: { class: { th: "w-44", td: "align-top" } } },
  { accessorKey: "releaseStatus", header: "状态", meta: { class: { th: "w-20", td: "!whitespace-nowrap" } } },
  { id: "actions", header: "操作", size: 80, enableHiding: false },
];

function number(value: number | string | null | undefined) { return value === "" || value === null || value === undefined ? null : Number(value); }
function resetForm(event?: RandomEvent) {
  Object.assign(form, event ? { name: event.name, category: event.category, rarity: event.rarity, description: event.description, durationSeconds: event.durationSeconds, cooldownSeconds: event.cooldownSeconds, weight: event.weight, appearanceProbability: event.appearanceProbability, categoryProbability: event.categoryProbability, groupTotalWeight: event.groupTotalWeight, groupSize: event.groupSize, failureProbability: event.failureProbability, guaranteeProbability: event.guaranteeProbability, globalAppearanceProbability: event.globalAppearanceProbability, gameVersion: event.gameVersion, effectTags: [...event.effectTags], releaseStatus: event.releaseStatus, links: event.challenges.map((challenge) => ({ family: challenge.family, challengeId: challenge.challengeId })) } : { name: "", category: "", rarity: "", description: "", durationSeconds: null, cooldownSeconds: null, weight: null, appearanceProbability: null, categoryProbability: null, groupTotalWeight: null, groupSize: null, failureProbability: null, guaranteeProbability: null, globalAppearanceProbability: null, gameVersion: "", effectTags: [], releaseStatus: "development", links: [] });
}
function openCreate() { selectedEvent.value = null; resetForm(); probabilityOpen.value = false; editorOpen.value = true; }
function openEvent(event: RandomEvent) { selectedEvent.value = event; resetForm(event); probabilityOpen.value = false; editorOpen.value = true; }
async function load() { loading.value = true; error.value = ""; try { const eventResult = await api<{ items: RandomEvent[] }>(`/v1/events?archived=${showArchived.value}`); events.value = eventResult.items; } catch (cause) { error.value = portalErrorDetails(cause, "无法读取事件目录。").description; } finally { loading.value = false; } }
async function save() { saving.value = true; error.value = ""; const body = { contractVersion: "1" as const, name: form.name, category: form.category, rarity: form.rarity, description: form.description, durationSeconds: number(form.durationSeconds), cooldownSeconds: number(form.cooldownSeconds), weight: number(form.weight), appearanceProbability: number(form.appearanceProbability), categoryProbability: number(form.categoryProbability), groupTotalWeight: number(form.groupTotalWeight), groupSize: number(form.groupSize), failureProbability: number(form.failureProbability), guaranteeProbability: number(form.guaranteeProbability), globalAppearanceProbability: number(form.globalAppearanceProbability), gameVersion: form.gameVersion, effectTags: form.effectTags.map((value) => value.trim()).filter(Boolean), releaseStatus: form.releaseStatus, challengeLinks: form.links }; try { if (selectedEvent.value) await api(`/v1/events/${encodeURIComponent(selectedEvent.value.eventId)}`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body }); else await api("/v1/events", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body }); editorOpen.value = false; toast.add({ title: "事件已保存", color: "success" }); await load(); } catch (cause) { error.value = portalErrorDetails(cause, "无法保存事件。").description; } finally { saving.value = false; } }
async function archive() { if (!selectedEvent.value || !window.confirm(`归档“${selectedEvent.value.name}”？`)) return; try { await api(`/v1/events/${encodeURIComponent(selectedEvent.value.eventId)}`, { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } }); editorOpen.value = false; selectedEvent.value = null; toast.add({ title: "事件已归档", color: "success" }); await load(); } catch (cause) { error.value = portalErrorDetails(cause, "无法归档事件。").description; } }
async function previewImport() { if (!importFile.value) return; importing.value = true; error.value = ""; try { importPreview.value = await api<ImportPreview>("/v1/events/imports/preview", { method: "POST", body: { contractVersion: "1", fileName: importFile.value.name, csv: await importFile.value.text() } }); } catch (cause) { error.value = portalErrorDetails(cause, "无法预检文件。").description; } finally { importing.value = false; } }
async function importEvents() { if (!importFile.value || !importPreview.value || importPreview.value.errors.length) return; importing.value = true; try { const result = await api<{ importedCount: number }>("/v1/events/imports", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", fileName: importFile.value.name, csv: await importFile.value.text() } }); importOpen.value = false; importPreview.value = null; importFile.value = null; toast.add({ title: `已导入 ${result.importedCount} 条事件`, color: "success" }); await load(); } catch (cause) { error.value = portalErrorDetails(cause, "导入失败。").description; } finally { importing.value = false; } }

watch(showArchived, () => void load());
onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="事件管理" :count="loading ? '读取中…' : `${events.length} 条`">
    <template #messages><UAlert v-if="error" color="error" variant="subtle" :description="error" /></template>
    <UCollapsible v-if="importOpen" v-model:open="importOpen">
      <template #content>
        <UCard><template #header><div><p class="text-sm font-medium">导入 CSV</p><p class="text-sm text-muted">低频维护操作：先预检，再确认写入。</p></div></template><div class="grid gap-3"><UFileUpload v-model="importFile" accept=".csv,text/csv" label="选择飞书导出的 CSV" /><div class="flex gap-2"><UButton label="预检" color="neutral" variant="outline" :loading="importing" :disabled="!importFile" @click="previewImport" /><UButton v-if="importPreview && !importPreview.errors.length" label="确认导入" :loading="importing" @click="importEvents" /></div><UAlert v-if="importPreview?.errors.length" color="error" variant="subtle" :title="`发现 ${importPreview.errors.length} 个问题`" :description="importPreview.errors.map((item) => `第 ${item.row} 行：${item.message}`).join('；')" /><UAlert v-else-if="importPreview" color="success" variant="subtle" :description="`可导入 ${importPreview.validRowCount} 条事件。`" /></div></UCard>
      </template>
    </UCollapsible>

    <section aria-label="事件目录">
      <AdminDataTable v-model:global-filter="query" v-model:sorting="sorting" v-model:grouping="grouping" v-model:column-pinning="columnPinning" :data="events" :columns="eventColumns" :loading="loading" :sorting-options="eventSortingOptions" :grouping-options="eventGroupingOptions" :default-sorting="defaultEventSorting" :table-grouping-options="tableGroupingOptions" sticky="header" :virtualize="{ estimateSize: 65, overscan: 8 }" empty="暂无事件记录。" table-key="events" table-min-width="1180px" class="admin-table">
        <template #filters><div class="flex flex-1 flex-wrap items-center gap-2"><UInput v-model="query" class="min-w-56 flex-1" size="md" aria-label="搜索事件" placeholder="搜索名称、类别或稀有度" icon="i-lucide-search" /><UCheckbox v-model="showArchived" label="包含已归档" /><UButton label="新建事件" icon="i-lucide-plus" @click="openCreate" /><UButton label="导入 CSV" color="neutral" variant="outline" icon="i-lucide-upload" @click="importOpen = !importOpen" /></div></template>
        <template #name-cell="{ row }"><div v-if="row.getIsGrouped()" class="flex items-center gap-2"><UButton size="xs" color="neutral" variant="ghost" :icon="row.getIsExpanded() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" :aria-label="row.getIsExpanded() ? '收起分组' : '展开分组'" @click="row.toggleExpanded()" /><strong>{{ groupLabel(row.groupingColumnId ?? "", row.getValue(row.groupingColumnId ?? "")) }}</strong><span class="text-sm text-muted">{{ row.subRows.length }} 条</span></div><strong v-else class="block truncate" :title="row.original.name">{{ row.original.name }}</strong></template>
        <template #description-cell="{ row }"><span v-if="!row.getIsGrouped()" class="line-clamp-2 block" :title="row.original.description">{{ row.original.description }}</span></template>
        <template #category-cell="{ row }"><UBadge v-if="!row.getIsGrouped()" :label="row.original.category" :color="categoryColor(row.original.category)" variant="subtle" /></template>
        <template #cooldownSeconds-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ row.original.cooldownSeconds ?? "—" }}</span></template>
        <template #durationSeconds-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ row.original.durationSeconds === null ? "—" : `${row.original.durationSeconds} 秒` }}</span></template>
        <template #weight-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ row.original.weight ?? "—" }}</span></template>
        <template #appearanceProbability-cell="{ row }"><span v-if="!row.getIsGrouped()">{{ probabilityText(row.original.appearanceProbability) }}</span></template>
        <template #effectTags-cell="{ row }"><div v-if="!row.getIsGrouped() && row.original.effectTags.length" class="flex flex-wrap gap-1"><UBadge v-for="tag in row.original.effectTags" :key="tag" :label="tag" color="neutral" variant="subtle" /></div><span v-else-if="!row.getIsGrouped()">—</span></template>
        <template #releaseStatus-cell="{ row }"><StatusBadge v-if="!row.getIsGrouped()" :label="releaseStatusText(row.original.releaseStatus)" :tone="releaseStatusTone(row.original.releaseStatus)" /></template>
        <template #actions-cell="{ row }"><UButton v-if="!row.getIsGrouped()" label="编辑" color="neutral" variant="link" @click="openEvent(row.original)" /></template>
      </AdminDataTable>
    </section>

    <USlideover v-model:open="editorOpen" :title="selectedEvent ? `编辑：${selectedEvent.name}` : '新建事件'" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <form class="grid gap-6" @submit.prevent="save">
          <section class="grid gap-4">
            <h3 class="text-base font-semibold">基本信息</h3>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="名称"><UInput v-model="form.name" required /></UFormField>
              <UFormField label="类别"><UInput v-model="form.category" required /></UFormField>
              <UFormField label="稀有度"><UInput v-model="form.rarity" required /></UFormField>
              <UFormField label="版本"><UInput v-model="form.gameVersion" required /></UFormField>
              <UFormField label="类别概率"><UInputNumber v-model="form.categoryProbability" :min="0" :max="1" :step="0.01" class="w-full" /></UFormField>
              <UFormField label="权重"><UInputNumber v-model="form.weight" :min="0" class="w-full" /></UFormField>
              <UFormField label="内置冷却（秒）"><UInputNumber v-model="form.cooldownSeconds" :min="0" class="w-full" /></UFormField>
              <UFormField label="持续时间（秒）"><UInputNumber v-model="form.durationSeconds" :min="0" class="w-full" /></UFormField>
            </div>
            <UFormField label="内容说明"><UTextarea v-model="form.description" required :rows="4" /></UFormField>
          </section>

          <section class="grid gap-4">
            <h3 class="text-base font-semibold">概率信息</h3>
            <UFormField label="最终出现概率"><UInput v-model="form.appearanceProbability" readonly /></UFormField>
            <UCollapsible v-model:open="probabilityOpen" class="grid gap-3">
              <UButton type="button" label="展开更多概率字段" color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down" class="justify-start px-0" />
              <template #content>
                <div class="grid gap-4 border-l border-default pl-4 sm:grid-cols-2">
                  <UFormField label="组内总权重"><UInput v-model="form.groupTotalWeight" readonly /></UFormField>
                  <UFormField label="组内个数"><UInput v-model="form.groupSize" readonly /></UFormField>
                  <UFormField label="单次失败率"><UInput v-model="form.failureProbability" readonly /></UFormField>
                  <UFormField label="保底触发率"><UInput v-model="form.guaranteeProbability" readonly /></UFormField>
                  <UFormField label="全局出现概率"><UInput v-model="form.globalAppearanceProbability" readonly /></UFormField>
                </div>
              </template>
            </UCollapsible>
          </section>

          <section class="grid gap-4">
            <UFormField label="效果标签"><UInputTags v-model="form.effectTags" placeholder="输入效果标签" :disabled="saving" aria-label="效果标签" /></UFormField>
            <UFormField label="事件状态"><USelect v-model="form.releaseStatus" :items="[{ label: '开发中', value: 'development' }, { label: '已实装', value: 'implemented' }, { label: '已移除', value: 'removed' }]" /></UFormField>
            <UFormField label="关联挑战">
              <div v-if="selectedEvent?.challenges.length" class="grid gap-2">
                <div v-for="challenge in selectedEvent.challenges" :key="`${challenge.family}-${challenge.challengeId}`" class="rounded-md border border-default px-3 py-2 text-sm">
                  {{ challengeLabel(challenge) }}
                </div>
              </div>
              <p v-else class="text-sm text-muted">暂无关联挑战</p>
            </UFormField>
          </section>

          <div class="flex justify-between"><UButton v-if="selectedEvent" label="归档" color="error" variant="ghost" type="button" @click="archive" /><span v-else /><UButton type="submit" :label="selectedEvent ? '保存事件' : '创建事件'" :loading="saving" /></div>
        </form>
      </template>
    </USlideover>
  </AdminWorkspace>
</template>
