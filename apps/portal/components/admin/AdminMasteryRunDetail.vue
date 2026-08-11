<script setup lang="ts">
import type { AdminMasteryRunConflict, AdminMasteryRunDetail } from "~/composables/useAdminApi";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";

type ConflictAction = "keep_existing" | "invalidate_existing";

const props = defineProps<{
  detail: AdminMasteryRunDetail;
  actionLoading?: boolean;
}>();
const emit = defineEmits<{
  state: [action: "invalidate" | "restore"];
  conflict: [input: { submissionId: string; action: ConflictAction }];
}>();

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
const runStatusLabel = (value: "active" | "invalidated") => value === "active" ? "有效" : "已作废";
const acceptanceSourceLabel = (value: "submission_automatic" | "submission_review") => value === "submission_automatic" ? "自动通过" : "人工核对";
const lifecycleLabel = (value: "accepted" | "invalidated" | "restored") => ({ accepted: "已接受", invalidated: "已作废", restored: "已恢复" })[value];
const conflictFieldLabel: Record<AdminMasteryRunConflict["conflictFields"][number], string> = {
  run_code: "通关码",
  map: "地图",
  map_variant: "地图版本",
  difficulty: "难度",
  game_version: "游戏版本",
  completion_duration: "通关用时",
  deaths: "死亡次数",
  skips: "跳过次数",
  event_counters: "事件计数",
};
const eventCounters = computed(() => Object.entries(props.detail.run.eventCounters).sort(([left], [right]) => left.localeCompare(right)));
const sourceStatusLabel = computed(() => submissionStatusText[props.detail.sourceSubmission.status] ?? props.detail.sourceSubmission.status);
const sourceStatusTone = computed(() => submissionStatusTone(props.detail.sourceSubmission.status));

function sourcePath(submissionId: string) {
  return `/admin/reviews/${encodeURIComponent(submissionId)}`;
}
</script>

