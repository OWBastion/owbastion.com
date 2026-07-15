<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";
import type { AdminGroup, AdminPlayer, AdminPlayerDetail, AdminSubmission } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "管理后台 · 躲避堡垒 3" });
const api = useAdminApi();
const players = ref<AdminPlayer[]>([]);
const groups = ref<AdminGroup[]>([]);
const submissions = ref<AdminSubmission[]>([]);
const selectedSubmission = ref<AdminSubmission | null>(null);
const selected = ref<AdminPlayerDetail | null>(null);
const query = ref("");
const status = ref<"all" | "active" | "banned">("all");
const loading = ref(true);
const errorMessage = ref("");
const actionMessage = ref("");
const page = ref(1);
const hasMore = ref(false);
const playerTrigger = ref<HTMLElement | null>(null);
const submissionTrigger = ref<HTMLElement | null>(null);
const playerSheet = ref<HTMLElement | null>(null);
const submissionSheet = ref<HTMLElement | null>(null);
const playerCloseButton = ref<HTMLButtonElement | null>(null);
const submissionCloseButton = ref<HTMLButtonElement | null>(null);

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatBattleTag = (player: { playerName: string; playerId: string }) => `${player.playerName}#${player.playerId}`;
const formatSubmissionStatus = (status: string) => submissionStatusText[status] ?? status;
const load = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [playerResponse, groupResponse, submissionResponse] = await Promise.all([
      api<{ items: AdminPlayer[]; hasMore: boolean }>(`/v1/player-accounts?query=${encodeURIComponent(query.value)}&page=${page.value}&pageSize=20${status.value === "all" ? "" : `&status=${status.value}`}`),
      api<{ items: AdminGroup[] }>("/v1/qq/groups"),
      api<{ items: AdminSubmission[] }>("/v1/submissions?status=ready_for_review"),
    ]);
    players.value = playerResponse.items;
    hasMore.value = playerResponse.hasMore;
    groups.value = groupResponse.items;
    submissions.value = submissionResponse.items;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取管理数据，请确认当前账号有管理员权限。";
  } finally { loading.value = false; }
};
const openSubmission = async (submission: AdminSubmission, trigger: EventTarget | null) => {
  submissionTrigger.value = trigger instanceof HTMLElement ? trigger : null;
  selectedSubmission.value = await api<AdminSubmission>(`/v1/submissions/${submission.submissionId}`);
};
const review = async (decision: "approved" | "rejected" | "resubmission_required") => {
  if (!selectedSubmission.value) return;
  const reason = window.prompt("请输入处理说明")?.trim();
  if (!reason) return;
  await api(`/v1/submissions/${selectedSubmission.value.submissionId}/review`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", decision, reason } });
  closeDetail();
  await load();
};
const openPlayer = async (player: AdminPlayer, trigger: EventTarget | null) => {
  playerTrigger.value = trigger instanceof HTMLElement ? trigger : null;
  selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${player.playerAccountId}`);
};
const setStatus = async (next: "active" | "banned") => {
  if (!selected.value) return;
  const reason = next === "banned" ? window.prompt("请输入封禁原因（可选）") ?? "" : undefined;
  if (next === "banned" && !window.confirm(`确认封禁玩家“${formatBattleTag(selected.value)}”？`)) return;
  actionMessage.value = "保存中…";
  await api(`/v1/player-accounts/${selected.value.playerAccountId}/status`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", status: next, ...(reason ? { reason } : {}) } });
  actionMessage.value = next === "banned" ? "玩家已封禁" : "玩家已解封";
  selected.value.status = next;
  await load();
};
const unbind = async (bindingId: string) => {
  if (!window.confirm("解除这条 QQ 绑定？历史提交会保留。")) return;
  actionMessage.value = "解除绑定中…";
  await api(`/v1/bindings/${bindingId}`, { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } });
  actionMessage.value = "QQ 绑定已解除";
  if (selected.value) selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${selected.value.playerAccountId}`);
  await load();
};
const setGroup = async (group: AdminGroup) => {
  const enabled = !group.enabled;
  group.enabled = enabled;
  try {
    await api(`/v1/qq/groups/${encodeURIComponent(group.groupOpenId)}`, { method: "PUT", body: { contractVersion: "1", groupOpenId: group.groupOpenId, environment: group.environment, enabled } });
    actionMessage.value = enabled ? "群已开放" : "群已关闭";
  } catch (error) { group.enabled = !enabled; throw error; }
};
watch([query, status], () => { page.value = 1; void load(); });
function closeDetail() {
  const trigger = selectedSubmission.value ? submissionTrigger.value : playerTrigger.value;
  selectedSubmission.value = null;
  selected.value = null;
  void nextTick(() => trigger?.focus());
}
function trapFocus(event: KeyboardEvent, sheet: HTMLElement) {
  const focusable = Array.from(sheet.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) return;
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && (selected.value || selectedSubmission.value)) { closeDetail(); return; }
  if (event.key === "Tab") {
    const sheet = selectedSubmission.value ? submissionSheet.value : playerSheet.value;
    if (sheet) trapFocus(event, sheet);
  }
}
watch(selectedSubmission, (submission) => { if (submission) void nextTick(() => submissionCloseButton.value?.focus()); });
watch(selected, (player) => { if (player) void nextTick(() => playerCloseButton.value?.focus()); });
onMounted(() => { void load(); document.addEventListener("keydown", handleKeydown); });
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <main class="admin-page page-shell">
    <section class="admin-intro"><p class="eyebrow">运营控制台</p><h1 class="page-title">管理后台</h1><p class="body-copy">管理玩家身份与 QQ 群访问。写操作记录在审计日志中。</p><div class="admin-links"><NuxtLink class="secondary-button" to="/admin/achievements">成就管理</NuxtLink><NuxtLink class="secondary-button" to="/admin/titles">称号迁移</NuxtLink></div></section>
    <p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p>
    <p v-if="actionMessage" class="admin-feedback" role="status">{{ actionMessage }}</p>
    <section class="admin-grid">
      <div class="admin-main-column">
        <div class="section-heading"><div><p class="eyebrow">玩家</p><h2>玩家账号</h2></div><span>{{ loading ? "读取中…" : `${players.length} 条` }}</span></div>
        <div class="admin-filters surface-card"><input v-model="query" aria-label="搜索玩家" placeholder="搜索战网 ID 或 QQ 标识" /><select v-model="status" aria-label="筛选玩家状态"><option value="all">全部状态</option><option value="active">正常</option><option value="banned">已封禁</option></select></div>
        <div class="admin-list" aria-live="polite">
          <button v-for="player in players" :key="player.playerAccountId" class="admin-row surface-card" type="button" @click="openPlayer(player, $event.currentTarget)"><span><strong>{{ formatBattleTag(player) }}</strong><small>{{ player.bindingCount }} 条绑定</small></span><StatusBadge :label="player.status === 'banned' ? '已封禁' : '正常'" :tone="player.status === 'banned' ? 'warning' : 'success'" /></button>
          <p v-if="!loading && !players.length" class="empty-admin surface-card">暂无匹配玩家。</p>
        </div>
        <div class="pagination"><button class="secondary-button" :disabled="page === 1" type="button" @click="page--; load()">上一页</button><span>第 {{ page }} 页</span><button class="secondary-button" :disabled="!hasMore" type="button" @click="page++; load()">下一页</button></div>
      </div>
      <aside class="admin-side-column">
        <div class="section-heading"><div><p class="eyebrow">截图</p><h2>待核对</h2></div><span>{{ submissions.length }} 条</span></div>
        <div class="submission-review-list"><button v-for="submission in submissions" :key="submission.submissionId" class="review-row surface-card" type="button" @click="openSubmission(submission, $event.currentTarget)"><strong>{{ submission.mapName }} · {{ submission.difficulty }}</strong><small>{{ submission.playerName }} · {{ formatSubmissionStatus(submission.status) }}</small></button><p v-if="!submissions.length" class="empty-admin surface-card">暂无待核对截图。</p></div>
        <div class="section-heading"><div><p class="eyebrow">QQ 渠道</p><h2>开放群</h2></div><span>{{ groups.length }} 个</span></div>
        <div class="group-list"><div v-for="group in groups" :key="group.groupOpenId" class="group-row surface-card"><div><strong>{{ group.groupOpenId }}</strong><small>{{ group.environment === 'production' ? '正式群' : '测试群' }} · 更新于 {{ formatTime(group.updatedAt) }}</small></div><button class="toggle-button" :class="{ enabled: group.enabled }" type="button" :aria-pressed="group.enabled" @click="setGroup(group)"><span class="toggle-track" aria-hidden="true"><span></span></span>{{ group.enabled ? '已开放' : '已关闭' }}</button></div><p v-if="!groups.length" class="empty-admin surface-card">暂无群配置。</p></div>
      </aside>
    </section>
    <Transition name="detail-sheet"><div v-if="selectedSubmission" class="detail-scrim" role="presentation" @click.self="closeDetail"><section ref="submissionSheet" class="detail-sheet surface-card" role="dialog" aria-modal="true" aria-labelledby="submission-detail-title"><button ref="submissionCloseButton" class="sheet-close" type="button" aria-label="关闭" @click="closeDetail">×</button><p class="eyebrow">截图核对</p><h2 id="submission-detail-title">{{ selectedSubmission.mapName }} · {{ selectedSubmission.difficulty }}</h2><img class="evidence-image" :src="`/api/admin/evidence/${selectedSubmission.submissionId}`" alt="玩家提交的挑战截图" /><pre v-if="selectedSubmission.ocr" class="ocr-result">{{ JSON.stringify(selectedSubmission.ocr, null, 2) }}</pre><div class="review-actions"><button class="primary-button" type="button" @click="review('approved')">通过</button><button class="secondary-button" type="button" @click="review('resubmission_required')">要求重传</button><button class="danger-button" type="button" @click="review('rejected')">驳回</button></div></section></div></Transition>
    <Transition name="detail-sheet"><div v-if="selected" class="detail-scrim" role="presentation" @click.self="closeDetail"><section ref="playerSheet" class="detail-sheet surface-card" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button ref="playerCloseButton" class="sheet-close" type="button" aria-label="关闭" @click="closeDetail">×</button><p class="eyebrow">玩家详情</p><h2 id="detail-title">{{ formatBattleTag(selected) }}</h2><p class="detail-meta">最近更新 {{ formatTime(selected.updatedAt) }}</p><div class="detail-actions"><button v-if="selected.status === 'active'" class="danger-button" type="button" @click="setStatus('banned')">封禁玩家</button><button v-else class="primary-button" type="button" @click="setStatus('active')">解除封禁</button></div><h3>QQ 绑定</h3><div class="binding-list"><div v-for="binding in selected.bindings" :key="binding.bindingId" class="binding-row"><div><strong>{{ binding.groupOpenId }}</strong><small>{{ binding.memberOpenId }}</small></div><button class="text-button danger-text" type="button" @click="unbind(binding.bindingId)">解绑</button></div><p v-if="!selected.bindings.length" class="quiet-copy">暂无 QQ 绑定。</p></div><h3>最近提交</h3><div class="submission-mini"><div v-for="submission in selected.recentSubmissions" :key="submission.submissionId"><strong>{{ submission.mapName }}</strong><small>{{ formatSubmissionStatus(submission.status) }} · {{ formatTime(submission.updatedAt) }}</small></div><p v-if="!selected.recentSubmissions.length" class="quiet-copy">暂无提交记录。</p></div></section></div></Transition>
  </main>
