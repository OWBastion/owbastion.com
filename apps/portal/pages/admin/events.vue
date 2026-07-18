<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "事件管理 · 躲避堡垒 3" });

type Link = { family: "map" | "achievement"; challengeId: string };
type AdminChallenge = { challengeId: string; family: "map" | "achievement"; name?: string; titleName?: string };
type ImportPreview = { sourceHash: string; validRowCount: number; errors: Array<{ row: number; message: string }>; rows: Array<{ name: string; category: string; releaseStatus: string }> };

const api = useAdminApi();
const events = ref<RandomEvent[]>([]);
const challenges = ref<AdminChallenge[]>([]);
const selectedEventId = shallowRef<string | undefined>();
const query = shallowRef("");
const showArchived = shallowRef(false);
const editorOpen = shallowRef(false);
const importOpen = shallowRef(false);
const importFile = shallowRef<File | null>(null);
const importPreview = ref<ImportPreview | null>(null);
const loading = shallowRef(true);
const saving = shallowRef(false);
const importing = shallowRef(false);
const error = shallowRef("");
const message = shallowRef("");
const form = reactive({ name: "", category: "", rarity: "", description: "", durationSeconds: "", cooldownSeconds: "", weight: "", appearanceProbability: "", categoryProbability: "", groupTotalWeight: "", groupSize: "", failureProbability: "", guaranteeProbability: "", globalAppearanceProbability: "", gameVersion: "", effectTags: "", releaseStatus: "development" as RandomEvent["releaseStatus"], links: [] as Link[] });

const visibleEvents = computed(() => events.value.filter((event) => !query.value.trim() || `${event.name} ${event.category} ${event.rarity}`.includes(query.value.trim())));
const listItems = computed(() => visibleEvents.value.map((event) => ({ value: event.eventId, label: event.name, description: `${event.category} · ${event.rarity} · ${event.gameVersion} · ${event.releaseStatus === "implemented" ? "已实装" : event.releaseStatus === "removed" ? "已移除" : "开发中"}` })));
const selectedListItem = computed({ get: () => listItems.value.find((item) => item.value === selectedEventId.value), set: (item: { value: string } | undefined) => { selectedEventId.value = item?.value; } });
const selectedEvent = computed(() => events.value.find((event) => event.eventId === selectedEventId.value));
const selectedLinks = computed(() => new Set(form.links.map((link) => `${link.family}:${link.challengeId}`)));

