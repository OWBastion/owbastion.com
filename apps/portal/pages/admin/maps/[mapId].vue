<script setup lang="ts">
import type { Map } from "~/composables/useSubmissionUpload";
import type { AdminMapRevisionUpdateInput } from "~/composables/useAdminMapEditor";
import { useAdminMapEditor } from "~/composables/useAdminMapEditor";
import { formatCurrentGameVersion } from "~/utils/game-version";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });

const route = useRoute();
const mapId = String(route.params.mapId ?? "");
const api = useAdminMapEditor(mapId);
const toast = useToast();
const selectedRevisionId = shallowRef("");
const actionError = shallowRef("");
const metadataSaving = shallowRef(false);
const resetOpen = shallowRef(false);
const resetSaving = shallowRef(false);
const resetSourceId = shallowRef<string | null>(null);
const resetReason = shallowRef("");
const resetMapVariant = shallowRef<"classic" | null>(null);
const resetCopyConfiguration = shallowRef(true);
const resetGameVersion = shallowRef("");
const workspacePane = shallowRef<"revision" | "attributes" | "audit">("revision");
const metadata = reactive<{ gameVersion: string; coverUrl: string; backgroundUrl: string; difficultyRating: Map["difficultyRating"]; mechanics: string[] }>({
  gameVersion: "",
  coverUrl: "",
  backgroundUrl: "",
  difficultyRating: null,
  mechanics: [],
});

const map = computed(() => api.editor.value?.map ?? null);
const revisions = computed(() => api.editor.value?.revisions ?? []);
const selectedRevision = computed(() => revisions.value.find((revision) => revision.revisionId === selectedRevisionId.value) ?? null);
const replacedDefaultRevision = computed(() => revisions.value.find((revision) => revision.lifecycle === "default" && revision.revisionId !== selectedRevisionId.value) ?? null);
const audit = computed(() => api.editor.value?.audit ?? []);
const title = computed(() => map.value ? `${map.value.mapName} · 地图编辑器` : "地图编辑器");
const workspaceTabs = [
  { label: "修订", value: "revision" },
  { label: "属性", value: "attributes" },
  { label: "记录", value: "audit" },
];
const lifecycleLabels = { preparing: "准备中", default: "默认", selectable: "可选", historical: "历史" } as const;
const auditLabels: Record<string, string> = {
  "admin.map.metadata.update": "保存地图属性",
  "admin.map.revision.create": "创建版本修订",
  "admin.map.revision.update": "保存版本修订",
};
const resetMapVariantItems = [{ value: null, label: "正式版" }, { value: "classic", label: "经典版" }];
const difficultyItems = [
  { label: "暂无评级", value: null },
  ...(["T0", "T1", "T2", "T3", "T4", "T5"] as const).map((rating) => ({ label: rating, value: rating })),
];

function syncMetadata(value: Map | null) {
  if (!value) return;
  metadata.gameVersion = value.gameVersion;
  metadata.coverUrl = value.coverUrl ?? "";
  metadata.backgroundUrl = value.backgroundUrl ?? "";
  metadata.difficultyRating = value.difficultyRating;
  metadata.mechanics = [...value.mechanics];
}

watch(() => api.editor.value?.map, (value) => syncMetadata(value ?? null), { immediate: true, deep: true });
watch(revisions, (items) => {
  if (items.some((revision) => revision.revisionId === selectedRevisionId.value)) return;
  selectedRevisionId.value = items.find((revision) => revision.lifecycle === "default")?.revisionId ?? items[0]?.revisionId ?? "";
}, { immediate: true });

async function load() {
  try {
    await api.load();
  } catch {
    // The composable retains the user-facing load error.
  }
}