</template>

<style scoped>
.admin-page { padding-block: clamp(64px, 9vh, 88px) 72px; }
.admin-intro { max-width: 680px; margin-bottom: 32px; }.admin-intro .body-copy { max-width: 50ch; margin-top: 14px; }
.admin-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }.admin-links .secondary-button { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }.admin-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(290px, .85fr); gap: clamp(28px, 4vw, 48px); }.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 14px; }.section-heading .eyebrow { margin-bottom: 7px; }.section-heading h2 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.2rem); letter-spacing: -.045em; }.section-heading > span { color: var(--quiet); font-size: .78rem; }
.admin-filters { display: flex; gap: 8px; margin-bottom: 10px; padding: 9px; }.admin-filters input, .admin-filters select { min-height: 44px; min-width: 0; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: var(--surface-raised); }.admin-filters input { flex: 1; padding: 0 12px; }.admin-filters select { padding: 0 10px; }
.admin-list, .group-list { display: grid; gap: 9px; }.admin-row, .review-row, .group-row { transition: transform 160ms ease, border-color 160ms ease, background 160ms ease; }.admin-row:hover, .review-row:hover, .admin-row:focus-visible, .review-row:focus-visible, .group-row:focus-within { transform: translateY(-1px); border-color: var(--line-strong); }.admin-row, .group-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; padding: 16px 18px; color: var(--text); text-align: left; }.admin-row > span:first-child, .group-row > div:first-child { min-width: 0; }.admin-row strong, .group-row strong { display: block; overflow-wrap: anywhere; }.admin-row small, .group-row small, .binding-row small, .submission-mini small { display: block; margin-top: 5px; color: var(--quiet); font-size: .75rem; overflow-wrap: anywhere; }.pagination { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px; color: var(--muted); font-size: .78rem; }.pagination .secondary-button { min-height: 44px; padding-inline: 11px; font-size: .78rem; }
.submission-review-list { display: grid; gap: 9px; margin-bottom: 32px; }.review-row { display: block; width: 100%; padding: 16px 18px; color: inherit; text-align: left; }.review-row strong { display: block; }.review-row small { display: block; margin-top: 5px; color: var(--quiet); }.evidence-image { display: block; width: 100%; margin: 22px 0; border: 1px solid var(--line); border-radius: 10px; }.ocr-result { max-height: 240px; overflow: auto; padding: 12px; color: var(--muted); background: var(--surface); font-size: .72rem; white-space: pre-wrap; }.review-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }.review-actions .primary-button, .review-actions .danger-button { min-height: 42px; padding: 0 13px; border-radius: 10px; font-weight: 700; }.review-actions .primary-button { border: 0; color: var(--on-accent); background: var(--accent); }.review-actions .danger-button { border: 0; color: var(--on-accent); background: var(--danger); }
.toggle-button { display: inline-flex; min-height: 44px; align-items: center; gap: 9px; padding: 0 11px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--surface-raised); font-size: .76rem; font-weight: 680; transition: transform 100ms ease-out, border-color 160ms ease, background 160ms ease; }.toggle-track { display: inline-flex; width: 30px; height: 18px; align-items: center; padding: 2px; border-radius: 999px; background: var(--quiet); transition: background 160ms ease; }.toggle-track > span { width: 14px; height: 14px; border-radius: 50%; background: var(--surface); box-shadow: 0 1px 2px var(--shadow); transition: transform 160ms ease; }.toggle-button.enabled { color: var(--text); border-color: color-mix(in oklch, var(--accent) 55%, var(--line)); }.toggle-button.enabled .toggle-track { background: var(--accent); }.toggle-button.enabled .toggle-track > span { transform: translateX(12px); }.toggle-button:active { transform: scale(.97); }
.empty-admin { padding: 24px; color: var(--quiet); text-align: center; }.admin-alert, .admin-feedback { margin: 0 0 18px; padding: 12px 14px; border-radius: 11px; font-size: .82rem; }.admin-alert { color: color-mix(in oklch, var(--danger) 82%, var(--text)); background: color-mix(in oklch, var(--danger) 16%, var(--surface)); }.admin-feedback { color: var(--text); background: var(--accent-surface); }
.detail-scrim { position: fixed; z-index: 20; inset: 0; display: flex; justify-content: flex-end; background: color-mix(in oklch, var(--text) 48%, transparent); }.detail-sheet { width: min(100%, 480px); height: 100%; overflow: auto; padding: 44px 28px 36px; border-radius: 22px 0 0 22px; background: color-mix(in oklch, var(--surface-raised) 94%, var(--page)); box-shadow: -20px 0 60px var(--shadow); }.detail-sheet-enter-active, .detail-sheet-leave-active { transition: opacity 180ms ease; }.detail-sheet-enter-active .detail-sheet, .detail-sheet-leave-active .detail-sheet { transition: opacity 180ms ease, transform 180ms ease; }.detail-sheet-enter-from, .detail-sheet-leave-to { opacity: 0; }.detail-sheet-enter-from .detail-sheet, .detail-sheet-leave-to .detail-sheet { opacity: 0; transform: translateX(16px); }.sheet-close { position: absolute; top: 18px; right: 22px; width: 40px; height: 40px; border: 0; border-radius: 50%; color: var(--muted); background: var(--surface); font-size: 1.4rem; }.detail-sheet h2 { margin: 0; overflow-wrap: anywhere; font-size: 2.25rem; letter-spacing: -.05em; }.detail-meta { margin: 9px 0 22px; color: var(--quiet); font-size: .8rem; }.detail-actions { display: flex; gap: 8px; margin-bottom: 32px; }.danger-button { min-height: 44px; padding: 0 15px; border: 1px solid color-mix(in oklch, var(--danger) 70%, var(--on-accent)); border-radius: 11px; color: var(--on-accent); background: var(--danger); font-weight: 680; }.danger-text { color: var(--danger); }.detail-sheet h3 { margin: 26px 0 10px; font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; }.binding-list, .submission-mini { display: grid; gap: 8px; }.binding-row, .submission-mini > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; }.quiet-copy { color: var(--quiet); font-size: .8rem; }.submission-mini > div { display: block; }.submission-mini small { margin-top: 4px; }
@media (prefers-reduced-motion: reduce) { .detail-sheet-enter-active, .detail-sheet-leave-active, .detail-sheet-enter-active .detail-sheet, .detail-sheet-leave-active .detail-sheet { transition: opacity 140ms ease; }.detail-sheet-enter-from .detail-sheet, .detail-sheet-leave-to .detail-sheet { transform: none; } }
@media (max-width: 900px) { .admin-grid { grid-template-columns: 1fr; gap: 52px; }.admin-side-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }.admin-side-column .section-heading { grid-column: span 1; }.submission-review-list, .group-list { margin-bottom: 0; }.admin-side-column .section-heading:nth-of-type(2) { grid-column: 2; grid-row: 1; }.admin-side-column .group-list { grid-column: 2; }.admin-side-column .submission-review-list { grid-column: 1; } }
@media (max-width: 520px) { .admin-filters { flex-direction: column; }.admin-filters input, .admin-filters select { width: 100%; }.admin-row, .group-row { align-items: flex-start; }.group-row { flex-direction: column; }.toggle-button { min-height: 40px; }.pagination { gap: 8px; justify-content: space-between; }.pagination .secondary-button { padding-inline: 9px; }.detail-sheet { width: 100%; padding: 56px 20px 28px; border-radius: 18px 0 0 18px; }.detail-actions { flex-wrap: wrap; }.binding-row { align-items: flex-start; flex-direction: column; }.binding-row .text-button { align-self: flex-start; min-height: 40px; } }
.text-button { border: 0; background: transparent; }.text-button:active, .danger-button:active, .primary-button:active, .secondary-button:active { transform: scale(.97); }
</style>
