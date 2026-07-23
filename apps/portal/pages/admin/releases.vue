<script setup lang="ts">
import ReleaseDiffTable from "~/components/admin/ReleaseDiffTable.vue";
import ReleaseOverviewPanel from "~/components/admin/ReleaseOverviewPanel.vue";
import type { ReleaseDraftDetail } from "~/composables/useReleasePlane";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "版本发布 · 躲避堡垒 3" });

const { overview, loading, error, refresh, createDraftFromCatalog, getDraft, createChangeSetFromDraft, createCandidate, startBuild } = useReleasePlane();
const draftName = shallowRef("平台内容草稿");
const draftId = shallowRef("");
const draft = shallowRef<ReleaseDraftDetail | null>(null);
const changeSetId = shallowRef("");
const candidateId = shallowRef("");
const buildId = shallowRef("");
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
  changeSetId.value = "";
  candidateId.value = "";
  buildId.value = "";
  toast.add({ title: "Draft 已从工作目录生成", description: "内容和稳定 ID 已自动采集。", color: "success" });
});

const saveChangeSet = () => run(async () => {
  if (!draftId.value) throw new Error("请先生成 Draft。");
  const result = await createChangeSetFromDraft(draftId.value, "下一版本变更");
  changeSetId.value = result.changeSetId;
  toast.add({ title: "Change Set 已按 diff 生成", color: "success" });
});

const saveCandidate = () => run(async () => {
  if (!changeSetId.value) throw new Error("请先生成 Change Set。");
  const result = await createCandidate(changeSetId.value);
  candidateId.value = result.candidateId;
  toast.add({ title: "Candidate 已冻结", color: "success" });
});

const buildCandidate = () => run(async () => {
  if (!candidateId.value) throw new Error("请先生成 Candidate。");
  const result = await startBuild(candidateId.value);
  buildId.value = result.buildId;
  toast.add({ title: "已请求 Bastion 构建", color: "success" });
});

onMounted(() => void refresh());
</script>

<template>
  <AdminWorkspace title="版本发布" :count="loading ? '读取中…' : `${overview?.releases.length ?? 0} 个 Release`">
    <template #messages><UAlert v-if="error || actionError" color="error" variant="subtle" :description="error || actionError" /></template>
    <ReleaseOverviewPanel :overview="overview" :loading="loading" @refresh="refresh" />

    <section class="release-workflow" aria-labelledby="release-workflow-title">
      <div class="section-heading">
        <div><p class="eyebrow">Candidate 工作流</p><h2 id="release-workflow-title">从工作目录生成下一次构建</h2></div>
        <span class="workflow-note">先在事件、地图、成就等管理页面编辑一次；这里负责采集、审阅差异和构建。</span>
      </div>

      <form class="capture-bar" @submit.prevent="saveDraft">
        <div><strong>01 · 创建 Draft</strong><p>后端自动读取当前工作目录，生成内容快照和稳定 ID。</p></div>
        <UInput v-model="draftName" aria-label="草稿名称" placeholder="例如：七月事件调整" />
        <UButton type="submit" label="从工作目录创建 Draft" :loading="loading" />
      </form>

      <div v-if="draft" class="draft-panel">
        <div class="draft-meta"><div><span class="step-number">DRAFT</span><h3>{{ draft.name }}</h3></div><div class="draft-actions"><code>{{ draft.draftId }}</code><UButton label="重新采集工作目录" color="neutral" variant="outline" :loading="loading" @click="saveDraft" /></div></div>
        <ReleaseDiffTable :diff="draft.diff" :loading="loading" />
      </div>

      <div class="workflow-grid">
        <article class="workflow-step" :class="{ muted: !draft }"><span class="step-number">02</span><h3>按 diff 生成 Change Set</h3><p>自动包含新增、修改和 Current 中已移除的内容。</p><UButton label="生成 Change Set" :disabled="!draft || !draft.diff.length || Boolean(changeSetId)" :loading="loading" @click="saveChangeSet" /><code v-if="changeSetId">{{ changeSetId }}</code></article>
        <article class="workflow-step" :class="{ muted: !changeSetId }"><span class="step-number">03</span><h3>冻结 Candidate</h3><p>把 Change Set 合并成不可变的构建快照。</p><UButton label="生成 Candidate" :disabled="!changeSetId || Boolean(candidateId)" :loading="loading" @click="saveCandidate" /><code v-if="candidateId">{{ candidateId }}</code></article>
        <article class="workflow-step" :class="{ muted: !candidateId }"><span class="step-number">04</span><h3>请求 Bastion 构建</h3><p>构建结果回传后，成功版本才会激活为 Current。</p><UButton label="开始构建" :disabled="!candidateId || Boolean(buildId)" :loading="loading" @click="buildCandidate" /><code v-if="buildId">Build {{ buildId }}</code></article>
      </div>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.release-workflow { display:grid; gap:20px; margin-top:clamp(34px,6vw,72px); }.section-heading { display:flex; justify-content:space-between; align-items:end; gap:16px; }.section-heading h2 { margin:4px 0 0; font-size:clamp(1.35rem,3vw,1.85rem); letter-spacing:-.04em; }.eyebrow { margin:0; color:var(--accent); font-size:.72rem; letter-spacing:.16em; text-transform:uppercase; }.workflow-note { max-width:320px; color:var(--quiet); font-size:.82rem; line-height:1.5; text-align:right; }.capture-bar { display:grid; grid-template-columns:minmax(0,1fr) minmax(180px,280px) auto; gap:16px; align-items:center; padding:18px 0; border-block:1px solid var(--line); }.capture-bar strong { font-size:1rem; }.capture-bar p,.workflow-step p { margin:5px 0 0; color:var(--quiet); font-size:.82rem; line-height:1.5; }.draft-panel { display:grid; gap:8px; }.draft-meta { display:flex; justify-content:space-between; align-items:end; gap:16px; }.draft-meta h3 { margin:4px 0 0; font-size:1.05rem; }.draft-actions { display:flex; align-items:center; gap:12px; }.draft-actions code,.workflow-step code { max-width:260px; overflow:hidden; color:var(--quiet); font-size:.72rem; text-overflow:ellipsis; white-space:nowrap; }.step-number { color:var(--accent); font-size:.72rem; letter-spacing:.14em; }.workflow-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); border-top:1px solid var(--line); }.workflow-step { display:grid; align-content:start; gap:12px; min-width:0; padding:22px 16px 24px 0; }.workflow-step + .workflow-step { padding-left:16px; border-left:1px solid var(--line); }.workflow-step h3 { margin:0; font-size:1rem; }.workflow-step.muted { opacity:.48; }
@media (max-width:980px) { .capture-bar { grid-template-columns:1fr 1fr; }.capture-bar > :first-child { grid-column:1 / -1; }.workflow-grid { grid-template-columns:1fr; }.workflow-step,.workflow-step + .workflow-step { padding-inline:0; border-left:0; }.workflow-step + .workflow-step { border-top:1px solid var(--line); } }
@media (max-width:560px) { .section-heading,.draft-meta { align-items:start; flex-direction:column; }.workflow-note { max-width:none; text-align:left; }.capture-bar { grid-template-columns:1fr; }.capture-bar > :first-child { grid-column:auto; }.draft-actions { align-items:start; flex-direction:column; } }
</style>