async function saveMetadata() {
  if (metadataSaving.value) return;
  metadataSaving.value = true;
  actionError.value = "";
  try {
    await api.saveMetadata({
      gameVersion: metadata.gameVersion.trim(),
      difficultyRating: metadata.difficultyRating,
      mechanics: metadata.mechanics,
      coverUrl: metadata.coverUrl.trim() || null,
      backgroundUrl: metadata.backgroundUrl.trim() || null,
    });
    toast.add({ title: "地图属性已保存", color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法保存地图属性，请稍后重试。").description;
  } finally {
    metadataSaving.value = false;
  }
}

async function saveRevision(input: AdminMapRevisionUpdateInput) {
  if (!selectedRevision.value) return;
  actionError.value = "";
  try {
    await api.saveRevision(selectedRevision.value.revisionId, input);
    toast.add({ title: "版本修订配置已保存", color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法保存版本修订配置，请检查服务端返回的校验信息。").description;
  }
}

function openReset() {
  resetSourceId.value = selectedRevision.value?.revisionId ?? revisions.value.find((revision) => revision.lifecycle === "default")?.revisionId ?? null;
  resetReason.value = "";
  resetGameVersion.value = formatCurrentGameVersion();
  resetMapVariant.value = null;
  resetCopyConfiguration.value = true;
  resetOpen.value = true;
}

async function createResetRevision() {
  if (resetSaving.value) return;
  resetSaving.value = true;
  actionError.value = "";
  try {
    const revision = await api.createRevision({
      sourceRevisionId: resetCopyConfiguration.value ? resetSourceId.value : null,
      resetReason: resetReason.value.trim() || null,
      gameVersion: resetGameVersion.value.trim(),
      mapVariant: resetMapVariant.value,
      copyConfiguration: resetCopyConfiguration.value,
    });
    selectedRevisionId.value = revision.revisionId;
    workspacePane.value = "revision";
    resetOpen.value = false;
    toast.add({ title: "新的准备中版本修订已创建", description: "玩家进度未被复制。完成配置后，再将它设为默认或可选。", color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法创建版本修订，请稍后重试。").description;
  } finally {
    resetSaving.value = false;
  }
}

function auditPayload(auditItem: (typeof audit.value)[number]) {
  const payload = auditItem.payload;
  if (auditItem.operation === "admin.map.revision.create") return payload.progressCopied === false ? "复制配置；未复制进度" : "创建版本修订";
  if (auditItem.operation === "admin.map.revision.update") return `状态：${String(payload.previousLifecycle ?? "—")} → ${String(payload.lifecycle ?? "—")}；未复制进度`;
  return "地图属性变更";
}

onMounted(() => void load());
useSeoMeta({ title: "地图版本修订编辑器 · 躲避堡垒 3" });
</script>

<template>
  <AdminWorkspace :title="title" :count="api.loading.value ? '读取中…' : map ? `${revisions.length} 个版本修订` : ''">
    <template #actions>
      <UButton to="/admin/maps" label="返回地图目录" color="neutral" variant="outline" />
      <UButton v-if="map" class="pressable" label="重置 / 重做" icon="i-lucide-git-branch-plus" color="neutral" @click="openReset" />
    </template>
    <template #messages>
      <UAlert v-if="api.error.value || actionError" color="error" variant="subtle" :description="api.error.value || actionError" />
    </template>
    <template v-if="map" #toolbar>
      <UTabs v-model="workspacePane" :items="workspaceTabs" variant="link" aria-label="地图编辑器分区" />
    </template>

    <div v-if="map && workspacePane === 'revision'" class="map-editor">
      <aside class="map-editor__master">
        <section class="map-identity" aria-label="地图身份">
          <p class="map-identity__id">{{ map.mapId }}</p>
          <p class="type-caption">目录版本 {{ map.gameVersion }}</p>
        </section>
        <AdminMapRevisionList :revisions="revisions" :selected-revision-id="selectedRevisionId" :disabled="api.saving.value" @select="selectedRevisionId = $event" />
      </aside>
      <div class="map-editor__detail">
        <AdminMapRevisionEditor
          v-if="selectedRevision"
          :revision="selectedRevision"
          :replaced-default-revision="replacedDefaultRevision"
          :challenge-catalog="api.editor.value?.challengeCatalog ?? []"
          :saving="api.saving.value"
          @save="saveRevision"
        />
      </div>
    </div>

    <form v-else-if="map && workspacePane === 'attributes'" class="pane-form" @submit.prevent="saveMetadata">
      <div class="pane-form__fields">
        <UFormField label="地图难度评级" hint="地图综合评级，不等同于挑战难度。">
          <USelect v-model="metadata.difficultyRating" :items="difficultyItems" :disabled="metadataSaving" />
        </UFormField>
        <UFormField label="特殊机制" hint="平台服务端负责最终数量和长度校验。">
          <UInputTags v-model="metadata.mechanics" :disabled="metadataSaving" placeholder="输入机制标签" />
        </UFormField>
        <UFormField label="目录版本" required>
          <UInput v-model="metadata.gameVersion" required :disabled="metadataSaving" />
        </UFormField>
        <UFormField label="地图封面地址">
          <UInput v-model="metadata.coverUrl" type="url" placeholder="https://…" :disabled="metadataSaving" />
        </UFormField>
        <UFormField label="地图背景地址">
          <UInput v-model="metadata.backgroundUrl" type="url" placeholder="https://…" :disabled="metadataSaving" />
        </UFormField>
      </div>
      <div class="pane-toolbar glass elevation-1 scroll-edge-sticky">
        <UButton type="submit" class="pressable" label="保存地图属性" :loading="metadataSaving" :disabled="metadataSaving" />
      </div>
    </form>

    <section v-else-if="map && workspacePane === 'audit'" class="audit-pane" aria-labelledby="audit-title">
      <header class="audit-pane__header">
        <h2 id="audit-title" class="type-headline">记录</h2>
        <span class="type-caption">{{ audit.length }} 条</span>
      </header>
      <ol v-if="audit.length" class="audit-list">
        <li v-for="item in audit" :key="`${item.createdAt}:${item.operation}:${item.entityId}`">
          <div>
            <strong>{{ auditLabels[item.operation] ?? item.operation }}</strong>
            <p>{{ auditPayload(item) }}</p>
          </div>
          <span>{{ new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt) }}</span>
        </li>
      </ol>
      <UEmpty v-else title="暂无地图编辑记录" />
    </section>

    <UEmpty v-else-if="!api.loading.value" title="地图不存在，或当前账号没有访问权限" />

    <AdminResponsiveDialog v-model:open="resetOpen" title="重置 / 重做 · 创建新版本修订" description="新版本修订从准备中开始。复制配置不会复制任何玩家进度。" size="md" :dismissible="!resetSaving">
      <template #body>
        <form id="map-reset-form" class="reset-form" @submit.prevent="createResetRevision">
          <UFormField label="来源版本修订" hint="可选择任意保留的版本修订作为配置来源。">
            <USelect v-model="resetSourceId" :items="[{ label: '不指定来源', value: null }, ...revisions.map((revision) => ({ label: `${revision.revisionId} · ${lifecycleLabels[revision.lifecycle]}`, value: revision.revisionId }))]" :disabled="resetSaving || !resetCopyConfiguration" />
          </UFormField>
          <UCheckbox v-model="resetCopyConfiguration" label="复制空间配置和挑战分配" :disabled="resetSaving" />
          <UFormField label="重置 / 重做理由"><UTextarea v-model="resetReason" :rows="3" placeholder="例如：地图几何重新制作，重新建立公平边界" :disabled="resetSaving" /></UFormField>
          <div class="reset-form__grid">
            <UFormField label="目标游戏版本" hint="默认使用今天的日期，可由管理员修改。"><UInput v-model="resetGameVersion" required :disabled="resetSaving" /></UFormField>
            <UFormField label="地图变体"><USelect v-model="resetMapVariant" :items="resetMapVariantItems" :disabled="resetSaving" /></UFormField>
          </div>
        </form>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="resetSaving" @click="resetOpen = false" />
        <UButton type="submit" form="map-reset-form" class="pressable" label="创建准备中版本修订" :loading="resetSaving" :disabled="resetSaving" />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.map-editor {
  display: grid;
  grid-template-columns: minmax(min(100%, 16rem), 20rem) minmax(0, 1fr);
  gap: clamp(1.125rem, 3vw, 2rem);
  align-items: start;
}
.map-editor__master,
.map-editor__detail,
.pane-form,
.audit-pane {
  display: grid;
  gap: 1.125rem;
  min-width: 0;
}
.map-identity {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}
.map-identity__id {
  margin: 0;
  color: var(--quiet);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--type-caption-size);
  overflow-wrap: anywhere;
}
.map-identity .type-caption {
  margin: 0;
  color: var(--quiet);
}
.pane-form__fields,
.reset-form {
  display: grid;
  gap: 0.875rem;
}
.pane-form__fields {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}
.reset-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem;
}
.pane-toolbar {
  position: sticky;
  bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.875rem;
}
.audit-pane__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.audit-pane__header h2 { margin: 0; }
.audit-list {
  display: grid;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}
.audit-list li {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--line);
}
.audit-list strong { font-size: 0.875rem; }
.audit-list p,
.audit-list span {
  margin: 0.25rem 0 0;
  color: var(--quiet);
  font-size: var(--type-caption-size);
}
.audit-list span {
  flex: 0 0 auto;
  margin: 0;
}
@media (max-width: 51.25rem) {
  .map-editor { grid-template-columns: 1fr; }
}
@media (max-width: 38.75rem) {
  .pane-toolbar { justify-content: stretch; }
  .pane-toolbar :deep(button) { width: 100%; }
  .audit-list li { flex-direction: column; gap: 0.35rem; }
}
</style>
