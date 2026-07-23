<script setup lang="ts">
import ReleaseDiffTable from "~/components/admin/ReleaseDiffTable.vue";
import ReleaseOverviewPanel from "~/components/admin/ReleaseOverviewPanel.vue";
import type { ReleaseDraftConfirmation, ReleaseDraftDetail } from "~/composables/useReleasePlane";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "版本发布 · 躲避堡垒 3" });

const { overview, loading, error, refresh, createDraftFromCatalog, getDraft, confirmDraft } = useReleasePlane();
const draftName = shallowRef("平台内容草稿");
const draftId = shallowRef("");
const draft = shallowRef<ReleaseDraftDetail | null>(null);
const confirmation = shallowRef<ReleaseDraftConfirmation | null>(null);
const actionError = shallowRef("");
const toast = useToast();

const run = async (action: () => Promise<void>) => {
  actionError.value = "";
  try { await action(); await refresh(); }
  catch (cause) { actionError.value = portalErrorDetails(cause, "操作失败。").description; }
};

const saveDraft = () => run(async () => {
  const result = await createDraftFromCatalog(draftName.value.trim() || "平台内容草稿");
  draftId.value = result.draftId;
  draft.value = await getDraft(result.draftId);
  confirmation.value = null;
  toast.add({ title: "Draft 已从工作目录生成", description: "内容、关联关系和稳定 ID 已自动采集。", color: "success" });
});

const confirmCurrentChanges = (target: "next" | "release") => run(async () => {
  if (!draftId.value || !draft.value?.diff.length) throw new Error("请先生成包含改动的 Draft。");
  confirmation.value = await confirmDraft(draftId.value, target);
  toast.add({ title: target === "next" ? "Next 快照已生成" : "Release 构建已排队", color: "success" });
});

onMounted(() => void refresh());
</script>

<template>
  <AdminWorkspace title="版本发布" :count="loading ? '读取中…' : `${overview?.releases.length ?? 0} 个 Release`">
    <template #messages><UAlert v-if="error || actionError" color="error" variant="subtle" :description="error || actionError" /></template>
    <ReleaseOverviewPanel :overview="overview" :loading="loading" @refresh="refresh" />

    <section class="release-workflow" aria-labelledby="release-workflow-title">
      <div class="section-heading">
        <div><p class="eyebrow">版本发布</p><h2 id="release-workflow-title">确认内容，选择发布目标</h2></div>
        <span class="workflow-note">管理员只需要编辑内容、审阅差异，然后选择保留为 Next 快照或直接发布。</span>
      </div>

      <form class="capture-bar" @submit.prevent="saveDraft">
        <div><strong>01 · 创建 Draft</strong><p>自动读取事件、地图、成就和称号工作目录；不需要输入 ID 或 JSON。</p></div>
        <UInput v-model="draftName" aria-label="草稿名称" placeholder="例如：七月事件调整" />
        <UButton type="submit" label="从工作目录创建 Draft" :loading="loading" />
      </form>

      <div v-if="draft" class="draft-panel">
        <div class="draft-meta"><div><span class="step-number">DRAFT</span><h3>{{ draft.name }}</h3></div><UButton label="重新采集工作目录" color="neutral" variant="outline" :loading="loading" @click="saveDraft" /></div>
        <ReleaseDiffTable :diff="draft.diff" :loading="loading" />
      </div>

      <section class="confirmation-panel" :class="{ muted: !draft || !draft.diff.length }" aria-labelledby="confirmation-title">
        <div><span class="step-number">02</span><h3 id="confirmation-title">确认当前改动</h3><p>系统自动记录变更并冻结构建快照；这里不再暴露中间步骤。</p></div>
        <div class="target-actions">
          <UButton label="确认并生成 Next 快照" :disabled="!draft || !draft.diff.length || Boolean(confirmation)" :loading="loading" color="neutral" variant="outline" @click="confirmCurrentChanges('next')" />
          <UButton label="确认并发布 Release" :disabled="!draft || !draft.diff.length || Boolean(confirmation)" :loading="loading" @click="confirmCurrentChanges('release')" />
        </div>
      </section>

      <section v-if="confirmation" class="confirmation-result" aria-live="polite">
        <StatusBadge :label="confirmation.target === 'next' ? 'Next 快照已就绪' : 'Release 构建中'" :tone="confirmation.target === 'next' ? 'warning' : 'success'" />
        <div><strong>{{ confirmation.target === "next" ? "内容已保存为 Next 快照" : "已提交 Bastion 构建" }}</strong><p>{{ confirmation.target === "next" ? "Current 不变；后续可以基于这份候选快照继续处理。" : "构建成功后自动激活为 Current，失败不会影响当前版本。" }}</p></div>
      </section>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.release-workflow { display:grid; gap:20px; margin-top:clamp(34px,6vw,72px); }.section-heading { display:flex; justify-content:space-between; align-items:end; gap:16px; }.section-heading h2 { margin:4px 0 0; font-size:clamp(1.35rem,3vw,1.85rem); letter-spacing:-.04em; }.eyebrow { margin:0; color:var(--accent); font-size:.72rem; letter-spacing:.16em; text-transform:uppercase; }.workflow-note { max-width:320px; color:var(--quiet); font-size:.82rem; line-height:1.5; text-align:right; }.capture-bar { display:grid; grid-template-columns:minmax(0,1fr) minmax(180px,280px) auto; gap:16px; align-items:center; padding:18px 0; border-block:1px solid var(--line); }.capture-bar strong { font-size:1rem; }.capture-bar p,.confirmation-panel p,.confirmation-result p { margin:5px 0 0; color:var(--quiet); font-size:.82rem; line-height:1.5; }.draft-panel { display:grid; gap:8px; }.draft-meta { display:flex; justify-content:space-between; align-items:end; gap:16px; }.draft-meta h3 { margin:4px 0 0; font-size:1.05rem; }.step-number { color:var(--accent); font-size:.72rem; letter-spacing:.14em; }.confirmation-panel { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:22px 0; border-block:1px solid var(--line); }.confirmation-panel h3 { margin:4px 0 0; font-size:1rem; }.confirmation-panel.muted { opacity:.48; }.target-actions { display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; }.confirmation-result { display:flex; align-items:center; gap:16px; padding:18px 20px; background:color-mix(in srgb,var(--accent) 8%,transparent); border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line)); }.confirmation-result strong { font-size:.95rem; }
@media (max-width:980px) { .capture-bar { grid-template-columns:1fr 1fr; }.capture-bar > :first-child { grid-column:1 / -1; }.confirmation-panel { align-items:start; flex-direction:column; }.target-actions { justify-content:flex-start; } }
@media (max-width:560px) { .section-heading,.draft-meta { align-items:start; flex-direction:column; }.workflow-note { max-width:none; text-align:left; }.capture-bar { grid-template-columns:1fr; }.capture-bar > :first-child { grid-column:auto; }.target-actions,.target-actions > * { width:100%; }.confirmation-result { align-items:start; flex-direction:column; } }
</style>
