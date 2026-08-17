<script setup lang="ts">
import type { AdminAnnotationProposalDetail } from "~/composables/useAdminApi";

defineProps<{ detail: AdminAnnotationProposalDetail }>();
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const fieldLabel = (key: string) => ({ map_name: "地图", difficulty: "难度", viewer_player: "玩家", challenge_completed: "通关标记", achievement_titles: "成就" })[key] ?? key;
const feedbackTypeLabel = (type: string) => type === "confirmed" ? "确认" : type === "corrected" ? "修正" : "被动报告";
const originLabel = (origin: string | null) => origin ? ({ uncertainty: "不确定", conflict: "冲突", grouped: "分组核对", calibration: "校准抽查", passive: "被动报告" })[origin] ?? origin : "—";
const priorityLabel = (category: string) => ({ correction: "玩家修正", calibration_failure: "校准失败", uncertain: "不确定字段", repeat: "重复模式", confirmation: "例行确认" })[category] ?? category;
const ocrValue = (value: string | boolean | null) => value === null ? "未识别" : typeof value === "boolean" ? value ? "已识别完成" : "未识别完成" : value;
</script>

<template>
  <div class="annotation-detail">
    <section class="annotation-detail__section" aria-labelledby="annotation-source-heading">
      <h2 id="annotation-source-heading">来源提交</h2>
      <dl class="annotation-detail__facts">
        <div><dt>提交</dt><dd><strong>{{ detail.proposal.submissionMapName }}</strong><span class="table-meta">{{ detail.proposal.submissionId }}</span></dd></div>
        <div><dt>提交时间</dt><dd>{{ formatTime(detail.proposal.submissionCreatedAt) }}</dd></div>
        <div><dt>模型 / 布局</dt><dd>{{ detail.proposal.modelVersion ?? "—" }} / {{ detail.proposal.layoutVersion ?? "—" }}</dd></div>
        <div><dt>优先级</dt><dd>{{ priorityLabel(detail.proposal.priority.category) }}<span class="table-meta">{{ detail.proposal.priority.reasons.join("、") }}</span></dd></div>
      </dl>
    </section>

    <section class="annotation-detail__section" aria-labelledby="annotation-facts-heading">
      <h2 id="annotation-facts-heading">识别与反馈</h2>
      <dl class="annotation-detail__facts">
        <div><dt>字段</dt><dd><strong>{{ fieldLabel(detail.proposal.fieldKey) }}</strong><span class="table-meta">{{ detail.proposal.fieldKey }}</span></dd></div>
        <div><dt>原始识别值</dt><dd>{{ detail.proposal.originalValue ?? "未识别" }}</dd></div>
        <div><dt>反馈类型</dt><dd>{{ feedbackTypeLabel(detail.proposal.feedbackType) }}</dd></div>
        <div><dt>提示来源</dt><dd>{{ originLabel(detail.proposal.promptOrigin) }}</dd></div>
        <div><dt>玩家建议值</dt><dd>{{ detail.proposal.proposedValue ?? "—" }}</dd></div>
        <div><dt>提交时间</dt><dd>{{ formatTime(detail.proposal.playerSubmittedAt) }}</dd></div>
      </dl>
      <div v-if="detail.ocr" class="annotation-detail__ocr">
        <h3>识别摘要</h3>
        <dl class="annotation-detail__facts">
          <div><dt>地图</dt><dd>{{ ocrValue(detail.ocr.mapName) }}</dd></div>
          <div><dt>难度</dt><dd>{{ ocrValue(detail.ocr.difficulty) }}</dd></div>
          <div><dt>玩家</dt><dd>{{ ocrValue(detail.ocr.playerName) }}</dd></div>
          <div><dt>通关标记</dt><dd>{{ ocrValue(detail.ocr.challengeCompleted) }}</dd></div>
        </dl>
      </div>
    </section>
  </div>
</template>

<style scoped>
.annotation-detail { display: grid; gap: 22px; }
.annotation-detail__section { display: grid; gap: 12px; }
.annotation-detail__section h2 { margin: 0; font-size: 1rem; font-weight: 720; }
.annotation-detail__section h3 { margin: 0; font-size: .86rem; font-weight: 640; }
.annotation-detail__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }
.annotation-detail__facts > div { display: grid; gap: 4px; min-width: 0; }
.annotation-detail__facts dt { color: var(--quiet); font-size: .74rem; }
.annotation-detail__facts dd { margin: 0; color: var(--text); font-size: .86rem; overflow-wrap: anywhere; }
.annotation-detail__ocr { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; }
@media (max-width: 560px) {
  .annotation-detail__facts { grid-template-columns: minmax(0, 1fr); }
}
</style>