<template>
  <div class="mastery-run-detail" :aria-busy="actionLoading || undefined">
    <section class="mastery-run-detail__summary surface-card" aria-labelledby="mastery-run-summary-title">
      <div class="card-heading">
        <h3 id="mastery-run-summary-title">通关记录</h3>
        <StatusBadge :label="runStatusLabel(detail.run.status)" :tone="detail.run.status === 'active' ? 'success' : 'warning'" />
      </div>
      <dl class="detail-list mastery-run-detail__facts">
        <div><dt>玩家</dt><dd><NuxtLink :to="`/admin/players/${encodeURIComponent(detail.run.playerAccountId)}`">{{ detail.run.playerName }}</NuxtLink><span class="mastery-run-detail__quiet">{{ detail.run.playerId }}</span></dd></div>
        <div><dt>地图</dt><dd>{{ detail.run.mapName }}<span class="mastery-run-detail__quiet">{{ detail.run.mapId }}</span></dd></div>
        <div><dt>难度</dt><dd>{{ detail.run.difficulty }}</dd></div>
        <div><dt>通关码</dt><dd class="mastery-run-detail__code">{{ detail.run.runCode }}</dd></div>
        <div><dt>通关用时</dt><dd>{{ formatDuration(detail.run.completionDurationSeconds) }}</dd></div>
        <div><dt>死亡 / 跳过</dt><dd>{{ detail.run.deaths ?? '—' }} / {{ detail.run.skips ?? '—' }}</dd></div>
        <div><dt>接受来源</dt><dd>{{ acceptanceSourceLabel(detail.run.acceptanceSource) }}</dd></div>
        <div><dt>接受时间</dt><dd>{{ formatTime(detail.run.acceptedAt) }}</dd></div>
        <div><dt>游戏版本</dt><dd>{{ detail.run.gameVersion }}</dd></div>
        <div><dt>地图版本</dt><dd>{{ detail.run.mapVariant === 'classic' ? '经典版' : '默认' }}</dd></div>
      </dl>
      <dl v-if="detail.run.status === 'invalidated'" class="detail-list mastery-run-detail__invalidation">
        <div><dt>作废时间</dt><dd>{{ detail.run.invalidatedAt ? formatTime(detail.run.invalidatedAt) : '—' }}</dd></div>
        <div><dt>作废者</dt><dd>{{ detail.run.invalidatedBy ?? '—' }}</dd></div>
        <div><dt>理由</dt><dd>{{ detail.run.invalidationReason ?? '—' }}</dd></div>
      </dl>
      <div class="mastery-run-detail__actions">
        <UButton v-if="detail.run.status === 'active'" label="作废通关记录" color="error" variant="soft" :disabled="actionLoading" @click="emit('state', 'invalidate')" />
        <UButton v-else label="恢复通关记录" color="neutral" variant="outline" :disabled="actionLoading" @click="emit('state', 'restore')" />
      </div>
    </section>

    <section class="mastery-run-detail__section surface-card" aria-labelledby="mastery-run-source-title">
      <div class="card-heading">
        <h3 id="mastery-run-source-title">来源提交</h3>
        <StatusBadge :label="sourceStatusLabel" :tone="sourceStatusTone" />
      </div>
      <dl class="detail-list mastery-run-detail__facts">
        <div><dt>提交编号</dt><dd class="mastery-run-detail__code">{{ detail.sourceSubmission.submissionId }}</dd></div>
        <div><dt>识别状态</dt><dd><StatusBadge :label="ocrStatusLabel(detail.sourceSubmission.ocrStatus)" :tone="ocrStatusTone(detail.sourceSubmission.ocrStatus)" /></dd></div>
        <div><dt>识别次数</dt><dd>{{ detail.sourceSubmission.ocrAttempt ?? '—' }}</dd></div>
        <div><dt>截图</dt><dd><UButton :to="sourcePath(detail.sourceSubmission.submissionId)" label="查看来源提交" color="neutral" variant="outline" size="sm" /></dd></div>
      </dl>
    </section>

    <section class="mastery-run-detail__section surface-card" aria-labelledby="mastery-run-xp-title">
      <div class="card-heading"><h3 id="mastery-run-xp-title">经验规则与地图档案</h3></div>
      <div class="mastery-run-detail__split">
        <dl class="detail-list mastery-run-detail__facts">
          <div><dt>规则版本</dt><dd>{{ detail.run.xpRuleVersion }}</dd></div>
          <div><dt>基础经验</dt><dd>{{ detail.run.xpInputSnapshot.baseDifficultyXp }}</dd></div>
          <div><dt>地图系数</dt><dd>{{ detail.run.xpInputSnapshot.mapFactor }}</dd></div>
          <div><dt>表现加成</dt><dd>{{ detail.run.xpInputSnapshot.performanceBonus }}</dd></div>
          <div><dt>挑战加成</dt><dd>{{ detail.run.xpInputSnapshot.challengeBonus }}</dd></div>
          <div><dt>本局经验</dt><dd>{{ detail.run.awardedXp }}</dd></div>
        </dl>
        <dl class="detail-list mastery-run-detail__facts">
          <div><dt>累计经验</dt><dd>{{ detail.projection.totalXp }}</dd></div>
          <div><dt>有效记录</dt><dd>{{ detail.projection.verifiedRunCount }}</dd></div>
          <div><dt>最高难度</dt><dd>{{ detail.projection.highestCompletedDifficulty ?? '—' }}</dd></div>
          <div><dt>最少死亡</dt><dd>{{ detail.projection.lowestDeaths ?? '—' }}</dd></div>
          <div><dt>最少跳过</dt><dd>{{ detail.projection.fewestSkips ?? '—' }}</dd></div>
          <div><dt>单局最高经验</dt><dd>{{ detail.projection.highestSingleRunXp ?? '—' }}</dd></div>
        </dl>
      </div>
      <dl v-if="eventCounters.length" class="detail-list mastery-run-detail__event-counters">
        <div v-for="[eventId, count] in eventCounters" :key="eventId"><dt>{{ eventId }}</dt><dd>{{ count }}</dd></div>
      </dl>
    </section>

    <section class="mastery-run-detail__section surface-card" aria-labelledby="mastery-run-conflicts-title">
      <div class="card-heading">
        <h3 id="mastery-run-conflicts-title">通关码冲突</h3>
        <span class="mastery-run-detail__quiet">{{ detail.conflicts.length }} 条</span>
      </div>
      <UEmpty v-if="!detail.conflicts.length" title="暂无冲突记录" />
      <div v-else class="mastery-run-detail__conflicts">
        <article v-for="conflict in detail.conflicts" :key="conflict.submissionId" class="mastery-run-detail__conflict">
          <header class="mastery-run-detail__conflict-header">
            <div><strong>{{ conflict.playerName }}</strong><span class="mastery-run-detail__quiet">{{ conflict.submissionId }}</span></div>
            <StatusBadge :label="submissionStatusText[conflict.submissionStatus] ?? conflict.submissionStatus" :tone="submissionStatusTone(conflict.submissionStatus)" />
          </header>
          <dl class="detail-list mastery-run-detail__facts">
            <div><dt>差异字段</dt><dd>{{ conflict.conflictFields.map((field) => conflictFieldLabel[field]).join('、') }}</dd></div>
            <div><dt>地图</dt><dd>{{ conflict.facts.mapName ?? '—' }}</dd></div>
            <div><dt>难度</dt><dd>{{ conflict.facts.difficulty ?? '—' }}</dd></div>
            <div><dt>游戏版本</dt><dd>{{ conflict.facts.gameVersion ?? '—' }}</dd></div>
            <div><dt>通关用时</dt><dd>{{ conflict.facts.completionDurationSeconds ? formatDuration(conflict.facts.completionDurationSeconds) : '—' }}</dd></div>
            <div><dt>死亡 / 跳过</dt><dd>{{ conflict.facts.deaths ?? '—' }} / {{ conflict.facts.skips ?? '—' }}</dd></div>
          </dl>
          <dl v-if="conflict.resolution" class="detail-list mastery-run-detail__resolution">
            <div><dt>处理结果</dt><dd>{{ conflict.resolution.action === 'keep_existing' ? '保留原记录' : '已作废原记录' }}</dd></div>
            <div><dt>处理者</dt><dd>{{ conflict.resolution.actorId }}</dd></div>
            <div><dt>处理时间</dt><dd>{{ formatTime(conflict.resolution.resolvedAt) }}</dd></div>
            <div><dt>理由</dt><dd>{{ conflict.resolution.reason ?? '—' }}</dd></div>
          </dl>
          <div class="mastery-run-detail__conflict-actions">
            <UButton :to="sourcePath(conflict.submissionId)" label="处理冲突提交" color="neutral" variant="outline" size="sm" />
            <UButton label="保留原记录" color="neutral" variant="outline" size="sm" :disabled="actionLoading" @click="emit('conflict', { submissionId: conflict.submissionId, action: 'keep_existing' })" />
            <UButton label="作废原记录" color="error" variant="soft" size="sm" :disabled="actionLoading || detail.run.status === 'invalidated'" @click="emit('conflict', { submissionId: conflict.submissionId, action: 'invalidate_existing' })" />
          </div>
        </article>
      </div>
    </section>

    <section class="mastery-run-detail__section surface-card" aria-labelledby="mastery-run-lifecycle-title">
      <div class="card-heading"><h3 id="mastery-run-lifecycle-title">状态记录</h3></div>
      <ol class="mastery-run-detail__lifecycle">
        <li v-for="event in detail.lifecycle" :key="`${event.transition}:${event.createdAt}:${event.actorId}`">
          <strong>{{ lifecycleLabel(event.transition) }}</strong>
          <span>{{ formatTime(event.createdAt) }}</span>
          <span>{{ event.actorId }}</span>
          <span v-if="event.reason">{{ event.reason }}</span>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.mastery-run-detail { display: grid; gap: 1rem; min-width: 0; }
