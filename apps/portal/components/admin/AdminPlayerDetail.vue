<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";

const props = defineProps<{ player: AdminPlayerDetail; loading?: boolean }>();
const emit = defineEmits<{ setStatus: [status: "active" | "banned"]; unbind: [bindingId: string]; grantCompleted: [] }>();
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const battleTag = computed(() => `${props.player.playerName}#${props.player.playerId}`);
const initials = computed(() => props.player.playerName.slice(0, 2));
const statusLabel = computed(() => props.player.status === "active" ? "正常" : "已封禁");
const submissionStatusLabels: Record<string, string> = {
  received: "已收到",
  evidence_pending: "保存截图中",
  evidence_stored: "截图已保存",
  upload_pending: "上传中",
  ocr_pending: "等待识别",
  ready_for_review: "等待核对",
  ocr_review_required: "等待处理",
  approved: "已通过",
  rejected: "未通过",
  resubmission_required: "需要重新提交",
};
const submissionStatusTone = (status: string) => status === "approved" || status === "ready_for_review" ? "success" : status === "rejected" || status === "resubmission_required" || status === "ocr_review_required" ? "warning" : "default";
const submissionStatusLabel = (status: string) => submissionStatusLabels[status] ?? status;
</script>

<template>
  <section class="player-detail" aria-label="玩家详情">
    <nav class="detail-tabs glass elevation-1" aria-label="玩家详情分区">
      <a class="detail-tab detail-tab--active" href="#overview">概览</a>
      <a class="detail-tab" href="#titles">成就与称号</a>
      <a class="detail-tab" href="#submissions">最近提交</a>
    </nav>

    <section id="overview" class="identity-card" aria-labelledby="player-identity-title">
      <div class="identity-card__main">
        <div class="identity-avatar" aria-hidden="true">{{ initials }}</div>
        <div class="identity-card__copy">
          <p class="eyebrow">平台玩家</p>
          <h2 id="player-identity-title">{{ battleTag }}</h2>
          <p class="identity-card__id">账号 ID · {{ props.player.playerAccountId }}</p>
        </div>
      </div>
      <div class="identity-card__actions">
        <StatusBadge :label="statusLabel" :tone="props.player.status === 'active' ? 'success' : 'warning'" />
        <UButton :label="props.player.status === 'active' ? '封禁玩家' : '解除封禁'" :color="props.player.status === 'active' ? 'error' : 'primary'" :loading="props.loading" @click="emit('setStatus', props.player.status === 'active' ? 'banned' : 'active')" />
      </div>
      <div class="identity-card__metrics" aria-label="玩家概览">
        <div><span>QQ 绑定</span><strong>{{ props.player.bindings.length }}</strong></div>
        <div><span>有效称号</span><strong>{{ props.player.titleGrants.length }}</strong></div>
        <div><span>最近提交</span><strong>{{ props.player.recentSubmissions.length }}</strong></div>
        <div><span>最近更新</span><strong>{{ formatTime(props.player.updatedAt) }}</strong></div>
      </div>
    </section>

    <div class="detail-grid">
      <section class="detail-card" aria-labelledby="account-info-title">
        <div class="card-heading"><div><p class="card-kicker">Identity</p><h3 id="account-info-title">账号信息</h3></div><span class="card-icon" aria-hidden="true">⌘</span></div>
        <dl class="info-grid">
          <div><dt>玩家名称</dt><dd>{{ props.player.playerName }}</dd></div>
          <div><dt>玩家 ID</dt><dd>{{ props.player.playerId }}</dd></div>
          <div class="info-grid__wide"><dt>平台账号 ID</dt><dd class="mono">{{ props.player.playerAccountId }}</dd></div>
          <div class="info-grid__wide"><dt>最近更新</dt><dd>{{ formatTime(props.player.updatedAt) }}</dd></div>
        </dl>
      </section>

      <section class="detail-card" aria-labelledby="bindings-title">
        <div class="card-heading"><div><p class="card-kicker">Connections</p><h3 id="bindings-title">QQ 绑定</h3></div><UBadge :label="`${props.player.bindings.length} 条`" color="neutral" variant="subtle" /></div>
        <div v-if="props.player.bindings.length" class="detail-list">
          <div v-for="binding in props.player.bindings" :key="binding.bindingId" class="detail-list__item">
            <div class="detail-list__copy"><strong>{{ binding.groupOpenId }}</strong><small>{{ binding.memberOpenId }}</small></div>
            <UButton label="解绑" color="neutral" variant="link" :disabled="props.loading" @click="emit('unbind', binding.bindingId)" />
          </div>
        </div>
        <UEmpty v-else title="暂无 QQ 绑定" variant="naked" />
      </section>

      <section id="submissions" class="detail-card detail-card--wide" aria-labelledby="submissions-title">
        <div class="card-heading"><div><p class="card-kicker">Activity</p><h3 id="submissions-title">最近提交</h3></div><UBadge :label="`${props.player.recentSubmissions.length} 条`" color="neutral" variant="subtle" /></div>
        <div v-if="props.player.recentSubmissions.length" class="submission-list">
          <div v-for="submission in props.player.recentSubmissions" :key="submission.submissionId" class="submission-row">
            <div class="submission-row__map"><strong>{{ submission.mapName }}</strong><small>{{ submission.submissionId }}</small></div>
            <StatusBadge :label="submissionStatusLabel(submission.status)" :tone="submissionStatusTone(submission.status)" />
            <time :datetime="new Date(submission.updatedAt).toISOString()">{{ formatTime(submission.updatedAt) }}</time>
          </div>
        </div>
        <UEmpty v-else title="暂无提交记录" variant="naked" />
      </section>

      <AdminPlayerTitles id="titles" class="detail-card detail-card--wide" :player-account-id="props.player.playerAccountId" :title-grants="props.player.titleGrants" :loading="props.loading" @granted="emit('grantCompleted')" />
    </div>
  </section>
