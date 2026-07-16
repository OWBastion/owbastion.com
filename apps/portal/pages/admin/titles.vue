<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号迁移 · 躲避堡垒 3" });

type Grant = { grantId: string; titleKey: string; label: string; category: string; scope: "global" | "map"; mapName?: string; holderName: string; playerAccountId?: string; playerName?: string; playerId?: string; status: "unclaimed" | "active" | "revoked"; revokeReason?: string };
type Player = { playerAccountId: string; playerName: string; playerId: string };
type HolderGroup = { holderName: string; grants: Grant[]; unclaimedCount: number };

const api = useAdminApi();
const query = ref("");
const grants = ref<Grant[]>([]);
const players = ref<Player[]>([]);
const selectedPlayerId = ref("");
const message = ref("");
const errorMessage = ref("");
const loading = ref(false);
const saving = ref(false);
const selectedHolder = ref<HolderGroup | null>(null);
const selectedTrigger = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const sheet = ref<HTMLElement | null>(null);

const selectedPlayer = computed(() => players.value.find((player) => player.playerAccountId === selectedPlayerId.value));
const holderGroups = computed<HolderGroup[]>(() => {
  const groups = new Map<string, Grant[]>();
  for (const grant of grants.value) groups.set(grant.holderName, [...(groups.get(grant.holderName) ?? []), grant]);
  return [...groups].map(([holderName, holderGrants]) => ({ holderName, grants: holderGrants, unclaimedCount: holderGrants.filter((grant) => grant.status === "unclaimed").length }));
});

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [grantResponse, playerResponse] = await Promise.all([
      api<{ items: Grant[] }>(`/v1/title-grants?query=${encodeURIComponent(query.value)}`),
      api<{ items: Player[] }>("/v1/player-accounts?page=1&pageSize=50"),
    ]);
    grants.value = grantResponse.items;
    players.value = playerResponse.items;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取历史称号，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