.mastery-run-detail__summary,
.mastery-run-detail__section { display: grid; gap: 1rem; min-width: 0; }
.mastery-run-detail__facts,
.mastery-run-detail__invalidation,
.mastery-run-detail__event-counters,
.mastery-run-detail__resolution { margin: 0; }
.mastery-run-detail__facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.mastery-run-detail__facts dd { min-width: 0; overflow-wrap: anywhere; }
.mastery-run-detail__facts a { color: var(--accent); font-weight: 650; text-decoration: none; }
.mastery-run-detail__facts a:hover,
.mastery-run-detail__facts a:focus-visible { text-decoration: underline; }
.mastery-run-detail__quiet { display: block; color: var(--quiet); font-size: .78rem; overflow-wrap: anywhere; }
.mastery-run-detail__code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.mastery-run-detail__actions,
.mastery-run-detail__conflict-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.mastery-run-detail__split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.mastery-run-detail__event-counters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.mastery-run-detail__conflicts { display: grid; gap: .75rem; }
.mastery-run-detail__conflict { display: grid; gap: .75rem; padding: .875rem; border: 1px solid var(--line); border-radius: .875rem; }
.mastery-run-detail__conflict-header { display: flex; align-items: start; justify-content: space-between; gap: .75rem; }
.mastery-run-detail__lifecycle { display: grid; gap: .5rem; margin: 0; padding-left: 1.25rem; }
.mastery-run-detail__lifecycle li { display: grid; gap: .2rem; }
.mastery-run-detail__lifecycle span { color: var(--quiet); font-size: .82rem; overflow-wrap: anywhere; }
@media (max-width: 620px) {
  .mastery-run-detail__facts,
  .mastery-run-detail__split,
  .mastery-run-detail__event-counters { grid-template-columns: 1fr; }
  .mastery-run-detail__actions > *,
  .mastery-run-detail__conflict-actions > * { flex: 1 1 100%; min-height: 2.75rem; }
}
</style>