function number(value: string) { return value === "" ? null : Number(value); }
function resetForm(event?: RandomEvent) {
  Object.assign(form, event ? { name: event.name, category: event.category, rarity: event.rarity, description: event.description, durationSeconds: event.durationSeconds ?? "", cooldownSeconds: event.cooldownSeconds ?? "", weight: event.weight ?? "", appearanceProbability: event.appearanceProbability ?? "", categoryProbability: event.categoryProbability ?? "", groupTotalWeight: event.groupTotalWeight ?? "", groupSize: event.groupSize ?? "", failureProbability: event.failureProbability ?? "", guaranteeProbability: event.guaranteeProbability ?? "", globalAppearanceProbability: event.globalAppearanceProbability ?? "", gameVersion: event.gameVersion, effectTags: event.effectTags.join("、"), releaseStatus: event.releaseStatus, links: event.challenges.map((challenge) => ({ family: challenge.family, challengeId: challenge.challengeId })) } : { name: "", category: "", rarity: "", description: "", durationSeconds: "", cooldownSeconds: "", weight: "", appearanceProbability: "", categoryProbability: "", groupTotalWeight: "", groupSize: "", failureProbability: "", guaranteeProbability: "", globalAppearanceProbability: "", gameVersion: "", effectTags: "", releaseStatus: "development", links: [] });
}
function openCreate() { selectedEventId.value = undefined; resetForm(); editorOpen.value = true; }
function openSelected() { if (!selectedEvent.value) return; resetForm(selectedEvent.value); editorOpen.value = true; }
function toggleLink(link: Link) { form.links = selectedLinks.value.has(`${link.family}:${link.challengeId}`) ? form.links.filter((item) => item.family !== link.family || item.challengeId !== link.challengeId) : [...form.links, link]; }
async function load() { loading.value = true; error.value = ""; try { const [eventResult, challengeResult] = await Promise.all([api<{ items: RandomEvent[] }>(`/v1/events?archived=${showArchived.value}`), api<{ items: AdminChallenge[] }>("/v1/achievements")]); events.value = eventResult.items; challenges.value = challengeResult.items.filter((item) => item.family === "map" || item.family === "achievement"); } catch (cause: any) { error.value = cause?.data?.error?.message ?? "无法读取事件目录。"; } finally { loading.value = false; } }
async function save() { saving.value = true; error.value = ""; const body = { contractVersion: "1" as const, name: form.name, category: form.category, rarity: form.rarity, description: form.description, durationSeconds: number(form.durationSeconds), cooldownSeconds: number(form.cooldownSeconds), weight: number(form.weight), appearanceProbability: number(form.appearanceProbability), categoryProbability: number(form.categoryProbability), groupTotalWeight: number(form.groupTotalWeight), groupSize: number(form.groupSize), failureProbability: number(form.failureProbability), guaranteeProbability: number(form.guaranteeProbability), globalAppearanceProbability: number(form.globalAppearanceProbability), gameVersion: form.gameVersion, effectTags: form.effectTags.split(/[、,]/).map((value) => value.trim()).filter(Boolean), releaseStatus: form.releaseStatus, challengeLinks: form.links }; try { if (selectedEvent.value) await api(`/v1/events/${encodeURIComponent(selectedEvent.value.eventId)}`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body }); else await api("/v1/events", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body }); editorOpen.value = false; message.value = "事件已保存"; await load(); } catch (cause: any) { error.value = cause?.data?.error?.message ?? "无法保存事件。"; } finally { saving.value = false; } }
async function archive() { if (!selectedEvent.value || !window.confirm(`归档“${selectedEvent.value.name}”？`)) return; await api(`/v1/events/${encodeURIComponent(selectedEvent.value.eventId)}`, { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } }); editorOpen.value = false; selectedEventId.value = undefined; await load(); }
async function previewImport() { if (!importFile.value) return; importing.value = true; error.value = ""; try { importPreview.value = await api<ImportPreview>("/v1/events/imports/preview", { method: "POST", body: { contractVersion: "1", fileName: importFile.value.name, csv: await importFile.value.text() } }); } catch (cause: any) { error.value = cause?.data?.error?.message ?? "无法预检文件。"; } finally { importing.value = false; } }
async function importEvents() { if (!importFile.value || !importPreview.value || importPreview.value.errors.length) return; importing.value = true; try { const result = await api<{ importedCount: number }>("/v1/events/imports", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", fileName: importFile.value.name, csv: await importFile.value.text() } }); importOpen.value = false; importPreview.value = null; importFile.value = null; message.value = `已导入 ${result.importedCount} 条事件`; await load(); } catch (cause: any) { error.value = cause?.data?.error?.message ?? "导入失败。"; } finally { importing.value = false; } }

watch(showArchived, () => void load());
watch(selectedEventId, () => { if (selectedEvent.value) resetForm(selectedEvent.value); });
onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="事件管理" :count="loading ? '读取中…' : `${events.length} 条`">
    <template #messages><UAlert v-if="error" color="error" variant="subtle" :description="error" /><UAlert v-if="message" color="primary" variant="subtle" :description="message" /></template>
    <div class="flex flex-wrap items-center gap-3">
      <UInput v-model="query" class="min-w-64 flex-1" placeholder="搜索名称、类别或稀有度" icon="i-lucide-search" />
      <UCheckbox v-model="showArchived" label="包含已归档" />
      <UButton label="新建事件" icon="i-lucide-plus" @click="openCreate" />
      <UButton label="导入 CSV" color="neutral" variant="outline" icon="i-lucide-upload" @click="importOpen = !importOpen" />
    </div>

    <UCollapsible v-model:open="importOpen" class="mt-3">
      <template #content>
        <UCard><template #header><div><p class="text-sm font-medium">导入 CSV</p><p class="text-sm text-muted">低频维护操作：先预检，再确认写入。</p></div></template><div class="grid gap-3"><UFileUpload v-model="importFile" accept=".csv,text/csv" label="选择飞书导出的 CSV" /><div class="flex gap-2"><UButton label="预检" color="neutral" variant="outline" :loading="importing" :disabled="!importFile" @click="previewImport" /><UButton v-if="importPreview && !importPreview.errors.length" label="确认导入" :loading="importing" @click="importEvents" /></div><UAlert v-if="importPreview?.errors.length" color="error" variant="subtle" :title="`发现 ${importPreview.errors.length} 个问题`" :description="importPreview.errors.map((item) => `第 ${item.row} 行：${item.message}`).join('；')" /><UAlert v-else-if="importPreview" color="success" variant="subtle" :description="`可导入 ${importPreview.validRowCount} 条事件。`" /></div></UCard>
      </template>
    </UCollapsible>

    <UCard class="mt-4"><UListbox v-model="selectedListItem" :items="listItems" :loading="loading" :virtualize="visibleEvents.length > 50" class="max-h-[calc(100dvh-19rem)] overflow-auto" /><UEmpty v-if="!loading && !listItems.length" title="暂无事件" description="可新建事件或导入 CSV。" variant="naked" /></UCard>

    <div v-if="selectedEvent" class="mt-3 flex justify-end"><UButton label="编辑所选事件" color="neutral" variant="outline" icon="i-lucide-pencil" @click="openSelected" /></div>

    <USlideover v-model:open="editorOpen" :title="selectedEvent ? `编辑：${selectedEvent.name}` : '新建事件'" :ui="{ content: 'sm:max-w-2xl' }"><template #body><form class="grid gap-4" @submit.prevent="save"><div class="grid gap-4 sm:grid-cols-2"><UFormField label="名称"><UInput v-model="form.name" required /></UFormField><UFormField label="类别"><UInput v-model="form.category" required /></UFormField><UFormField label="稀有度"><UInput v-model="form.rarity" required /></UFormField><UFormField label="版本"><UInput v-model="form.gameVersion" required /></UFormField><UFormField label="类别概率"><UInput v-model="form.categoryProbability" type="number" min="0" max="1" step="any" /></UFormField><UFormField label="内置冷却（秒）"><UInput v-model="form.cooldownSeconds" type="number" min="0" /></UFormField><UFormField label="持续时间（秒）"><UInput v-model="form.durationSeconds" type="number" min="0" /></UFormField><UFormField label="权重"><UInput v-model="form.weight" type="number" min="0" step="any" /></UFormField><UFormField label="组内总权重"><UInput v-model="form.groupTotalWeight" type="number" min="0" step="any" /></UFormField><UFormField label="组内个数"><UInput v-model="form.groupSize" type="number" min="0" /></UFormField><UFormField label="单次失败率"><UInput v-model="form.failureProbability" type="number" min="0" max="1" step="any" /></UFormField><UFormField label="保底触发率"><UInput v-model="form.guaranteeProbability" type="number" min="0" max="1" step="any" /></UFormField><UFormField label="最终出现概率"><UInput v-model="form.appearanceProbability" type="number" min="-1" max="1" step="any" /></UFormField><UFormField label="全局出现概率"><UInput v-model="form.globalAppearanceProbability" type="number" min="-1" max="1" step="any" /></UFormField></div><UFormField label="内容说明"><UTextarea v-model="form.description" required :rows="4" /></UFormField><UFormField label="效果标签"><UInput v-model="form.effectTags" placeholder="用顿号或逗号分隔" /></UFormField><UFormField label="事件状态"><USelect v-model="form.releaseStatus" :items="[{ label: '开发中', value: 'development' }, { label: '已实装', value: 'implemented' }, { label: '已移除', value: 'removed' }]" /></UFormField><UFormField label="关联挑战"><div class="grid gap-2"><UCheckbox v-for="challenge in challenges" :key="`${challenge.family}-${challenge.challengeId}`" :model-value="selectedLinks.has(`${challenge.family}:${challenge.challengeId}`)" :label="challenge.name ?? challenge.titleName" @update:model-value="toggleLink({ family: challenge.family, challengeId: challenge.challengeId })" /></div></UFormField><div class="flex justify-between"><UButton v-if="selectedEvent" label="归档" color="error" variant="ghost" type="button" @click="archive" /><span v-else /><UButton type="submit" :label="selectedEvent ? '保存事件' : '创建事件'" :loading="saving" /></div></form></template></USlideover>
  </AdminWorkspace>
</template>
