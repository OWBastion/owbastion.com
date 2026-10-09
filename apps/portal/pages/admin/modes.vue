<script setup lang="ts">
import type { Map } from "~/types/challenge";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "独立模式 · 躲避堡垒 3" });

type StandaloneMode = { mode: string; mapIds: string[]; eventPools: string[]; eventWeightTotal: number | null; createdAt: number; updatedAt: number };
type EventVersion = { gameVersion: string; mode: string | null; eventCount: number };

const api = useAdminApi();
const toast = useToast();
const modes = shallowRef<StandaloneMode[]>([]);
const maps = shallowRef<Map[]>([]);
const versions = shallowRef<EventVersion[]>([]);
const errorMessage = shallowRef("");
const saving = shallowRef(false);
const editorOpen = shallowRef(false);
const editing = shallowRef<StandaloneMode | null>(null);
const form = reactive({ mode: "", mapIds: [] as string[], eventPools: [] as string[], eventWeightTotal: "" });

const adminData = useAdminAsyncData("standalone-modes", async () => {
  const [modeResponse, mapResponse, versionResponse] = await Promise.all([
    api<{ items: StandaloneMode[] }>("/v1/standalone-modes"),
    api<{ items: Map[] }>("/v1/maps"),
    api<{ items: EventVersion[] }>("/v1/event-versions"),
  ]);
  return { modes: modeResponse.items, maps: mapResponse.items, versions: versionResponse.items };
}, {
  onStart: () => { errorMessage.value = ""; },
  onData: (response) => { modes.value = response.modes; maps.value = response.maps; versions.value = response.versions; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取独立模式。").description; },
});

const mapName = (mapId: string) => maps.value.find((map) => map.mapId === mapId)?.mapName ?? mapId;
const mapItems = computed(() => maps.value.map((map) => ({ label: map.mapName, value: map.mapId })));
// A pool already owned by another mode cannot be added here.
const poolItems = computed(() => versions.value
  .filter((version) => version.mode === null || version.mode === editing.value?.mode)
  .map((version) => ({ label: `${version.gameVersion}（${version.eventCount} 条事件）`, value: version.gameVersion })));

function openEditor(mode: StandaloneMode | null) {
  editing.value = mode;
  form.mode = mode?.mode ?? "";
  form.mapIds = [...(mode?.mapIds ?? [])];
  form.eventPools = [...(mode?.eventPools ?? [])];
  form.eventWeightTotal = mode?.eventWeightTotal === null || mode?.eventWeightTotal === undefined ? "" : String(mode.eventWeightTotal);
  editorOpen.value = true;
}

async function save() {
  const name = form.mode.trim();
  const total = form.eventWeightTotal.trim() === "" ? null : Number(form.eventWeightTotal);
  if (!name) { errorMessage.value = "请填写模式名。"; return; }
  if (total !== null && (!Number.isFinite(total) || total < 0)) { errorMessage.value = "事件总权重需为非负数。"; return; }
  saving.value = true;
  errorMessage.value = "";
  try {
    await api(`/v1/standalone-modes/${encodeURIComponent(name)}`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", mapIds: form.mapIds, eventPools: form.eventPools, eventWeightTotal: total } });
    editorOpen.value = false;
    toast.add({ title: `「${name}」已保存`, description: "地图版本、事件池和进度规则已同步更新。", color: "success" });
    await adminData.refresh();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存独立模式。").description;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AdminWorkspace title="独立模式" :count="adminData.loading.value ? '读取中…' : `${modes.length} 个`">
    <template #actions><UButton class="pressable" label="新建模式" icon="i-lucide-plus" @click="openEditor(null)" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <p class="text-sm text-muted">限时的独立模式（如 2026镜中回响）在这里一次配置：包含的地图、所属事件池和该模式构建的事件总权重。</p>
    <p v-if="!adminData.loading.value && !modes.length" class="text-sm text-muted">还没有独立模式。</p>

    <ul class="mode-list" aria-label="独立模式列表">
      <li v-for="mode in modes" :key="mode.mode" class="mode-card surface-card">
        <div class="mode-card__head">
          <strong>{{ mode.mode }}</strong>
          <UButton label="编辑" color="neutral" variant="outline" size="sm" :aria-label="`编辑 ${mode.mode}`" @click="openEditor(mode)" />
        </div>
        <p class="text-sm">{{ mode.mapIds.length }} 张地图：{{ mode.mapIds.map(mapName).join("、") || "无" }}</p>
        <p class="text-sm text-muted">事件池：{{ mode.eventPools.join("、") || "无" }} · 事件总权重：{{ mode.eventWeightTotal ?? "未填写（不校验对局码）" }}</p>
      </li>
    </ul>

    <AdminResponsiveDialog v-model:open="editorOpen" :title="editing ? `编辑 ${editing.mode}` : '新建独立模式'" size="md" :dismissible="!saving">
      <template #body>
        <form id="standalone-mode-form" class="grid gap-4" @submit.prevent="save">
          <UFormField label="模式名" required hint="与截图右上角方括号内一致，如 2026镜中回响。">
            <UInput v-model="form.mode" :disabled="saving || editing !== null" />
          </UFormField>
          <UFormField label="地图" hint="每张地图会自动获得该模式的镜像版本；移除的地图转为历史版本，已有记录保留。">
            <USelect v-model="form.mapIds" multiple :items="mapItems" :disabled="saving" placeholder="选择该模式包含的地图" />
          </UFormField>
          <UFormField label="事件池" hint="只属于该模式构建的事件池（如 2026周年），不计入常规候选池。">
            <USelect v-model="form.eventPools" multiple :items="poolItems" :disabled="saving" placeholder="选择事件池" />
          </UFormField>
          <UFormField label="事件总权重" hint="该模式构建里全部事件的权重合计，含返场和禁用（如 69.5）；留空则不校验该模式截图的对局码。">
            <UInput v-model="form.eventWeightTotal" inputmode="decimal" :disabled="saving" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton type="submit" form="standalone-mode-form" label="保存" :loading="saving" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="editorOpen = false" />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.mode-list { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.mode-card { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); }
.mode-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
</style>
