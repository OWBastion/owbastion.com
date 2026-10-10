<script setup lang="ts">
import type { AdminMapEditorRevision, AdminMapRevisionLifecycle, AdminMapRevisionReplacementLifecycle } from "~/composables/useAdminMapEditor";
import { useAdminMapEditor } from "~/composables/useAdminMapEditor";
import type { NewRevisionInput } from "~/components/admin/AdminMapNewRevisionDialog.vue";
import { groupHonors, recommendedAssignments, type MapAssignments } from "~/utils/map-honors";
import { spatialProblems } from "~/utils/map-readiness";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });

type Draft = {
  spatialConfig: SpatialConfigValue | null;
  assignments: MapAssignments;
  gameVersion: string;
  mapVariant: "classic" | null;
  lifecycle: AdminMapRevisionLifecycle;
};

const route = useRoute();
const mapId = String(route.params.mapId ?? "");
const api = useAdminMapEditor(mapId);
const toast = useToast();
const selectedRevisionId = shallowRef("");
const actionError = shallowRef("");
const drafts = shallowRef<Record<string, Draft>>({});
const spatialValid = shallowRef(true);
const metadataSaving = shallowRef(false);
const metadataOpen = shallowRef(false);
const auditOpen = shallowRef(false);
const newOpen = shallowRef(false);
const promoteOpen = shallowRef(false);

const map = computed(() => api.editor.value?.map ?? null);
const revisions = computed(() => api.editor.value?.revisions ?? []);
const catalog = computed(() => api.editor.value?.challengeCatalog ?? []);
const audit = computed(() => api.editor.value?.audit ?? []);
const selectedRevision = computed(() => revisions.value.find((revision) => revision.revisionId === selectedRevisionId.value) ?? null);
const defaultRevision = computed(() => revisions.value.find((revision) => revision.lifecycle === "default") ?? null);
const title = computed(() => map.value ? `${map.value.mapName} · 地图编辑器` : "地图编辑器");
const revisionName = (revision: AdminMapEditorRevision | null) => revision ? revision.mode ?? (revision.mapVariant === "classic" ? "经典版" : "标准版") : "";

const savedDraft = (revision: AdminMapEditorRevision): Draft => ({
  spatialConfig: revision.spatialConfig,
  assignments: Object.fromEntries(revision.challengeAssignments.map((assignment) => [`${assignment.challengeFamily}:${assignment.challengeId}`, {
    challengeFamily: assignment.challengeFamily,
    challengeId: assignment.challengeId,
    enabled: assignment.enabled,
    condition: assignment.condition,
    evidenceRule: assignment.evidenceRule,
    submissionMode: assignment.submissionMode,
    slot: assignment.slot,
  }])),
  gameVersion: revision.gameVersion,
  mapVariant: revision.mapVariant,
  lifecycle: revision.lifecycle,
});
const enabledAssignments = (assignments: MapAssignments) => Object.values(assignments).filter((assignment) => assignment.enabled);
const isDirty = (revision: AdminMapEditorRevision) => {
  const draft = drafts.value[revision.revisionId];
  if (!draft) return false;
  const saved = savedDraft(revision);
  return JSON.stringify({ ...draft, assignments: enabledAssignments(draft.assignments) }) !== JSON.stringify({ ...saved, assignments: enabledAssignments(saved.assignments) });
};

const draft = computed(() => selectedRevision.value ? drafts.value[selectedRevision.value.revisionId] ?? savedDraft(selectedRevision.value) : null);
const dirtyRevisionIds = computed(() => revisions.value.filter(isDirty).map((revision) => revision.revisionId));
const selectedDirty = computed(() => Boolean(selectedRevision.value && isDirty(selectedRevision.value)));
const problems = computed(() => !spatialValid.value ? ["点位代码有问题，见下方提示"] : draft.value ? spatialProblems(draft.value.spatialConfig) : []);
const assignedCount = computed(() => draft.value ? enabledAssignments(draft.value.assignments).length : 0);
const canSave = computed(() => selectedDirty.value && spatialValid.value && !api.saving.value);

function patchDraft(patch: Partial<Draft>) {
  const revision = selectedRevision.value;
  const current = draft.value;
  if (!revision || !current) return;
  drafts.value = { ...drafts.value, [revision.revisionId]: { ...current, ...patch } };
}
function discardDraft() {
  if (!selectedRevision.value) return;
  const { [selectedRevision.value.revisionId]: _discarded, ...rest } = drafts.value;
  drafts.value = rest;
  spatialValidKey.value += 1;
}
const spatialValidKey = shallowRef(0);

watch(revisions, (items) => {
  if (items.some((revision) => revision.revisionId === selectedRevisionId.value)) return;
  selectedRevisionId.value = items.find((revision) => revision.lifecycle === "default")?.revisionId ?? items[0]?.revisionId ?? "";
}, { immediate: true });

