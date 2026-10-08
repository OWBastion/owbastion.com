<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";
import type { EventSort } from "~/components/admin/AdminEventTable.vue";
import type { EventFieldValues } from "~/components/admin/AdminEventFields.vue";
import { applyDraft, draftToUpdates, stage, undoUpdates, type EventDraft, type EventPatch } from "~/utils/event-draft";
import { bodyFromForm, emptyEventForm } from "~/utils/event-editor";
import { calculatePoolProbabilities } from "~/utils/event-probabilities";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "事件管理 · 躲避堡垒 3" });

type ImportPreview = { sourceHash: string; validRowCount: number; errors: Array<{ row: number; message: string }>; rows: Array<{ name: string; category: string; releaseStatus: string }> };
type EventVersion = { gameVersion: string; availability: "available" | "suspended"; mode: string | null; eventCount: number };
type StatusFilter = RandomEvent["releaseStatus"] | "all";
const NO_GROUP = "__none";

const api = useAdminApi();
const toast = useToast();
const events = ref<RandomEvent[]>([]);
const versions = ref<EventVersion[]>([]);
const draft = shallowRef<EventDraft>(new Map());
const selected = shallowRef<string[]>([]);
const query = shallowRef("");
const status = shallowRef<StatusFilter>("implemented");
const groupFilter = shallowRef("all");
const versionFilter = shallowRef("all");
const showArchived = shallowRef(false);
const sort = shallowRef<EventSort>({ key: "gameVersion", dir: -1 });
const sheetId = shallowRef<string | null>(null);
const sheetOpen = shallowRef(false);
const creating = shallowRef(false);
const createValues = reactive<EventFieldValues>({ name: "", eventGroup: null, category: "", gameVersion: "", releaseStatus: "development", weight: null, durationSeconds: null, cooldownSeconds: null, description: "", effectTags: [] });
const saving = shallowRef(false);
const creatingNow = shallowRef(false);
const versionSaving = shallowRef<string | null>(null);
const importOpen = shallowRef(false);
const importFile = shallowRef<File | null>(null);
const importPreview = ref<ImportPreview | null>(null);
const importing = shallowRef(false);
const error = shallowRef("");

const suspended = computed(() => new Set(versions.value.filter((version) => version.availability === "suspended").map((version) => version.gameVersion)));
const effective = computed(() => applyDraft(events.value, draft.value));
const baseProbabilities = computed(() => calculatePoolProbabilities(events.value, suspended.value));
const nextProbabilities = computed(() => calculatePoolProbabilities(effective.value, suspended.value));
const pool = computed(() => effective.value.filter((event) => event.releaseStatus === "implemented" && !event.archived && !suspended.value.has(event.gameVersion)));
const poolWeight = computed(() => pool.value.reduce((total, event) => total + (event.weight ?? 0), 0));
const groups = computed(() => [...new Set(effective.value.map((event) => event.eventGroup).filter((group): group is string => Boolean(group)))].sort((left, right) => left.localeCompare(right, "zh-CN")));
const categories = computed(() => [...new Set(effective.value.map((event) => event.category))].sort());
const tags = computed(() => [...new Set(effective.value.flatMap((event) => event.effectTags))].sort());
const versionNames = computed(() => versions.value.map((version) => version.gameVersion));
const statusCount = (value: StatusFilter) => effective.value.filter((event) => value === "all" || event.releaseStatus === value).length;

const visible = computed(() => {
  const text = query.value.trim();
  const rows = effective.value.filter((event) => (status.value === "all" || event.releaseStatus === status.value)
    && (groupFilter.value === "all" || (groupFilter.value === NO_GROUP ? !event.eventGroup : event.eventGroup === groupFilter.value))
    && (versionFilter.value === "all" || event.gameVersion === versionFilter.value)
    && (!text || [event.name, event.eventGroup ?? "", event.description, ...event.effectTags].some((value) => value.includes(text))));
  const { key, dir } = sort.value;
  const probability = (event: RandomEvent) => nextProbabilities.value.get(event.eventId) ?? -1;
  const compare = (left: RandomEvent, right: RandomEvent) => key === "weight" ? (left.weight ?? -1) - (right.weight ?? -1)
    : key === "probability" ? probability(left) - probability(right)
      : key === "gameVersion" ? left.gameVersion.localeCompare(right.gameVersion, undefined, { numeric: true })
        : left.name.localeCompare(right.name, "zh-CN");
  return [...rows].sort((left, right) => compare(left, right) * dir || left.name.localeCompare(right.name, "zh-CN"));
});
const draftSummary = computed(() => {
  const movers = [...nextProbabilities.value].map(([id, next]) => ({ id, change: next - (baseProbabilities.value.get(id) ?? 0) })).filter((item) => Math.abs(item.change) > 1e-4)
    .sort((left, right) => Math.abs(right.change) - Math.abs(left.change)).slice(0, 2);
  return movers.length ? `概率变化最大：${movers.map((item) => `${effective.value.find((event) => event.eventId === item.id)?.name} ${item.change > 0 ? "+" : ""}${(item.change * 100).toFixed(2)}%`).join("，")}` : "";
});

