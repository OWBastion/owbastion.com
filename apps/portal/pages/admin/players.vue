<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";
import type { AdminPlayer, AdminPlayerDetail } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "玩家管理 · 躲避堡垒 3" });
const api = useAdminApi();
const players = ref<AdminPlayer[]>([]);
const selected = ref<AdminPlayerDetail | null>(null);
const query = ref("");
const status = ref<"all" | "active" | "banned">("all");
const loading = ref(true);
const errorMessage = ref("");
const actionMessage = ref("");
const page = ref(1);
const hasMore = ref(false);
const trigger = ref<HTMLElement | null>(null);
const sheet = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const formatBattleTag = (player: { playerName: string; playerId: string }) => `${player.playerName}#${player.playerId}`;
const formatSubmissionStatus = (value: string) => submissionStatusText[value] ?? value;
async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const response = await api<{ items: AdminPlayer[]; hasMore: boolean }>(`/v1/player-accounts?query=${encodeURIComponent(query.value)}&page=${page.value}&pageSize=20${status.value === "all" ? "" : `&status=${status.value}`}`);
    players.value = response.items;
    hasMore.value = response.hasMore;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取玩家帐号，请确认当前账号有管理员权限。";
  } finally { loading.value = false; }
}
async function openPlayer(player: AdminPlayer, event: EventTarget | null) {
  trigger.value = event instanceof HTMLElement ? event : null;
  selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${player.playerAccountId}`);
}
async function setStatus(next: "active" | "banned") {
  if (!selected.value) return;
  const reason = next === "banned" ? window.prompt("请输入封禁原因（可选）") ?? "" : undefined;
  if (next === "banned" && !window.confirm(`确认封禁玩家“${formatBattleTag(selected.value)}”？`)) return;
  actionMessage.value = "保存中…";
  await api(`/v1/player-accounts/${selected.value.playerAccountId}/status`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", status: next, ...(reason ? { reason } : {}) } });
  actionMessage.value = next === "banned" ? "玩家已封禁" : "玩家已解封";
  selected.value.status = next;
  await load();
}
async function unbind(bindingId: string) {
  if (!window.confirm("解除这条 QQ 绑定？历史提交会保留。")) return;
  actionMessage.value = "解除绑定中…";
  await api(`/v1/bindings/${bindingId}`, { method: "DELETE", headers: { "Idempotency-Key": crypto.randomUUID() } });
  actionMessage.value = "QQ 绑定已解除";
  if (selected.value) selected.value = await api<AdminPlayerDetail>(`/v1/player-accounts/${selected.value.playerAccountId}`);
  await load();
}
function close() { selected.value = null; void nextTick(() => trigger.value?.focus()); }
function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && selected.value) close();
  if (event.key !== "Tab" || !sheet.value) return;
  const focusable = Array.from(sheet.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  const first = focusable.at(0); const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
watch([query, status], () => { page.value = 1; void load(); });
watch(selected, (value) => { if (value) void nextTick(() => closeButton.value?.focus()); });
onMounted(() => { void load(); document.addEventListener("keydown", handleKeydown); });
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <main class="admin-page page-shell"><h1 class="sr-only">玩家管理</h1>
    <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p><p v-if="actionMessage" class="feedback" role="status">{{ actionMessage }}</p>
    <section aria-labelledby="players-title"><div class="section-heading"><h2 id="players-title">玩家帐号</h2><span>{{ loading ? "读取中…" : `${players.length} 条` }}</span></div>
      <div class="filters surface-card"><input v-model="query" aria-label="搜索玩家" placeholder="搜索战网 ID 或 QQ 标识" /><select v-model="status" aria-label="筛选玩家状态"><option value="all">全部状态</option><option value="active">正常</option><option value="banned">已封禁</option></select></div>
      <div class="list" aria-live="polite"><button v-for="player in players" :key="player.playerAccountId" class="row surface-card" type="button" @click="openPlayer(player, $event.currentTarget)"><span><strong>{{ formatBattleTag(player) }}</strong><small>{{ player.bindingCount }} 条绑定</small></span><StatusBadge :label="player.status === 'banned' ? '已封禁' : '正常'" :tone="player.status === 'banned' ? 'warning' : 'success'" /></button><p v-if="!loading && !players.length" class="empty surface-card">暂无匹配玩家。</p></div>
      <div class="pagination"><button class="secondary-button" :disabled="page === 1" type="button" @click="page--; load()">上一页</button><span>第 {{ page }} 页</span><button class="secondary-button" :disabled="!hasMore" type="button" @click="page++; load()">下一页</button></div>
    </section>
    <Transition name="sheet"><div v-if="selected" class="scrim" role="presentation" @click.self="close"><section ref="sheet" class="detail surface-card" role="dialog" aria-modal="true" aria-labelledby="player-detail-title"><button ref="closeButton" class="close" type="button" aria-label="关闭" @click="close">×</button><h2 id="player-detail-title">{{ formatBattleTag(selected) }}</h2><p class="meta">最近更新 {{ formatTime(selected.updatedAt) }}</p><div class="actions"><button v-if="selected.status === 'active'" class="danger-button" type="button" @click="setStatus('banned')">封禁玩家</button><button v-else class="primary-button" type="button" @click="setStatus('active')">解除封禁</button></div><h3>QQ 绑定</h3><div class="binding-list"><div v-for="binding in selected.bindings" :key="binding.bindingId" class="binding"><div><strong>{{ binding.groupOpenId }}</strong><small>{{ binding.memberOpenId }}</small></div><button class="text-button danger-text" type="button" @click="unbind(binding.bindingId)">解绑</button></div><p v-if="!selected.bindings.length" class="quiet">暂无 QQ 绑定。</p></div><h3>最近提交</h3><div class="submission-list"><div v-for="submission in selected.recentSubmissions" :key="submission.submissionId"><strong>{{ submission.mapName }}</strong><small>{{ formatSubmissionStatus(submission.status) }} · {{ formatTime(submission.updatedAt) }}</small></div><p v-if="!selected.recentSubmissions.length" class="quiet">暂无提交记录。</p></div></section></div></Transition>
  </main>
</template>

<style scoped>
.admin-page { padding-block: clamp(46px, 7vh, 72px); max-width: 920px; }.section-heading { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:14px; }.section-heading h2 { margin:0; font-size:clamp(1.5rem,3vw,2.1rem); letter-spacing:-.045em; }.section-heading span,.row small,.binding small,.submission-list small { color:var(--quiet); font-size:.78rem; }.filters { display:flex; gap:8px; padding:9px; margin-bottom:10px; }.filters input,.filters select { min-height:44px; min-width:0; border:1px solid var(--line); border-radius:9px; color:var(--text); background:var(--surface-raised); }.filters input { flex:1; padding:0 12px; }.filters select { padding:0 10px; }.list,.binding-list,.submission-list { display:grid; gap:9px; }.row { display:flex; align-items:center; justify-content:space-between; gap:16px; width:100%; padding:16px 18px; color:var(--text); text-align:left; transition:transform 160ms ease,border-color 160ms ease; }.row:hover,.row:focus-visible { transform:translateY(-1px); border-color:var(--line-strong); }.row strong,.row small,.binding strong,.binding small,.submission-list strong,.submission-list small { display:block; }.row small,.binding small,.submission-list small { margin-top:5px; }.empty { margin:0; padding:24px; color:var(--quiet); text-align:center; }.pagination { display:flex; align-items:center; justify-content:center; gap:14px; margin-top:16px; color:var(--muted); font-size:.78rem; }.alert,.feedback { margin:0 0 18px; padding:12px 14px; border-radius:11px; font-size:.82rem; }.alert { color:color-mix(in oklch,var(--danger) 82%,var(--text)); background:color-mix(in oklch,var(--danger) 16%,var(--surface)); }.feedback { background:var(--accent-surface); }.scrim { position:fixed; z-index:20; inset:0; display:flex; justify-content:flex-end; background:color-mix(in oklch,var(--text) 48%,transparent); }.detail { position:relative; width:min(100%,480px); height:100%; overflow:auto; padding:54px 28px 36px; border-radius:22px 0 0 22px; background:var(--surface-raised); box-shadow:-20px 0 60px var(--shadow); }.detail h2 { margin:0; font-size:2.25rem; letter-spacing:-.05em; overflow-wrap:anywhere; }.close { position:absolute; top:16px; right:20px; width:40px; height:40px; border:0; border-radius:50%; color:var(--muted); background:var(--surface); font-size:1.4rem; }.meta { margin:9px 0 22px; color:var(--quiet); font-size:.8rem; }.actions { margin-bottom:32px; }.detail h3 { margin:26px 0 10px; font-size:.8rem; letter-spacing:.04em; text-transform:uppercase; }.binding,.submission-list > div { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px; border:1px solid var(--line); border-radius:10px; }.submission-list > div { display:block; }.text-button { border:0; background:transparent; }.danger-text { color:var(--danger); }.quiet { color:var(--quiet); font-size:.8rem; }.sheet-enter-active,.sheet-leave-active { transition:opacity 180ms ease; }.sheet-enter-active .detail,.sheet-leave-active .detail { transition:transform 180ms ease,opacity 180ms ease; }.sheet-enter-from,.sheet-leave-to { opacity:0; }.sheet-enter-from .detail,.sheet-leave-to .detail { opacity:0; transform:translateX(16px); }@media (max-width:560px){.filters{flex-direction:column}.detail{width:100%;padding-inline:20px}.row{align-items:flex-start}.binding{align-items:flex-start;flex-direction:column}}
</style>