const lifecycleItems = computed(() => (selectedRevision.value?.lifecycle === "default"
  ? [{ value: "default", label: "正式" }]
  : [{ value: "preparing", label: "准备中" }, { value: "selectable", label: "可选" }, { value: "historical", label: "历史" }]));
const variantItems = [{ value: null, label: "标准版" }, { value: "classic", label: "经典版" }];

async function saveRevision() {
  const revision = selectedRevision.value;
  const current = draft.value;
  if (!revision || !current || !spatialValid.value) return false;
  actionError.value = "";
  try {
    await api.saveRevision(revision.revisionId, {
      contractVersion: "1",
      lifecycle: current.lifecycle,
      gameVersion: current.gameVersion.trim(),
      mapVariant: current.mapVariant,
      spatialConfig: current.spatialConfig,
      challengeAssignments: Object.values(current.assignments),
    });
    const { [revision.revisionId]: _saved, ...rest } = drafts.value;
    drafts.value = rest;
    toast.add({ title: "已保存", color: "success" });
    return true;
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法保存，请检查服务端返回的校验信息。").description;
    return false;
  }
}

async function saveMetadata(input: Parameters<typeof api.saveMetadata>[0]) {
  if (metadataSaving.value) return;
  metadataSaving.value = true;
  actionError.value = "";
  try {
    await api.saveMetadata(input);
    metadataOpen.value = false;
    toast.add({ title: "地图资料已保存", color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法保存地图资料，请稍后重试。").description;
  } finally {
    metadataSaving.value = false;
  }
}

async function createRevision(input: NewRevisionInput) {
  actionError.value = "";
  try {
    const revision = await api.createRevision({
      sourceRevisionId: input.kind === "rework" ? defaultRevision.value?.revisionId ?? null : null,
      resetReason: input.resetReason,
      gameVersion: input.gameVersion,
      mapVariant: input.kind === "classic" ? "classic" : null,
      copyConfiguration: input.kind === "rework",
    });
    selectedRevisionId.value = revision.revisionId;
    newOpen.value = false;
    if (input.kind !== "rework") {
      const created = api.editor.value?.revisions.find((item) => item.revisionId === revision.revisionId);
      if (created) {
        const base = savedDraft(created);
        drafts.value = { ...drafts.value, [created.revisionId]: { ...base, assignments: recommendedAssignments(base.assignments, groupHonors(catalog.value), created.mapVariant) } };
      }
    }
    toast.add({ title: "新修订已创建", description: "它从「准备中」开始，玩家进度没有被复制。", color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法创建修订，请稍后重试。").description;
  }
}

async function promote(replacedLifecycle: AdminMapRevisionReplacementLifecycle | null) {
  const revision = selectedRevision.value;
  if (!revision) return;
  actionError.value = "";
  if (selectedDirty.value && !(await saveRevision())) { promoteOpen.value = false; return; }
  try {
    await api.promoteRevision(revision.revisionId, replacedLifecycle);
    promoteOpen.value = false;
    toast.add({ title: `「${revisionName(revision)}」已是正式版`, color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法设为正式版，请检查点位和关联。").description;
  }
}

useSeoMeta({ title: "地图编辑器 · 躲避堡垒 3" });
</script>

<template>
  <AdminWorkspace :title="title" :count="api.loading.value ? '读取中…' : ''">
    <template #actions>
      <UButton to="/admin/maps" label="返回" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
      <UButton v-if="map" label="地图资料" icon="i-lucide-sliders-horizontal" color="neutral" variant="ghost" @click="metadataOpen = true" />
      <UButton v-if="map" label="修改记录" icon="i-lucide-history" color="neutral" variant="ghost" @click="auditOpen = true" />
    </template>
    <template #messages>
      <UAlert v-if="api.error.value || actionError" color="error" variant="subtle" :description="api.error.value || actionError" />
    </template>

    <div v-if="map && selectedRevision && draft" class="map-editor">
      <AdminMapRevisionStrip :revisions="revisions" :selected-revision-id="selectedRevisionId" :dirty-revision-ids="dirtyRevisionIds" :disabled="api.saving.value" @select="selectedRevisionId = $event" @create="newOpen = true" />
      <AdminMapReadiness :problems="problems" :assigned-count="assignedCount" :is-default="selectedRevision.lifecycle === 'default'" :can-promote="['preparing', 'selectable'].includes(selectedRevision.lifecycle)" :disabled="api.saving.value" @promote="promoteOpen = true" />

      <section class="map-card" aria-labelledby="map-spatial-title">
        <h2 id="map-spatial-title" class="type-headline"><span class="map-card__step">1</span>点位</h2>
        <AdminSpatialConfigInput
          :key="`${selectedRevision.revisionId}:${spatialValidKey}`"
          :model-value="draft.spatialConfig"
          :revision-key="selectedRevision.revisionId"
          :disabled="api.saving.value"
          @update:model-value="patchDraft({ spatialConfig: $event })"
          @valid="spatialValid = $event"
        />
      </section>

      <section class="map-card" aria-labelledby="map-honors-title">
        <h2 id="map-honors-title" class="type-headline"><span class="map-card__step">2</span>成就与称号</h2>
        <AdminMapHonors :catalog="catalog" :assignments="draft.assignments" :map-variant="draft.mapVariant" :disabled="api.saving.value" @update:assignments="patchDraft({ assignments: $event })" />
      </section>

      <section class="map-card" aria-labelledby="map-revision-title">
        <h2 id="map-revision-title" class="type-headline"><span class="map-card__step">3</span>修订设置</h2>
        <div class="map-card__fields">
          <UFormField label="状态" :hint="selectedRevision.lifecycle === 'default' ? '正式版不能直接改状态；设置另一个修订为正式版即可。' : undefined">
            <USelect :model-value="draft.lifecycle" :items="lifecycleItems" :disabled="api.saving.value || selectedRevision.lifecycle === 'default'" @update:model-value="patchDraft({ lifecycle: $event as AdminMapRevisionLifecycle })" />
          </UFormField>
          <UFormField label="游戏版本" required>
            <UInput :model-value="draft.gameVersion" required :disabled="api.saving.value" @update:model-value="patchDraft({ gameVersion: String($event) })" />
          </UFormField>
          <UFormField label="地图变体" :hint="selectedRevision.lifecycle === 'default' ? '正式版必须是标准版。' : undefined">
            <USelect :model-value="draft.mapVariant" :items="variantItems" :disabled="api.saving.value || selectedRevision.lifecycle === 'default'" @update:model-value="patchDraft({ mapVariant: $event as 'classic' | null })" />
          </UFormField>
          <UFormField v-if="selectedRevision.mode" label="独立模式" hint="地图归属在「独立模式」页调整。">
            <NuxtLink to="/admin/modes" class="map-card__mode">{{ selectedRevision.mode }}</NuxtLink>
          </UFormField>
        </div>
      </section>
    </div>

    <UEmpty v-else-if="!api.loading.value" title="地图不存在，或当前账号没有访问权限" />

    <div class="draft-bar" :class="{ 'draft-bar--visible': selectedDirty }" :inert="!selectedDirty" role="status">
      <span>「{{ revisionName(selectedRevision) }}」有未保存的修改<template v-if="!spatialValid">，点位代码需要先修正</template></span>
      <UButton color="neutral" variant="ghost" size="sm" label="放弃" :disabled="api.saving.value" @click="discardDraft" />
      <UButton class="pressable" label="保存" :loading="api.saving.value" :disabled="!canSave" @click="saveRevision" />
    </div>

    <USlideover v-model:open="metadataOpen" title="地图资料" description="评级、机制和封面不属于某个版本修订。">
      <template #body><AdminMapMetadataForm v-if="map" :map="map" :saving="metadataSaving" @save="saveMetadata" /></template>
    </USlideover>
    <USlideover v-model:open="auditOpen" title="修改记录" :description="`${audit.length} 条`">
      <template #body><AdminMapAuditList :audit="audit" /></template>
    </USlideover>

    <AdminMapNewRevisionDialog v-model:open="newOpen" :saving="api.saving.value" @create="createRevision" />
    <AdminMapPromoteDialog v-model:open="promoteOpen" :revision-name="revisionName(selectedRevision)" :replaced="defaultRevision && defaultRevision.revisionId !== selectedRevisionId ? defaultRevision : null" :replaced-name="revisionName(defaultRevision)" :saving="api.saving.value" @confirm="promote" />
  </AdminWorkspace>
</template>

<style scoped>
.map-editor { display: grid; gap: 1rem; min-width: 0; padding-bottom: 5rem; }
.map-card { display: grid; gap: 1rem; min-width: 0; padding: 1.25rem; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); container-type: inline-size; }
.map-card h2 { display: flex; align-items: center; gap: 0.625rem; margin: 0; }
.map-card__step { display: grid; place-items: center; width: 1.625rem; height: 1.625rem; border-radius: 50%; color: var(--surface); background: var(--text); font-size: 0.8125rem; }
.map-card__fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); gap: 0.75rem; }
.map-card__mode { font-size: 0.875rem; }
.draft-bar { position: fixed; z-index: 30; left: 50%; bottom: 1rem; display: flex; align-items: center; gap: 0.75rem; max-width: calc(100vw - 1.5rem); padding: 0.5rem 0.5rem 0.5rem 1rem; border-radius: var(--radius-card); color: var(--surface); background: var(--text); box-shadow: var(--elevation-3); transform: translate(-50%, 160%); transition: transform 250ms ease; font-size: 0.875rem; }
.draft-bar--visible { transform: translate(-50%, 0); }
.draft-bar :deep(button) { min-height: 2.5rem; }
@media (prefers-reduced-motion: reduce) { .draft-bar { transition: none; } }
</style>