</template>

<style scoped>
.player-detail { display: grid; gap: 16px; max-width: 1180px; scroll-behavior: smooth; }
.detail-tabs { position: sticky; z-index: 3; top: 12px; display: flex; gap: 5px; width: fit-content; max-width: 100%; padding: 5px; overflow-x: auto; border: 1px solid color-mix(in oklch, var(--line) 76%, transparent); border-radius: 14px; }
.detail-tab { flex: 0 0 auto; padding: 8px 13px; border-radius: 10px; color: var(--muted); font-size: .78rem; font-weight: 650; text-decoration: none; transition: color 160ms ease, background 160ms ease, transform 100ms ease; }.detail-tab:hover, .detail-tab:focus-visible { color: var(--text); background: color-mix(in oklch, var(--surface) 72%, transparent); }.detail-tab--active { color: var(--on-accent); background: var(--accent); }.detail-tab:active { transform: scale(.97); }
.identity-card, .detail-card { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); box-shadow: 0 14px 36px color-mix(in oklch, var(--text) 5%, transparent); }
.identity-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 22px; padding: clamp(20px, 3vw, 30px); }.identity-card__main { display: flex; min-width: 0; align-items: center; gap: 16px; }.identity-avatar { display: grid; flex: 0 0 auto; width: 68px; height: 68px; place-items: center; border: 1px solid color-mix(in oklch, var(--accent) 24%, var(--line)); border-radius: 50%; color: var(--accent); background: var(--accent-surface); font-size: 1.25rem; font-weight: 750; letter-spacing: -.08em; }.identity-card__copy { min-width: 0; }.identity-card__copy .eyebrow { margin-bottom: 5px; }.identity-card h2 { margin: 0; overflow-wrap: anywhere; font-size: clamp(1.45rem, 3vw, 2rem); letter-spacing: -.055em; line-height: 1.05; }.identity-card__id { margin: 7px 0 0; overflow-wrap: anywhere; color: var(--quiet); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .72rem; }.identity-card__actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }.identity-card__metrics { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); padding-top: 18px; border-top: 1px solid var(--line); }.identity-card__metrics div { display: grid; gap: 5px; padding-inline: 15px; border-right: 1px solid var(--line); }.identity-card__metrics div:first-child { padding-left: 0; }.identity-card__metrics div:last-child { padding-right: 0; border-right: 0; }.identity-card__metrics span, .card-kicker { color: var(--quiet); font-size: .68rem; font-weight: 700; letter-spacing: .055em; text-transform: uppercase; }.identity-card__metrics strong { font-size: .86rem; font-weight: 680; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }.detail-card { min-width: 0; padding: clamp(18px, 2.4vw, 26px); scroll-margin-top: 92px; }.detail-card--wide { grid-column: 1 / -1; }.card-heading { display: flex; align-items: start; justify-content: space-between; gap: 14px; padding-bottom: 15px; border-bottom: 1px solid var(--line); }.card-kicker { margin: 0 0 5px; }.card-heading h3 { margin: 0; font-size: 1.08rem; letter-spacing: -.025em; }.card-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 9px; color: var(--accent); background: var(--accent-surface); font-size: .82rem; font-weight: 750; }.info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 24px; margin: 20px 0 0; }.info-grid div { min-width: 0; }.info-grid__wide { grid-column: 1 / -1; }.info-grid dt { color: var(--quiet); font-size: .72rem; }.info-grid dd { margin: 5px 0 0; overflow-wrap: anywhere; font-size: .86rem; font-weight: 650; }.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem !important; }
.detail-list, .submission-list { display: grid; gap: 9px; margin-top: 18px; }.detail-list__item, .submission-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--line); }.detail-list__item:last-child, .submission-row:last-child { border-bottom: 0; }.detail-list__copy, .submission-row__map { min-width: 0; }.detail-list strong, .detail-list small, .submission-row strong, .submission-row small { display: block; overflow-wrap: anywhere; }.detail-list strong, .submission-row strong { font-size: .84rem; }.detail-list small, .submission-row small, .submission-row time { margin-top: 4px; color: var(--quiet); font-size: .72rem; }.submission-row time { flex: 0 0 auto; margin-top: 0; }.submission-row :deep(.status-badge) { flex: 0 0 auto; }
@media (max-width: 760px) { .identity-card { grid-template-columns: 1fr; }.identity-card__actions { justify-content: flex-start; }.detail-grid { grid-template-columns: 1fr; }.detail-card--wide { grid-column: auto; } }
@media (max-width: 520px) { .detail-tabs { position: static; width: 100%; }.identity-card__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 0; }.identity-card__metrics div:nth-child(2) { border-right: 0; }.identity-card__metrics div:nth-child(3) { padding-left: 0; }.identity-card__metrics div:nth-child(-n+2) { padding-bottom: 12px; border-bottom: 1px solid var(--line); }.identity-card__metrics div:nth-child(4) { padding-right: 0; }.submission-row { align-items: flex-start; flex-wrap: wrap; }.submission-row time { width: 100%; margin-top: -4px; } }

@media (prefers-reduced-motion: reduce) { .detail-tab { transition: color 160ms ease, background 160ms ease; }.detail-tab:active { transform: none; } }
@media (prefers-contrast: more) { .detail-tabs, .identity-card, .detail-card { border-color: var(--line-strong); } }
</style>