async function grant(row: Grant) {
  if (!selectedPlayerId.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api("/v1/title-grants", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", playerAccountId: selectedPlayerId.value, historicalTitleGrantId: row.grantId } });
    message.value = "已关联";
    await load();
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法关联称号，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

async function revoke(row: Grant) {
  const reason = window.prompt("请输入撤销原因")?.trim();
  if (!reason) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api(`/v1/title-grants/${row.grantId}/revoke`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", reason } });
    message.value = "已撤销";
    await load();
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法撤销称号，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

function openBulk(group: HolderGroup, trigger: EventTarget | null) {
  if (!selectedPlayer.value || !group.unclaimedCount) return;
  selectedHolder.value = group;
  selectedTrigger.value = trigger instanceof HTMLElement ? trigger : null;
}

function closeBulk() {
  const holderName = selectedHolder.value?.holderName;
  selectedHolder.value = null;
  void nextTick(() => {
    if (selectedTrigger.value?.isConnected) selectedTrigger.value.focus();
    else if (holderName) Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-holder-name]")).find((button) => button.dataset.holderName === holderName)?.focus();
  });
}

async function grantAll() {
  if (!selectedHolder.value || !selectedPlayer.value) return;
  saving.value = true;
  errorMessage.value = "";
  message.value = "关联中…";
  try {
    const result = await api<{ grantedCount: number }>("/v1/title-grants/bulk", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", holderName: selectedHolder.value.holderName, playerAccountId: selectedPlayer.value.playerAccountId },
    });
    message.value = result.grantedCount ? `已关联 ${result.grantedCount} 项` : "暂无可关联称号";
    await load();
    closeBulk();
  } catch (error: any) {
    message.value = "";
    errorMessage.value = error?.data?.error?.message ?? "无法关联称号，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && selectedHolder.value) closeBulk();
  if (event.key !== "Tab" || !sheet.value) return;
  const focusable = Array.from(sheet.value.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

watch(selectedHolder, (holder) => { if (holder) void nextTick(() => closeButton.value?.focus()); });
onMounted(() => { void load(); document.addEventListener("keydown", handleKeydown); });
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <main class="title-admin page-shell">
    <NuxtLink class="back-link" to="/admin">返回管理后台</NuxtLink>
    <section class="intro"><p class="eyebrow">历史快照</p><h1 class="page-title">称号迁移</h1><p class="body-copy">确认后关联到玩家帐号。</p></section>

    <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>
    <p v-if="message" class="feedback" role="status">{{ message }}</p>

    <div class="filters surface-card"><input v-model="query" placeholder="搜索持有者或称号" aria-label="搜索历史称号" @change="load" /><select v-model="selectedPlayerId" aria-label="选择玩家"><option value="">选择玩家帐号</option><option v-for="player in players" :key="player.playerAccountId" :value="player.playerAccountId">{{ player.playerName }}#{{ player.playerId }}</option></select><button class="secondary-button" type="button" @click="load">搜索</button></div>

    <div class="holder-list" aria-live="polite">
      <section v-for="group in holderGroups" :key="group.holderName" class="holder-group">
        <div class="holder-heading"><div><p class="eyebrow">历史持有者</p><h2>{{ group.holderName }}</h2><small>{{ group.unclaimedCount ? `${group.unclaimedCount} 项未关联` : "暂无未关联称号" }}</small></div><button class="primary-button" :data-holder-name="group.holderName" :disabled="!selectedPlayer || !group.unclaimedCount || saving" type="button" @click="openBulk(group, $event.currentTarget)">关联全部未关联项</button></div>
        <div class="grant-list"><article v-for="row in group.grants" :key="row.grantId" class="grant-row surface-card"><div><p>{{ row.category }}</p><h3>{{ row.label }}<span v-if="row.mapName"> · {{ row.mapName }}</span></h3><small>{{ row.status === "unclaimed" ? "未关联" : row.status === "active" ? `已关联至 ${row.playerName}#${row.playerId}` : "已撤销" }}</small></div><button v-if="row.status === 'unclaimed'" class="secondary-button" :disabled="!selectedPlayer || saving" type="button" @click="grant(row)">关联</button><button v-else-if="row.status === 'active'" class="text-button danger" :disabled="saving" type="button" @click="revoke(row)">撤销</button></article></div>
      </section>
      <p v-if="!loading && !holderGroups.length" class="empty surface-card">暂无匹配记录。</p>
    </div>

    <Transition name="migration-sheet"><div v-if="selectedHolder && selectedPlayer" class="sheet-scrim" role="presentation" @click.self="closeBulk"><section ref="sheet" class="sheet" role="dialog" aria-modal="true" aria-labelledby="bulk-migration-title"><button ref="closeButton" class="sheet-close" type="button" aria-label="关闭" :disabled="saving" @click="closeBulk">×</button><p class="eyebrow">批量关联</p><h2 id="bulk-migration-title">确认称号迁移</h2><div class="migration-facts"><p><span>历史持有者</span><strong>{{ selectedHolder.holderName }}</strong></p><p><span>关联至</span><strong>{{ selectedPlayer.playerName }}#{{ selectedPlayer.playerId }}</strong></p><p><span>范围</span><strong>全部未关联称号</strong></p></div><p class="sheet-copy">已关联和已撤销记录保持不变。</p><div class="sheet-actions"><button class="secondary-button" :disabled="saving" type="button" @click="closeBulk">取消</button><button class="primary-button" :disabled="saving" type="button" @click="grantAll">{{ saving ? "关联中…" : "确认关联" }}</button></div></section></div></Transition>
  </main>
</template>

<style scoped>
.title-admin { padding-block: clamp(64px, 9vh, 88px) 72px; }.back-link { color: var(--muted); font-size: .82rem; text-decoration: none; }.back-link:hover { color: var(--text); }.intro { margin: 28px 0 38px; }.intro .body-copy { margin-top: 14px; }.filters { display: flex; gap: 8px; padding: 10px; }.filters input, .filters select { min-height: 44px; min-width: 0; flex: 1; padding: 0 12px; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: var(--surface-raised); }.holder-list { display: grid; gap: 28px; margin-top: 18px; }.holder-group { display: grid; gap: 10px; }.holder-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }.holder-heading .eyebrow { margin-bottom: 6px; }.holder-heading h2 { margin: 0; font-size: clamp(1.3rem, 3vw, 1.75rem); letter-spacing: -.035em; overflow-wrap: anywhere; }.holder-heading small, .grant-row p, .grant-row small { color: var(--quiet); font-size: .78rem; }.grant-list { display: grid; gap: 9px; }.grant-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 17px 18px; }.grant-row p, .grant-row small { display: block; margin: 0; }.grant-row h3 { margin: 8px 0; font-size: 1.05rem; overflow-wrap: anywhere; }.danger { color: var(--danger); }.empty { margin: 0; padding: 28px; color: var(--quiet); text-align: center; }.alert, .feedback { margin: 0 0 18px; padding: 12px 14px; border-radius: 11px; font-size: .82rem; }.alert { color: color-mix(in oklch, var(--danger) 82%, var(--text)); background: color-mix(in oklch, var(--danger) 16%, var(--surface)); }.feedback { background: var(--accent-surface); }.sheet-scrim { position: fixed; z-index: 20; inset: 0; display: flex; justify-content: flex-end; background: color-mix(in oklch, var(--text) 48%, transparent); }.sheet { position: relative; width: min(100%, 480px); height: 100%; overflow: auto; padding: 52px 28px 36px; border-left: 1px solid color-mix(in oklch, var(--on-accent) 35%, var(--line)); border-radius: 22px 0 0 22px; color: var(--text); background: color-mix(in oklch, var(--surface-raised) 88%, var(--page)); box-shadow: -20px 0 60px var(--shadow); backdrop-filter: blur(24px) saturate(150%); }.sheet h2 { margin: 0; font-size: 2.1rem; letter-spacing: -.05em; }.sheet-close { position: absolute; top: 16px; right: 20px; width: 40px; height: 40px; border: 0; border-radius: 50%; color: var(--muted); background: var(--surface); font-size: 1.4rem; }.migration-facts { display: grid; gap: 12px; margin: 28px 0 18px; }.migration-facts p { display: grid; gap: 5px; margin: 0; padding: 13px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }.migration-facts span { color: var(--quiet); font-size: .76rem; }.migration-facts strong { overflow-wrap: anywhere; font-size: .92rem; }.sheet-copy { color: var(--muted); font-size: .83rem; line-height: 1.5; }.sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 30px; }.migration-sheet-enter-active, .migration-sheet-leave-active { transition: opacity 180ms ease; }.migration-sheet-enter-active .sheet, .migration-sheet-leave-active .sheet { transition: opacity 180ms ease, transform 180ms ease; will-change: transform, opacity; }.migration-sheet-enter-from, .migration-sheet-leave-to { opacity: 0; }.migration-sheet-enter-from .sheet, .migration-sheet-leave-to .sheet { opacity: 0; transform: translateX(16px); }.text-button:active, .primary-button:active, .secondary-button:active, .sheet-close:active { transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .migration-sheet-enter-active, .migration-sheet-leave-active, .migration-sheet-enter-active .sheet, .migration-sheet-leave-active .sheet { transition: opacity 140ms ease; }.migration-sheet-enter-from .sheet, .migration-sheet-leave-to .sheet { transform: none; } }
@media (prefers-reduced-transparency: reduce) { .sheet { background: var(--surface-raised); backdrop-filter: none; } }
@media (max-width: 620px) { .filters, .grant-row { align-items: stretch; flex-direction: column; }.holder-heading { align-items: start; flex-direction: column; }.sheet { width: 100%; padding: 56px 20px 28px; border-radius: 18px 0 0 18px; }.sheet-actions { flex-direction: column-reverse; }.sheet-actions button { width: 100%; } }
</style>
