<script setup lang="ts">
import type { Map } from "~/composables/useSubmissionUpload";
import type { AdminMapRevisionUpdateInput } from "~/composables/useAdminMapEditor";
import { useAdminMapEditor } from "~/composables/useAdminMapEditor";
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
const resetGameVersion = shallowRef("");
const resetMapVariant = shallowRef<"classic" | null>(null);
const resetCopyConfiguration = shallowRef(true);
const metadata = reactive<{ coverUrl: string; backgroundUrl: string; difficultyRating: Map["difficultyRating"]; mechanics: string[] }>({
  coverUrl: "",
  backgroundUrl: "",
  difficultyRating: null,
  mechanics: [],
});

const map = computed(() => api.editor.value?.map ?? null);
const revisions = computed(() => api.editor.value?.revisions ?? []);
const selectedRevision = computed(() => revisions.value.find((revision) => revision.revisionId === selectedRevisionId.value) ?? null);
const audit = computed(() => api.editor.value?.audit ?? []);
const title = computed(() => map.value ? `${map.value.mapName} · 地图编辑器` : "地图编辑器");
const lifecycleLabels = { preparing: "准备中", default: "默认", selectable: "可选", historical: "历史" } as const;
const auditLabels: Record<string, string> = {
  "admin.map.metadata.update": "保存地图属性",
  "admin.map.revision.create": "创建 revision",
  "admin.map.revision.update": "保存 revision",
};
const resetMapVariantItems = [{ value: null, label: "正式版" }, { value: "classic", label: "经典版" }];

