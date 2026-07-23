<script setup lang="ts">
import ReleaseOverviewPanel from "~/components/admin/ReleaseOverviewPanel.vue";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "版本发布 · 躲避堡垒 3" });

const { overview, loading, error, refresh, createDraft, putDraftItem, createChangeSet, createCandidate, startBuild } = useReleasePlane();
const draftName = shallowRef("");
const draftId = shallowRef("");
const itemId = shallowRef("");
const changeSetName = shallowRef("");
const changeSetId = shallowRef("");
const candidateId = shallowRef("");
const contentType = shallowRef<"event" | "map" | "title" | "challenge">("event");
const contentId = shallowRef("");
const operation = shallowRef<"upsert" | "retire" | "delete">("upsert");
const dataJson = shallowRef("{}");
const actionError = shallowRef("");
const toast = useToast();

const run = async (action: () => Promise<void>) => { actionError.value = ""; try { await action(); await refresh(); } catch (cause) { actionError.value = portalErrorDetails(cause, "操作失败。").description; } };
const saveDraft = () => run(async () => { const result = await createDraft(draftName.value || "平台内容草稿"); draftId.value = result.draftId; draftName.value = ""; toast.add({ title: "草稿已创建", color: "success" }); });
const saveItem = () => run(async () => { if (!draftId.value || !contentId.value) throw new Error("请先选择草稿并填写稳定 ID。"); const result = await putDraftItem(draftId.value, { contentType: contentType.value, contentId: contentId.value, operation: operation.value, data: JSON.parse(dataJson.value) }); itemId.value = result.itemId; toast.add({ title: "草稿内容已保存", color: "success" }); });
const saveChangeSet = () => run(async () => { if (!draftId.value || !itemId.value) throw new Error("请先保存草稿内容。"); const result = await createChangeSet(draftId.value, changeSetName.value || "下一版本变更", [itemId.value]); changeSetId.value = result.changeSetId; toast.add({ title: "Change Set 已创建", color: "success" }); });
const saveCandidate = () => run(async () => { if (!changeSetId.value) throw new Error("请先创建 Change Set。"); const result = await createCandidate(changeSetId.value); candidateId.value = result.candidateId; toast.add({ title: "Candidate 已生成", color: "success" }); });
const buildCandidate = () => run(async () => { if (!candidateId.value) throw new Error("请先生成 Candidate。"); await startBuild(candidateId.value); toast.add({ title: "已请求 Bastion 构建", color: "success" }); });

onMounted(() => void refresh());
</script>

<template>
  <AdminWorkspace title="版本发布" :count="loading ? '读取中…' : `${overview?.releases.length ?? 0} 个 Release`">
    <template #messages><UAlert v-if="error || actionError" color="error" variant="subtle" :description="error || actionError" /></template>
    <ReleaseOverviewPanel :overview="overview" :loading="loading" @refresh="refresh" />
    <section class="release-workflow" aria-labelledby="release-workflow-title">
      <div class="section-heading"><div><p class="eyebrow">Candidate 工作流</p><h2 id="release-workflow-title">准备下一次构建</h2></div><span class="workflow-note">平台只发布确定快照，Bastion 负责实现与编译。</span></div>
      <div class="workflow-grid">
        <form class="workflow-step" @submit.prevent="saveDraft"><span class="step-number">01</span><h3>创建 Draft</h3><UInput v-model="draftName" placeholder="例如：七月事件调整" aria-label="草稿名称" /><UButton type="submit" label="创建草稿" /></form>
        <form class="workflow-step" @submit.prevent="saveItem"><span class="step-number">02</span><h3>记录内容变更</h3><UInput v-model="draftId" placeholder="Draft ID" aria-label="Draft ID" /><div class="field-row"><USelect v-model="contentType" :items="[{ label: '事件', value: 'event' }, { label: '地图', value: 'map' }, { label: '称号', value: 'title' }, { label: '挑战', value: 'challenge' }]" /><USelect v-model="operation" :items="[{ label: '更新', value: 'upsert' }, { label: '停用', value: 'retire' }, { label: '删除', value: 'delete' }]" /></div><UInput v-model="contentId" placeholder="稳定内容 ID" aria-label="稳定内容 ID" /><UTextarea v-model="dataJson" :rows="3" aria-label="内容 JSON" /><UButton type="submit" label="保存变更" /></form>
        <form class="workflow-step" @submit.prevent="saveChangeSet"><span class="step-number">03</span><h3>生成 Change Set</h3><UInput v-model="changeSetName" placeholder="变更集合名称" aria-label="变更集合名称" /><UInput v-model="itemId" placeholder="Draft Item ID" aria-label="Draft Item ID" /><UButton type="submit" label="创建集合" /></form>
        <form class="workflow-step" @submit.prevent="saveCandidate"><span class="step-number">04</span><h3>冻结 Candidate</h3><UInput v-model="changeSetId" placeholder="Change Set ID" aria-label="Change Set ID" /><UButton type="submit" label="生成 Candidate" /></form>
        <form class="workflow-step" @submit.prevent="buildCandidate"><span class="step-number">05</span><h3>请求 Bastion 构建</h3><UInput v-model="candidateId" placeholder="Candidate ID" aria-label="Candidate ID" /><UButton type="submit" label="开始构建" /></form>
      </div>
    </section>
  </AdminWorkspace>
</template>

<style scoped>
.release-workflow { display:grid; gap:20px; margin-top:clamp(34px,6vw,72px); }.section-heading { display:flex; justify-content:space-between; align-items:end; gap:16px; }.section-heading h2 { margin:4px 0 0; font-size:clamp(1.35rem,3vw,1.85rem); letter-spacing:-.04em; }.eyebrow { margin:0; color:var(--accent); font-size:.72rem; letter-spacing:.16em; text-transform:uppercase; }.workflow-note { max-width:260px; color:var(--quiet); font-size:.82rem; line-height:1.5; text-align:right; }.workflow-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); border-top:1px solid var(--line); }.workflow-step { display:grid; align-content:start; gap:12px; min-width:0; padding:22px 16px 24px 0; }.workflow-step + .workflow-step { padding-left:16px; border-left:1px solid var(--line); }.step-number { color:var(--accent); font-size:.72rem; letter-spacing:.14em; }.workflow-step h3 { margin:0 0 4px; font-size:1rem; }.field-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
@media (max-width:980px) { .workflow-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.workflow-step:nth-child(odd) { padding-left:0; border-left:0; }.workflow-step:nth-child(n+3) { border-top:1px solid var(--line); } }
@media (max-width:560px) { .section-heading { align-items:start; flex-direction:column; }.workflow-note { max-width:none; text-align:left; }.workflow-grid { grid-template-columns:1fr; }.workflow-step,.workflow-step + .workflow-step,.workflow-step:nth-child(odd) { padding-inline:0; border-left:0; }.workflow-step + .workflow-step { border-top:1px solid var(--line); } }
</style>
