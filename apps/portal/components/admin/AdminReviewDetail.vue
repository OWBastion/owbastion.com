<script setup lang="ts">
import type { AdminReviewDetail } from "~/composables/useAdminApi";

defineProps<{ detail: AdminReviewDetail }>();
const emit = defineEmits<{ moderate: [action: "hide-comment" | "restore-comment" | "invalidate" | "restore"] }>();
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const targetTypeLabel = (value: "event" | "map") => value === "event" ? "随机事件" : "地图";
const statusLabel = (value: AdminReviewDetail["review"]["status"]) => value === "active" ? "有效" : value === "withdrawn" ? "已撤回" : "已失效";
const commentStatusLabel = (value: AdminReviewDetail["review"]["commentStatus"]) => value === "visible" ? "公开" : "已隐藏";
</script>

<template>
  <div class="review-detail">
    <section class="review-detail__section" aria-labelledby="review-context-heading">
      <h2 id="review-context-heading">评价内容</h2>
      <dl class="review-detail__facts">
        <div><dt>目标</dt><dd><strong>{{ detail.review.targetName }}</strong><span class="table-meta">{{ targetTypeLabel(detail.review.targetType) }} · {{ detail.review.targetId }}</span></dd></div>
        <div><dt>评分</dt><dd aria-label="评分">{{ "★".repeat(detail.review.rating) }}<span class="table-meta">{{ detail.review.rating }} / 5</span></dd></div>
        <div><dt>评价状态</dt><dd><StatusBadge :label="statusLabel(detail.review.status)" :tone="detail.review.status === 'active' ? 'success' : detail.review.status === 'invalidated' ? 'warning' : 'default'" /></dd></div>
        <div><dt>评论状态</dt><dd><StatusBadge :label="commentStatusLabel(detail.review.commentStatus)" :tone="detail.review.commentStatus === 'visible' ? 'success' : 'warning'" /></dd></div>
        <div><dt>提交时间</dt><dd>{{ formatTime(detail.review.createdAt) }}</dd></div>
        <div><dt>公开匿名</dt><dd>{{ detail.review.anonymous ? "是" : "否" }}<span class="table-meta">维护者仍可查看真实身份</span></dd></div>
      </dl>
      <blockquote v-if="detail.review.comment" class="review-detail__comment">{{ detail.review.comment }}</blockquote>
      <p v-else class="review-detail__muted">未填写评论。</p>
    </section>

    <section class="review-detail__section" aria-labelledby="review-player-heading">
      <h2 id="review-player-heading">提交玩家</h2>
      <dl class="review-detail__facts review-detail__facts--player">
        <div><dt>玩家</dt><dd><strong>{{ detail.review.playerName }}</strong><span class="table-meta">战网 ID：{{ detail.review.playerId }}</span></dd></div>
        <div><dt>账号记录</dt><dd class="review-detail__id">{{ detail.review.playerAccountId }}</dd></div>
      </dl>
    </section>

    <section class="review-detail__section" aria-labelledby="review-audit-heading">
      <h2 id="review-audit-heading">审计记录</h2>
      <ol v-if="detail.audit.length" class="review-detail__audit">
        <li v-for="entry in detail.audit" :key="`${entry.operation}-${entry.createdAt}-${entry.actorId}`">
          <div><strong>{{ entry.operation }}</strong><span class="table-meta">{{ formatTime(entry.createdAt) }} · {{ entry.actorType }}：{{ entry.actorId }}</span></div>
          <span v-if="entry.reason" class="table-meta">理由：{{ entry.reason }}</span>
        </li>
      </ol>
      <p v-else class="review-detail__muted">暂无审计记录。</p>
    </section>

    <div class="review-detail__actions" role="group" aria-label="评价操作">
      <UButton v-if="detail.review.comment && detail.review.commentStatus === 'visible'" label="隐藏评论" color="warning" variant="outline" @click="emit('moderate', 'hide-comment')" />
      <UButton v-if="detail.review.comment && detail.review.commentStatus === 'hidden'" label="恢复评论" color="neutral" variant="outline" @click="emit('moderate', 'restore-comment')" />
      <UButton v-if="detail.review.status !== 'invalidated'" label="使评价失效" color="error" variant="outline" @click="emit('moderate', 'invalidate')" />
      <UButton v-else label="恢复评价" color="success" variant="outline" @click="emit('moderate', 'restore')" />
    </div>
  </div>
</template>

<style scoped>
.review-detail { display: grid; gap: 22px; }
.review-detail__section { display: grid; gap: 12px; }
.review-detail__section h2 { margin: 0; font-size: 1rem; font-weight: 720; }
.review-detail__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }
.review-detail__facts > div { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.review-detail__facts dt { color: var(--quiet); font-size: .74rem; font-weight: 700; }
.review-detail__facts dd { display: grid; gap: 4px; margin: 6px 0 0; min-width: 0; overflow-wrap: anywhere; }
.table-meta { display: block; color: var(--quiet); font-size: .78rem; }
.review-detail__comment { margin: 0; padding: 14px 16px; border-inline-start: 3px solid var(--accent); border-radius: 0 10px 10px 0; background: var(--accent-surface); white-space: pre-wrap; overflow-wrap: anywhere; }
.review-detail__muted { margin: 0; color: var(--quiet); }
.review-detail__id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem; }
.review-detail__audit { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.review-detail__audit li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; overflow-wrap: anywhere; }
.review-detail__audit li > div { display: grid; gap: 4px; }
.review-detail__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 4px; }
@media (max-width: 620px) { .review-detail__facts { grid-template-columns: 1fr; }.review-detail__audit li { display: grid; }.review-detail__actions { justify-content: stretch; }.review-detail__actions > * { flex: 1 1 100%; min-height: 44px; } }
</style>
