<script setup lang="ts">
import type { AdminVerifiedRunConflict, AdminVerifiedRunDetail } from "~/composables/useAdminApi";
import { ocrStatusLabel, ocrStatusTone } from "~/utils/ocrStatus";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";

type ConflictAction = "keep_existing" | "invalidate_existing";

const props = defineProps<{
  detail: AdminVerifiedRunDetail;
  actionLoading?: boolean;
}>();
const emit = defineEmits<{
  correct: [];
  state: [action: "invalidate" | "restore"];
  conflict: [input: { submissionId: string; action: ConflictAction }];
}>();

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const NONE = "暂无记录";
const deathsSkips = (deaths: number | null | undefined, skips: number | null | undefined) => deaths == null && skips == null ? NONE : `${deaths ?? NONE} / ${skips ?? NONE}`;
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
const runStatusLabel = (value: "active" | "invalidated") => value === "active" ? "有效" : "已作废";
const acceptanceSourceLabel = (value: "submission_automatic" | "submission_review") => value === "submission_automatic" ? "自动通过" : "人工核对";
const lifecycleLabel = (value: "accepted" | "invalidated" | "restored") => ({ accepted: "已接受", invalidated: "已作废", restored: "已恢复" })[value];
const conflictFieldLabel: Record<AdminVerifiedRunConflict["conflictFields"][number], string> = {
  match_code: "通关码",
  map: "地图",
  gameplay_revision: "玩法修订",
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
  <div class="verified-run-detail" :aria-busy="actionLoading || undefined">
    <section class="verified-run-detail__summary" aria-labelledby="verified-run-summary-title">
      <div class="card-heading">
        <h3 id="verified-run-summary-title">通关记录</h3>
        <StatusBadge :label="runStatusLabel(detail.run.status)" :tone="detail.run.status === 'active' ? 'success' : 'warning'" />
      </div>
      <dl class="detail-grid verified-run-detail__facts">
        <div class="detail-grid__row"><dt>玩家</dt><dd><NuxtLink :to="`/admin/players/${encodeURIComponent(detail.run.playerAccountId)}`">{{ detail.run.playerName }}</NuxtLink><span class="verified-run-detail__quiet">{{ detail.run.playerId }}</span></dd></div>
        <div class="detail-grid__row"><dt>地图</dt><dd>{{ detail.run.mapName }}<span class="verified-run-detail__quiet">{{ detail.run.mapId }}</span></dd></div>
        <div class="detail-grid__row"><dt>难度</dt><dd>{{ detail.run.difficulty }}</dd></div>
        <div class="detail-grid__row"><dt>通关码</dt><dd class="verified-run-detail__code">{{ detail.run.matchCode }}</dd></div>
        <div class="detail-grid__row"><dt>通关用时</dt><dd>{{ formatDuration(detail.run.completionDurationSeconds) }}</dd></div>
        <div class="detail-grid__row"><dt>死亡 / 跳过</dt><dd :class="{ 'detail-grid__empty': detail.run.deaths == null && detail.run.skips == null }">{{ deathsSkips(detail.run.deaths, detail.run.skips) }}</dd></div>
        <div class="detail-grid__row"><dt>接受来源</dt><dd>{{ acceptanceSourceLabel(detail.run.acceptanceSource) }}</dd></div>
        <div class="detail-grid__row"><dt>接受时间</dt><dd>{{ formatTime(detail.run.acceptedAt) }}</dd></div>
        <div class="detail-grid__row"><dt>游戏版本</dt><dd>{{ detail.run.gameVersion }}</dd></div>
        <div class="detail-grid__row"><dt>地图版本</dt><dd>{{ detail.run.mapVariant === 'classic' ? '经典版' : '默认' }}</dd></div>
      </dl>
      <dl v-if="detail.run.status === 'invalidated'" class="detail-grid verified-run-detail__invalidation">
        <div class="detail-grid__row"><dt>作废时间</dt><dd :class="{ 'detail-grid__empty': !detail.run.invalidatedAt }">{{ detail.run.invalidatedAt ? formatTime(detail.run.invalidatedAt) : NONE }}</dd></div>
        <div class="detail-grid__row"><dt>作废者</dt><dd :class="{ 'detail-grid__empty': detail.run.invalidatedBy == null }">{{ detail.run.invalidatedBy ?? NONE }}</dd></div>
        <div class="detail-grid__row"><dt>理由</dt><dd :class="{ 'detail-grid__empty': detail.run.invalidationReason == null }">{{ detail.run.invalidationReason ?? NONE }}</dd></div>
      </dl>
      <div class="verified-run-detail__actions">
        <UButton label="更正记录事实" color="primary" variant="outline" :disabled="actionLoading" @click="emit('correct')" />
        <UButton v-if="detail.run.status === 'active'" label="作废通关记录" color="error" variant="soft" :disabled="actionLoading" @click="emit('state', 'invalidate')" />
        <UButton v-else label="恢复通关记录" color="neutral" variant="outline" :disabled="actionLoading" @click="emit('state', 'restore')" />
      </div>
    </section>

    <section class="verified-run-detail__section" aria-labelledby="verified-run-source-title">
      <div class="card-heading">
        <h3 id="verified-run-source-title">来源提交</h3>
        <StatusBadge :label="sourceStatusLabel" :tone="sourceStatusTone" />
      </div>
      <dl class="detail-grid verified-run-detail__facts">
        <div class="detail-grid__row"><dt>提交编号</dt><dd class="verified-run-detail__code">{{ detail.sourceSubmission.submissionId }}</dd></div>
        <div class="detail-grid__row"><dt>识别状态</dt><dd><StatusBadge :label="ocrStatusLabel(detail.sourceSubmission.ocrStatus)" :tone="ocrStatusTone(detail.sourceSubmission.ocrStatus)" /></dd></div>
        <div class="detail-grid__row"><dt>识别次数</dt><dd :class="{ 'detail-grid__empty': detail.sourceSubmission.ocrAttempt == null }">{{ detail.sourceSubmission.ocrAttempt ?? NONE }}</dd></div>
      </dl>
      <div class="verified-run-detail__actions">
        <UButton :to="sourcePath(detail.sourceSubmission.submissionId)" label="查看来源提交" color="neutral" variant="outline" size="sm" />
      </div>
    </section>

    <section class="verified-run-detail__section" aria-labelledby="verified-run-xp-title">
      <div class="card-heading"><h3 id="verified-run-xp-title">经验规则与地图档案</h3></div>
      <div class="verified-run-detail__split">
        <dl class="detail-grid verified-run-detail__facts">
          <div class="detail-grid__row"><dt>规则版本</dt><dd>{{ detail.run.xpRuleVersion }}</dd></div>
          <div class="detail-grid__row"><dt>基础经验</dt><dd>{{ detail.run.xpInputSnapshot.baseDifficultyXp }}</dd></div>
          <div class="detail-grid__row"><dt>地图系数</dt><dd>{{ detail.run.xpInputSnapshot.mapFactor }}</dd></div>
          <div class="detail-grid__row"><dt>表现加成</dt><dd>{{ detail.run.xpInputSnapshot.performanceBonus }}</dd></div>
          <div v-if="detail.run.xpInputSnapshot.ruleVersion === 'v1'" class="detail-grid__row"><dt>历史挑战加成</dt><dd>{{ detail.run.xpInputSnapshot.challengeBonus }}</dd></div>
          <div class="detail-grid__row"><dt>本局经验</dt><dd>{{ detail.run.awardedXp }}</dd></div>
        </dl>
        <dl class="detail-grid verified-run-detail__facts">
          <div class="detail-grid__row"><dt>累计经验</dt><dd>{{ detail.projection.totalXp }}</dd></div>
          <div class="detail-grid__row"><dt>有效记录</dt><dd>{{ detail.projection.verifiedRunCount }}</dd></div>
          <div class="detail-grid__row"><dt>最高难度</dt><dd :class="{ 'detail-grid__empty': detail.projection.highestCompletedDifficulty == null }">{{ detail.projection.highestCompletedDifficulty ?? NONE }}</dd></div>
          <div class="detail-grid__row"><dt>最少死亡</dt><dd :class="{ 'detail-grid__empty': detail.projection.lowestDeaths == null }">{{ detail.projection.lowestDeaths ?? NONE }}</dd></div>
          <div class="detail-grid__row"><dt>最少跳过</dt><dd :class="{ 'detail-grid__empty': detail.projection.fewestSkips == null }">{{ detail.projection.fewestSkips ?? NONE }}</dd></div>
          <div class="detail-grid__row"><dt>单局最高经验</dt><dd :class="{ 'detail-grid__empty': detail.projection.highestSingleRunXp == null }">{{ detail.projection.highestSingleRunXp ?? NONE }}</dd></div>
        </dl>
      </div>
      <dl v-if="eventCounters.length" class="detail-grid verified-run-detail__event-counters">
        <div v-for="[eventId, count] in eventCounters" :key="eventId" class="detail-grid__row"><dt>{{ eventId }}</dt><dd>{{ count }}</dd></div>
      </dl>
    </section>

    <section v-if="detail.corrections.length" class="verified-run-detail__section" aria-labelledby="verified-run-corrections-title">
      <div class="card-heading">
        <h3 id="verified-run-corrections-title">事实更正历史</h3>
        <span class="verified-run-detail__quiet">{{ detail.corrections.length }} 条</span>
      </div>
      <ol class="verified-run-detail__history">
        <li v-for="correction in detail.corrections" :key="correction.correctionId">
          <div class="card-heading"><strong>{{ formatTime(correction.createdAt) }}</strong><span class="verified-run-detail__quiet">{{ correction.actorId }}</span></div>
          <p v-if="correction.reason" class="verified-run-detail__quiet">{{ correction.reason }}</p>
          <p>{{ correction.before.mapId }} / {{ correction.before.gameplayRevisionId }} → {{ correction.after.mapId }} / {{ correction.after.gameplayRevisionId }}</p>
          <p>{{ correction.before.difficulty }} · {{ correction.before.matchCode }} · {{ correction.before.awardedXp }} XP → {{ correction.after.difficulty }} · {{ correction.after.matchCode }} · {{ correction.after.awardedXp }} XP ({{ correction.after.xpRuleVersion }})</p>
        </li>
      </ol>
    </section>

    <section class="verified-run-detail__section" aria-labelledby="verified-run-conflicts-title">
      <div class="card-heading">
        <h3 id="verified-run-conflicts-title">通关码冲突</h3>
        <span class="verified-run-detail__quiet">{{ detail.conflicts.length }} 条</span>
      </div>
      <UEmpty v-if="!detail.conflicts.length" title="暂无冲突记录" />
      <div v-else class="verified-run-detail__conflicts">
        <article v-for="conflict in detail.conflicts" :key="conflict.submissionId" class="verified-run-detail__conflict">
          <header class="verified-run-detail__conflict-header">
            <div><strong>{{ conflict.playerName }}</strong><span class="verified-run-detail__quiet">{{ conflict.submissionId }}</span></div>
            <StatusBadge :label="submissionStatusText[conflict.submissionStatus] ?? conflict.submissionStatus" :tone="submissionStatusTone(conflict.submissionStatus)" />
          </header>
          <dl class="detail-grid verified-run-detail__facts">
            <div class="detail-grid__row"><dt>差异字段</dt><dd>{{ conflict.conflictFields.map((field) => conflictFieldLabel[field]).join('、') }}</dd></div>
            <div class="detail-grid__row"><dt>地图</dt><dd :class="{ 'detail-grid__empty': conflict.facts.mapName == null }">{{ conflict.facts.mapName ?? NONE }}</dd></div>
            <div class="detail-grid__row"><dt>难度</dt><dd :class="{ 'detail-grid__empty': conflict.facts.difficulty == null }">{{ conflict.facts.difficulty ?? NONE }}</dd></div>
            <div class="detail-grid__row"><dt>游戏版本</dt><dd :class="{ 'detail-grid__empty': conflict.facts.gameVersion == null }">{{ conflict.facts.gameVersion ?? NONE }}</dd></div>
            <div class="detail-grid__row"><dt>通关用时</dt><dd :class="{ 'detail-grid__empty': !conflict.facts.completionDurationSeconds }">{{ conflict.facts.completionDurationSeconds ? formatDuration(conflict.facts.completionDurationSeconds) : NONE }}</dd></div>
            <div class="detail-grid__row"><dt>死亡 / 跳过</dt><dd :class="{ 'detail-grid__empty': conflict.facts.deaths == null && conflict.facts.skips == null }">{{ deathsSkips(conflict.facts.deaths, conflict.facts.skips) }}</dd></div>
          </dl>
          <dl v-if="conflict.resolution" class="detail-grid verified-run-detail__resolution">
            <div class="detail-grid__row"><dt>处理结果</dt><dd>{{ conflict.resolution.action === 'keep_existing' ? '保留原记录' : '已作废原记录' }}</dd></div>
            <div class="detail-grid__row"><dt>处理者</dt><dd>{{ conflict.resolution.actorId }}</dd></div>
            <div class="detail-grid__row"><dt>处理时间</dt><dd>{{ formatTime(conflict.resolution.resolvedAt) }}</dd></div>
            <div class="detail-grid__row"><dt>理由</dt><dd :class="{ 'detail-grid__empty': conflict.resolution.reason == null }">{{ conflict.resolution.reason ?? NONE }}</dd></div>
          </dl>
          <div class="verified-run-detail__conflict-actions">
            <UButton :to="sourcePath(conflict.submissionId)" label="处理冲突提交" color="neutral" variant="outline" size="sm" />
            <UButton label="保留原记录" color="neutral" variant="outline" size="sm" :disabled="actionLoading" @click="emit('conflict', { submissionId: conflict.submissionId, action: 'keep_existing' })" />
            <UButton label="作废原记录" color="error" variant="soft" size="sm" :disabled="actionLoading || detail.run.status === 'invalidated'" @click="emit('conflict', { submissionId: conflict.submissionId, action: 'invalidate_existing' })" />
          </div>
        </article>
      </div>
    </section>

    <section class="verified-run-detail__section" aria-labelledby="verified-run-lifecycle-title">
      <div class="card-heading"><h3 id="verified-run-lifecycle-title">状态记录</h3></div>
      <ol class="verified-run-detail__lifecycle">
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
.verified-run-detail { container-type: inline-size; display: grid; gap: 1rem; min-width: 0; }
.verified-run-detail__summary,
.verified-run-detail__section { display: grid; gap: 1rem; min-width: 0; }
.verified-run-detail__facts,
.verified-run-detail__invalidation,
.verified-run-detail__event-counters,
.verified-run-detail__resolution { margin: 0; }
.verified-run-detail__history { display: grid; gap: .75rem; margin: 0; padding-left: 1.25rem; }
.verified-run-detail__history li { display: grid; gap: .25rem; }
.verified-run-detail__history p { margin: 0; }
.verified-run-detail__facts a { color: var(--accent); font-weight: 600; text-decoration: none; }
.verified-run-detail__facts a:hover,
.verified-run-detail__facts a:focus-visible { text-decoration: underline; }
.verified-run-detail__quiet { display: block; color: var(--quiet); font-size: .78rem; overflow-wrap: anywhere; }
.verified-run-detail__code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.verified-run-detail__actions,
.verified-run-detail__conflict-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.verified-run-detail__split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.verified-run-detail__conflicts { display: grid; gap: .75rem; }
.verified-run-detail__conflict { display: grid; gap: .75rem; padding: .875rem; border: 1px solid var(--line); border-radius: var(--radius-control); }
.verified-run-detail__conflict-header { display: flex; align-items: start; justify-content: space-between; gap: .75rem; }
.verified-run-detail__lifecycle { display: grid; gap: .5rem; margin: 0; padding-left: 1.25rem; }
.verified-run-detail__lifecycle li { display: grid; gap: .2rem; }
.verified-run-detail__lifecycle span { color: var(--quiet); font-size: .82rem; overflow-wrap: anywhere; }
@container (max-width: 23.99rem) {
  .verified-run-detail__split { grid-template-columns: 1fr; }
  .verified-run-detail__actions > *,
  .verified-run-detail__conflict-actions > * { flex: 1 1 100%; min-height: 2.75rem; justify-content: center; }
}
</style>