function syncMetadata(value: Map | null) {
  if (!value) return;
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
    toast.add({ title: "Revision 配置已保存", color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法保存 revision 配置，请检查服务端返回的校验信息。").description;
  }
}

function openReset() {
  resetSourceId.value = selectedRevision.value?.revisionId ?? revisions.value.find((revision) => revision.lifecycle === "default")?.revisionId ?? null;
  resetReason.value = "";
  resetGameVersion.value = selectedRevision.value?.gameVersion ?? map.value?.gameVersion ?? "";
  resetMapVariant.value = null;
  resetCopyConfiguration.value = true;
  resetOpen.value = true;
}

async function createResetRevision() {
  if (resetSaving.value || !resetReason.value.trim() || !resetGameVersion.value.trim()) return;
  resetSaving.value = true;
  actionError.value = "";
  try {
    const revision = await api.createRevision({
      sourceRevisionId: resetCopyConfiguration.value ? resetSourceId.value : null,
      resetReason: resetReason.value.trim(),
      gameVersion: resetGameVersion.value.trim(),
      mapVariant: resetMapVariant.value,
      copyConfiguration: resetCopyConfiguration.value,
    });
    selectedRevisionId.value = revision.revisionId;
    resetOpen.value = false;
    toast.add({ title: "新的准备中 revision 已创建", description: "玩家进度未被复制。完成配置后，再将它设为默认或可选。", color: "success" });
  } catch (cause) {
    actionError.value = portalErrorDetails(cause, "无法创建 revision，请稍后重试。").description;
  } finally {
    resetSaving.value = false;
  }
}

function auditPayload(auditItem: (typeof audit.value)[number]) {
  const payload = auditItem.payload;
  if (auditItem.operation === "admin.map.revision.create") return payload.progressCopied === false ? "复制配置；未复制进度" : "创建 revision";
  if (auditItem.operation === "admin.map.revision.update") return `状态：${String(payload.previousLifecycle ?? "—")} → ${String(payload.lifecycle ?? "—")}；未复制进度`;
  return "地图属性变更";
}

onMounted(() => void load());
useSeoMeta({ title: "地图 revision 编辑器 · 躲避堡垒 3" });
</script>

<template>
  <AdminWorkspace :title="title" :count="api.loading.value ? '读取中…' : map ? `${revisions.length} 个 revision` : ''">
    <template #actions>
      <UButton to="/admin/maps" label="返回地图目录" color="neutral" variant="outline" />
      <UButton v-if="map" label="Reset / Rework" icon="i-lucide-git-branch-plus" color="neutral" @click="openReset" />
    </template>
    <template #messages>
      <UAlert v-if="api.error.value || actionError" color="error" variant="subtle" :description="api.error.value || actionError" />
    </template>

    <div v-if="map" class="map-editor-layout">
      <aside class="map-editor-sidebar">
        <section class="map-summary" aria-labelledby="map-summary-title">
          <p class="eyebrow">稳定地图身份</p>
          <h2 id="map-summary-title">{{ map.mapName }}</h2>
          <p>{{ map.mapId }}</p>
          <span>目录版本 {{ map.gameVersion }}</span>
        </section>
        <AdminMapRevisionList :revisions="revisions" :selected-revision-id="selectedRevisionId" :disabled="api.saving.value" @select="selectedRevisionId = $event" />
      </aside>

      <div class="map-editor-main">
        <section class="metadata-card" aria-labelledby="metadata-title">
          <header class="section-heading">
            <div>
              <p class="eyebrow">普通保存</p>
              <h2 id="metadata-title">地图属性</h2>
            </div>
            <span class="section-note">不改变 revision 生命周期</span>
          </header>
          <form class="metadata-form" @submit.prevent="saveMetadata">
            <div class="metadata-form__grid">
              <UFormField label="地图难度评级" hint="地图综合评级，不等同于挑战难度。">
                <USelect v-model="metadata.difficultyRating" :items="[{ label: '暂无评级', value: null }, ...(['T0', 'T1', 'T2', 'T3', 'T4', 'T5'] as const).map((rating) => ({ label: rating, value: rating }))]" :disabled="metadataSaving" />
              </UFormField>
              <UFormField label="特殊机制" hint="平台服务端负责最终数量和长度校验。">
                <UInputTags v-model="metadata.mechanics" :disabled="metadataSaving" placeholder="输入机制标签" />
              </UFormField>
            </div>
            <div class="metadata-form__grid">
              <UFormField label="地图封面地址"><UInput v-model="metadata.coverUrl" type="url" placeholder="https://…" :disabled="metadataSaving" /></UFormField>
              <UFormField label="地图背景地址"><UInput v-model="metadata.backgroundUrl" type="url" placeholder="https://…" :disabled="metadataSaving" /></UFormField>
            </div>
            <div class="form-actions"><UButton type="submit" label="保存地图属性" :loading="metadataSaving" :disabled="metadataSaving" /></div>
          </form>
        </section>

        <AdminMapRevisionEditor v-if="selectedRevision" :revision="selectedRevision" :challenge-catalog="api.editor.value?.challengeCatalog ?? []" :saving="api.saving.value" @save="saveRevision" />

        <section class="audit-card" aria-labelledby="audit-title">
          <header class="section-heading">
            <div>
              <p class="eyebrow">可追溯变更</p>
              <h2 id="audit-title">审计记录</h2>
            </div>
            <span class="section-note">{{ audit.length }} 条</span>
          </header>
          <ol v-if="audit.length" class="audit-list">
            <li v-for="item in audit" :key="`${item.createdAt}:${item.operation}:${item.entityId}`">
              <div>
                <strong>{{ auditLabels[item.operation] ?? item.operation }}</strong>
                <p>{{ auditPayload(item) }}</p>
              </div>
              <span>{{ new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(item.createdAt) }}</span>
            </li>
          </ol>
          <p v-else class="empty-note">暂无地图编辑记录。</p>
        </section>
      </div>
    </div>
    <p v-else-if="!api.loading.value" class="admin-empty">地图不存在，或当前账号没有访问权限。</p>

    <AdminResponsiveDialog v-model:open="resetOpen" title="Reset / Rework · 创建新 revision" description="新 revision 从准备中开始。复制配置不会复制任何玩家进度。" size="md" :dismissible="!resetSaving">
      <template #body>
        <form id="map-reset-form" class="reset-form" @submit.prevent="createResetRevision">
          <UFormField label="来源 revision" hint="可选择任意保留的 revision 作为配置来源。">
            <USelect v-model="resetSourceId" :items="[{ label: '不指定来源', value: null }, ...revisions.map((revision) => ({ label: `${revision.revisionId} · ${lifecycleLabels[revision.lifecycle]}`, value: revision.revisionId }))]" :disabled="resetSaving || !resetCopyConfiguration" />
          </UFormField>
          <UCheckbox v-model="resetCopyConfiguration" label="复制空间配置和 challenge assignments" :disabled="resetSaving" />
          <UFormField label="重置 / 重做理由" required><UTextarea v-model="resetReason" :rows="3" placeholder="例如：地图几何重新制作，重新建立公平边界" :disabled="resetSaving" required /></UFormField>
          <div class="metadata-form__grid">
            <UFormField label="目标游戏版本" required><UInput v-model="resetGameVersion" :disabled="resetSaving" required /></UFormField>
            <UFormField label="地图变体"><USelect v-model="resetMapVariant" :items="resetMapVariantItems" :disabled="resetSaving" /></UFormField>
          </div>
        </form>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" :disabled="resetSaving" @click="resetOpen = false" />
        <UButton type="submit" form="map-reset-form" label="创建准备中 revision" :loading="resetSaving" :disabled="resetSaving || !resetReason.trim() || !resetGameVersion.trim()" />
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.map-editor-layout { display: grid; grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr); gap: clamp(18px, 3vw, 32px); align-items: start; }
.map-editor-sidebar, .map-editor-main { display: grid; gap: 18px; min-width: 0; }
.map-summary, .metadata-card, .audit-card { padding: clamp(16px, 2.5vw, 24px); border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.map-summary { background: linear-gradient(135deg, var(--accent-surface), var(--surface)); }
.map-summary h2 { margin: 5px 0 8px; font-size: clamp(1.5rem, 3vw, 2.2rem); letter-spacing: -.04em; overflow-wrap: anywhere; }
.map-summary p:last-of-type { margin: 0; color: var(--quiet); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; overflow-wrap: anywhere; }
.map-summary span { display: block; margin-top: 12px; color: var(--quiet); font-size: var(--type-caption-size); }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.section-heading h2 { margin: 0; font-size: 1.35rem; letter-spacing: -.02em; }
.section-heading .eyebrow { margin: 0 0 5px; }
.section-note, .empty-note { color: var(--quiet); font-size: var(--type-caption-size); }
.metadata-card, .audit-card { display: grid; gap: 16px; }
.metadata-form, .reset-form { display: grid; gap: 14px; }
.metadata-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.form-actions { display: flex; justify-content: flex-end; padding-top: 4px; }
.audit-list { display: grid; gap: 0; padding: 0; margin: 0; list-style: none; border-top: 1px solid var(--line); }
.audit-list li { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.audit-list strong { font-size: .84rem; }
.audit-list p { margin: 4px 0 0; color: var(--quiet); font-size: var(--type-caption-size); }
.audit-list span { flex: 0 0 auto; color: var(--quiet); font-size: var(--type-caption-size); }
.empty-note { margin: 0; }
@media (max-width: 850px) { .map-editor-layout { grid-template-columns: 1fr; } .map-editor-sidebar { grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr); align-items: start; } }
@media (max-width: 620px) { .map-editor-sidebar, .metadata-form__grid { grid-template-columns: 1fr; } .section-heading { align-items: start; flex-direction: column; } .form-actions :deep(button) { width: 100%; } .audit-list li { flex-direction: column; gap: 5px; } }
</style>