const sheetEvent = computed(() => effective.value.find((event) => event.eventId === sheetId.value) ?? null);
const sheetValues = computed<EventFieldValues | null>(() => creating.value ? createValues : sheetEvent.value);
const sheetChanged = computed(() => Boolean(sheetId.value && draft.value.has(sheetId.value)));

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

// ---- the draft: every change is staged here and saved in one request ----
const stageOne = (eventId: string, patch: EventPatch) => {
  const event = events.value.find((item) => item.eventId === eventId);
  if (event) draft.value = stage(draft.value, event, patch);
};
const stageMany = (ids: string[], patch: EventPatch) => { for (const id of ids) stageOne(id, patch); };
function stageWeight(operation: "set" | "add" | "multiply", value: number) {
  for (const id of selected.value) {
    const current = effective.value.find((event) => event.eventId === id)?.weight ?? 0;
    const weight = operation === "set" ? value : operation === "add" ? current + value : current * value;
    stageOne(id, { weight: Math.max(0, Number(weight.toFixed(3))) });
  }
}
async function batch(updates: Array<Record<string, unknown>>) {
  const result = await api<{ items: RandomEvent[] }>("/v1/events/batch", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", updates } });
  const saved = new Map(result.items.map((event) => [event.eventId, event]));
  events.value = events.value.map((event) => saved.get(event.eventId) ?? event);
}
async function saveDraft() {
  const updates = draftToUpdates(draft.value);
  const undo = undoUpdates(events.value, draft.value);
  saving.value = true;
  error.value = "";
  try {
    await batch(updates);
    draft.value = new Map();
    toast.add({ title: `已保存 ${updates.length} 项修改`, color: "success", actions: [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => undoBatch(undo) }] });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法保存修改，草稿仍保留。").description;
  } finally {
    saving.value = false;
  }
}
async function undoBatch(updates: Array<Record<string, unknown>>) {
  try {
    await batch(updates);
    toast.add({ title: "已撤销", color: "success" });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法撤销修改。").description;
  }
}
const discardDraft = () => { draft.value = new Map(); };

// ---- the sheet: full details on demand ----
function openSheet(eventId: string) { creating.value = false; sheetId.value = eventId; sheetOpen.value = true; }
function openCreate() {
  Object.assign(createValues, { ...emptyEventForm(), eventGroup: null, gameVersion: versionNames.value[0] ?? "" });
  creating.value = true;
  sheetId.value = null;
  sheetOpen.value = true;
}
function patchSheet(patch: EventPatch) {
  if (creating.value) Object.assign(createValues, patch);
  else if (sheetId.value) stageOne(sheetId.value, patch);
}
function navigateSheet(delta: -1 | 1) {
  const index = visible.value.findIndex((event) => event.eventId === sheetId.value);
  const target = visible.value[index + delta];
  if (target) sheetId.value = target.eventId;
}
async function createEvent() {
  creatingNow.value = true;
  error.value = "";
  try {
    const saved = await api<RandomEvent>("/v1/events", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: bodyFromForm({ ...emptyEventForm(), ...createValues, eventGroup: createValues.eventGroup ?? "" }) });
    events.value = [saved, ...events.value];
    status.value = "all";
    sheetOpen.value = false;
    toast.add({ title: `已创建「${saved.name}」`, color: "success", actions: [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => archiveEvent(saved.eventId, "已撤销创建") }] });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法创建事件。").description;
  } finally {
    creatingNow.value = false;
  }
}
async function archiveEvent(eventId: string, title = "事件已归档") {
  try {
    await api(`/v1/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { "Idempotency-Key": createRequestId() } });
    events.value = events.value.filter((event) => event.eventId !== eventId);
    const next = new Map(draft.value); next.delete(eventId); draft.value = next;
    selected.value = selected.value.filter((id) => id !== eventId);
    if (sheetId.value === eventId) sheetOpen.value = false;
    toast.add({ title, color: "success" });
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法归档事件。").description;
  }
}

async function setVersionAvailability(version: EventVersion, availability: EventVersion["availability"], undo = true) {
  versionSaving.value = version.gameVersion;
  error.value = "";
  try {
    const updated = await api<EventVersion>(`/v1/event-versions/${encodeURIComponent(version.gameVersion)}/availability`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", availability } });
    versions.value = versions.value.map((item) => item.gameVersion === updated.gameVersion ? updated : item);
    toast.add({
      title: `${version.gameVersion} ${availability === "suspended" ? "已挂起" : "已恢复"}`,
      description: "只影响下一次 Bastion 同步、构建或发布。",
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

// Unsaved edits are never dropped silently.
onBeforeRouteLeave(() => draft.value.size === 0 || window.confirm("有未保存的修改，确定离开？"));
const warnBeforeUnload = (event: BeforeUnloadEvent) => { if (draft.value.size) event.preventDefault(); };
onMounted(() => window.addEventListener("beforeunload", warnBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", warnBeforeUnload));
</script>

<template>
  <AdminWorkspace title="事件管理" :count="loading ? '读取中…' : `${events.length} 条`">
    <template #actions>
      <UButton label="导入 CSV" color="neutral" variant="outline" @click="importOpen = !importOpen" />
      <UButton label="新建事件" icon="i-lucide-plus" @click="openCreate" />
    </template>
    <template #messages><UAlert v-if="error" color="error" variant="subtle" :description="error" /></template>

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

    <AdminEventPoolSummary :pool-size="pool.length" :pool-weight="poolWeight" :versions="versions" :saving="versionSaving" @toggle="setVersionAvailability" />

    <div class="events-toolbar">
      <UInput v-model="query" class="events-toolbar__search" size="md" aria-label="搜索事件" placeholder="搜索名称、事件组、效果" icon="i-lucide-search" />
      <div class="events-toolbar__status" role="group" aria-label="状态">
        <FilterChip v-for="[value, label] in ([['implemented', '已实装'], ['development', '开发中'], ['removed', '已移除'], ['all', '全部']] as const)" :key="value" :label="label" :count="statusCount(value)" :pressed="status === value" @toggle="status = value" />
      </div>
      <select v-model="groupFilter" class="native-field" aria-label="事件组">
        <option value="all">全部事件组</option>
        <option v-for="group in groups" :key="group" :value="group">{{ group }}</option>
        <option :value="NO_GROUP">未分组</option>
      </select>
      <select v-model="versionFilter" class="native-field" aria-label="版本">
        <option value="all">全部版本</option>
        <option v-for="version in versionNames" :key="version" :value="version">{{ version }}</option>
      </select>
      <FilterChip label="包含已归档" :pressed="showArchived" @toggle="showArchived = !showArchived" />
    </div>

    <AdminEventDraftBar :count="draft.size" :summary="draftSummary" :saving="saving" @save="saveDraft" @discard="discardDraft" />
    <AdminEventSelectionBar :count="selected.length" :versions="versionNames" :groups="groups" @patch="stageMany(selected, $event)" @weight="stageWeight" @clear="selected = []" />

    <div v-if="loading && !events.length" class="events-state" role="status" aria-label="读取中…"><USkeleton v-for="row in 6" :key="row" class="events-state__row" /></div>
    <p v-else-if="!visible.length" class="events-state events-state--empty">没有符合条件的事件</p>
    <AdminEventTable v-else v-model:selected="selected" v-model:sort="sort" :events="visible" :draft="draft" :base="baseProbabilities" :next="nextProbabilities" :suspended="suspended" :groups="groups" :versions="versionNames" @stage="stageOne" @open="openSheet" />

    <AdminEventSheet
      v-model:open="sheetOpen" :mode="creating ? 'create' : 'edit'" :name="sheetEvent?.name ?? ''" :values="sheetValues"
      :probability="sheetId ? nextProbabilities.get(sheetId) ?? null : null" :saved-probability="sheetId ? baseProbabilities.get(sheetId) ?? null : null" :changed="sheetChanged"
      :groups="groups" :categories="categories" :versions="versionNames" :tags="tags" :creating="creatingNow"
      @patch="patchSheet" @create="createEvent" @archive="sheetId && archiveEvent(sheetId)" @navigate="navigateSheet"
    />
  </AdminWorkspace>
</template>

<style scoped>
.events-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.events-toolbar__search { flex: 1 1 14rem; min-width: 10rem; }
.events-toolbar__status { display: flex; flex-wrap: wrap; gap: var(--space-2); }
@media (max-width: 47.99rem) {
  .events-toolbar__status { flex-wrap: nowrap; max-width: 100%; overflow-x: auto; }
}
.events-state { display: grid; gap: var(--space-2); }
.events-state__row { height: 2.75rem; border-radius: var(--radius-control); }
.events-state--empty { padding: var(--space-8); border: 1px solid var(--line); border-radius: var(--radius-card); color: var(--muted); text-align: center; }
</style>
