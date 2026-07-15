<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "成就管理 · 躲避堡垒 3" });

type AchievementStatus = "active" | "retired";
type TitleAchievement = {
  challengeId: string;
  family: "achievement";
  type: "title_achievement";
  titleName: string;
  category: string;
  categoryOverride: string | null;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  status: "active" | "retired";
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
};
type MapAchievement = {
  challengeId: string;
  family: "map";
  type: "map_completion";
  name: string;
  mapName: string;
  difficulty?: string;
  status: "active" | "retired";
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
};
type AdminAchievement = TitleAchievement | MapAchievement;

const api = useAdminApi();
const items = ref<AdminAchievement[]>([]);
const selected = ref<AdminAchievement | null>(null);
const selectedTrigger = ref<HTMLElement | null>(null);
const type = ref<"all" | "achievement" | "map">("all");
const status = ref<"all" | AchievementStatus>("all");
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const actionMessage = ref("");
const retireVersion = ref("");
const closeButton = ref<HTMLButtonElement | null>(null);

const isTitle = (item: AdminAchievement): item is TitleAchievement => item.family === "achievement";
const itemName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
const statusText = (value: AchievementStatus) => value === "active" ? "已开放" : "已退役";
const typeText = (item: AdminAchievement) => isTitle(item) ? "称号成就" : "地图挑战";
const versionText = (item: AdminAchievement) => item.status === "retired" ? `退役于 ${item.retiredVersion}` : `当前 ${item.gameVersion}`;

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const query = new URLSearchParams();
    if (type.value !== "all") query.set("type", type.value);
    if (status.value !== "all") query.set("status", status.value);
    const response = await api<{ items: AdminAchievement[] }>(`/v1/achievements${query.size ? `?${query}` : ""}`);
    items.value = response.items;
    if (selected.value) selected.value = items.value.find((item) => item.challengeId === selected.value?.challengeId) ?? null;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取成就目录，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

function open(item: AdminAchievement, trigger: EventTarget | null) {
  selectedTrigger.value = trigger instanceof HTMLElement ? trigger : null;
  selected.value = { ...item };
  retireVersion.value = item.retiredVersion ?? "";
  actionMessage.value = "";
}

function close() {
  selected.value = null;
  retireVersion.value = "";
  void nextTick(() => selectedTrigger.value?.focus());
}

function titleUpdate(status: TitleAchievement["status"], retiredVersion?: string) {
  if (!selected.value || !isTitle(selected.value)) return;
  return {
    family: "achievement",
    condition: selected.value.condition,
    evidenceRule: selected.value.evidenceRule,
    submissionMode: selected.value.submissionMode,
    categoryOverride: selected.value.categoryOverride || null,
    status,
    ...(status === "retired" ? { retiredVersion: retiredVersion ?? selected.value.retiredVersion ?? "" } : {}),
  };
}

async function saveTitle() {
  if (!selected.value || !isTitle(selected.value)) return;
  await save(titleUpdate(selected.value.status), "成就规则已保存");
}

async function retire() {
  if (!selected.value || !retireVersion.value.trim()) return;
  await save(isTitle(selected.value)
    ? titleUpdate("retired", retireVersion.value.trim())
    : { family: "map", status: "retired", retiredVersion: retireVersion.value.trim() }, "挑战已退役");
}

async function reopen() {
  if (!selected.value || !window.confirm(`重新开放“${itemName(selected.value)}”？`)) return;
  await save(isTitle(selected.value) ? titleUpdate("active") : { family: "map", status: "active" }, "挑战已重新开放");
}

async function save(body: Record<string, unknown> | undefined, message: string) {
  if (!selected.value) return;
  saving.value = true;
  errorMessage.value = "";
  actionMessage.value = "保存中…";
  try {
    await api<void>(`/v1/achievements/${encodeURIComponent(selected.value.challengeId)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", family: selected.value.family, ...body },
    });
    actionMessage.value = message;
    await load();
  } catch (error: any) {
    actionMessage.value = "";
    errorMessage.value = error?.data?.error?.message ?? "无法保存成就规则，请稍后重试。";
  } finally {
    saving.value = false;
  }
}

watch([type, status], () => { void load(); });
watch(selected, (item) => { if (item) void nextTick(() => closeButton.value?.focus()); });
onMounted(() => void load());
</script>

<template>
  <main class="achievement-admin page-shell">
    <NuxtLink class="back-link" to="/admin">返回管理后台</NuxtLink>
    <section class="intro"><p class="eyebrow">运营控制台</p><h1 class="page-title">成就管理</h1><p class="body-copy">管理平台挑战规则与开放状态。</p></section>

    <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>
    <p v-if="actionMessage" class="feedback" role="status">{{ actionMessage }}</p>

    <section class="catalog" aria-labelledby="catalog-title">
      <div class="catalog-heading"><div><p class="eyebrow">挑战目录</p><h2 id="catalog-title">已登记成就</h2></div><span>{{ loading ? "读取中…" : `${items.length} 项` }}</span></div>
      <div class="filters surface-card"><select v-model="type" aria-label="筛选成就类型"><option value="all">全部类型</option><option value="achievement">称号成就</option><option value="map">地图挑战</option></select><select v-model="status" aria-label="筛选成就状态"><option value="all">全部状态</option><option value="active">已开放</option><option value="retired">已退役</option></select></div>
      <div class="achievement-list" aria-live="polite">
        <button v-for="item in items" :key="item.challengeId" class="achievement-row surface-card" type="button" @click="open(item, $event.currentTarget)"><span class="row-copy"><small>{{ typeText(item) }}</small><strong>{{ itemName(item) }}</strong><em v-if="isTitle(item)">{{ item.condition }}</em><em v-else>{{ item.mapName }}<template v-if="item.difficulty"> · {{ item.difficulty }}</template></em></span><span class="row-meta"><StatusBadge :label="statusText(item.status)" :tone="item.status === 'active' ? 'success' : 'warning'" /><small>{{ versionText(item) }}</small></span></button>
        <p v-if="!loading && !items.length" class="empty surface-card">暂无记录。</p>
      </div>
    </section>

    <Transition name="achievement-sheet"><div v-if="selected" class="sheet-scrim" role="presentation" @click.self="close"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="achievement-detail-title"><button ref="closeButton" class="sheet-close" type="button" aria-label="关闭" @click="close">×</button><p class="eyebrow">{{ typeText(selected) }}</p><h2 id="achievement-detail-title">{{ itemName(selected) }}</h2><p class="sheet-version">引入版本 {{ selected.introducedVersion }} · {{ versionText(selected) }}</p>
      <form v-if="isTitle(selected)" class="editor" @submit.prevent="saveTitle"><label>完成条件<textarea v-model="selected.condition" required maxlength="1024" /></label><label>截图规则<textarea v-model="selected.evidenceRule" required maxlength="2048" /></label><label>提交方式<select v-model="selected.submissionMode"><option value="manual">手动提交</option><option value="automatic">自动提交</option></select></label><label>展示分类<input v-model="selected.categoryOverride" :placeholder="selected.category" maxlength="128" /></label><button class="primary-button" :disabled="saving" type="submit">{{ saving ? "保存中…" : "保存规则" }}</button></form>
      <div v-else class="map-facts"><p>{{ selected.mapName }}<template v-if="selected.difficulty"> · {{ selected.difficulty }}</template></p><p>地图、难度和版本由 Bastion 发布快照维护。</p></div>
      <section v-if="selected.status === 'active'" class="retire"><h3>退役挑战</h3><p>停止新的截图提交；已有提交保持原状态。</p><label>Bastion 发布版本<input v-model="retireVersion" placeholder="例如 3.2.0" :disabled="saving" /></label><button class="danger-button" :disabled="saving || !retireVersion.trim()" type="button" @click="retire">退役</button></section>
      <section v-else class="reopen"><h3>重新开放</h3><p>恢复新的截图提交。</p><button class="secondary-button" :disabled="saving" type="button" @click="reopen">重新开放</button></section>
    </section></div></Transition>
  </main>
</template>

<style scoped>
.achievement-admin { padding-block: clamp(64px, 9vh, 88px) 72px; }.back-link { color: var(--muted); font-size: .82rem; text-decoration: none; }.back-link:hover { color: var(--text); }.intro { margin: 28px 0 38px; }.intro .body-copy { margin-top: 14px; }.catalog { max-width: 820px; }.catalog-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 14px; }.catalog-heading .eyebrow { margin-bottom: 7px; }.catalog-heading h2 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.2rem); letter-spacing: -.045em; }.catalog-heading > span, .row-meta small { color: var(--quiet); font-size: .78rem; }.filters { display: flex; gap: 8px; padding: 9px; margin-bottom: 10px; }.filters select, .editor input, .editor select, .editor textarea, .retire input { width: 100%; min-height: 44px; border: 1px solid var(--line); border-radius: 9px; padding: 0 12px; color: var(--text); background: var(--surface-raised); }.filters select { flex: 1; }.achievement-list { display: grid; gap: 9px; }.achievement-row { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 20px; padding: 17px 18px; color: var(--text); text-align: left; transition: transform 160ms ease, border-color 160ms ease, background 160ms ease; }.achievement-row:hover, .achievement-row:focus-visible { transform: translateY(-1px); border-color: var(--line-strong); }.row-copy, .row-meta { display: grid; gap: 5px; min-width: 0; }.row-copy small { color: var(--accent); font-size: .72rem; font-weight: 700; letter-spacing: .04em; }.row-copy strong { overflow-wrap: anywhere; font-size: 1rem; }.row-copy em { color: var(--muted); font-size: .82rem; font-style: normal; line-height: 1.45; }.row-meta { justify-items: end; flex: 0 0 auto; }.empty { margin: 0; padding: 28px; color: var(--quiet); text-align: center; }.alert, .feedback { max-width: 820px; margin: 0 0 18px; padding: 12px 14px; border-radius: 11px; font-size: .82rem; }.alert { color: color-mix(in oklch, var(--danger) 82%, var(--text)); background: color-mix(in oklch, var(--danger) 16%, var(--surface)); }.feedback { background: var(--accent-surface); }.sheet-scrim { position: fixed; z-index: 20; inset: 0; display: flex; justify-content: flex-end; background: color-mix(in oklch, var(--text) 48%, transparent); }.sheet { position: relative; width: min(100%, 500px); height: 100%; overflow: auto; padding: 52px 28px 36px; border-left: 1px solid color-mix(in oklch, var(--on-accent) 35%, var(--line)); border-radius: 22px 0 0 22px; color: var(--text); background: color-mix(in oklch, var(--surface-raised) 88%, var(--page)); box-shadow: -20px 0 60px var(--shadow); backdrop-filter: blur(24px) saturate(150%); }.sheet h2 { margin: 0; font-size: 2.25rem; letter-spacing: -.05em; overflow-wrap: anywhere; }.sheet-version { margin: 9px 0 28px; color: var(--quiet); font-size: .8rem; }.sheet-close { position: absolute; top: 16px; right: 20px; width: 40px; height: 40px; border: 0; border-radius: 50%; color: var(--muted); background: var(--surface); font-size: 1.4rem; }.editor, .retire { display: grid; gap: 16px; }.editor label, .retire label { display: grid; gap: 7px; color: var(--muted); font-size: .78rem; font-weight: 680; }.editor textarea { min-height: 104px; padding-block: 10px; line-height: 1.5; resize: vertical; }.editor .primary-button { width: fit-content; }.retire, .reopen { margin-top: 34px; padding-top: 25px; border-top: 1px solid var(--line); }.retire h3, .reopen h3 { margin: 0; font-size: 1rem; }.retire p, .reopen p, .map-facts p { color: var(--muted); font-size: .83rem; line-height: 1.55; }.retire .danger-button { justify-self: start; min-height: 44px; padding: 0 15px; border: 1px solid color-mix(in oklch, var(--danger) 70%, var(--on-accent)); border-radius: 11px; color: var(--on-accent); background: var(--danger); font-weight: 680; }.map-facts { padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }.map-facts p:first-child { margin-top: 0; color: var(--text); font-weight: 680; }.map-facts p:last-child { margin-bottom: 0; }.achievement-sheet-enter-active, .achievement-sheet-leave-active { transition: opacity 180ms ease; }.achievement-sheet-enter-active .sheet, .achievement-sheet-leave-active .sheet { transition: opacity 180ms ease, transform 180ms ease; will-change: transform, opacity; }.achievement-sheet-enter-from, .achievement-sheet-leave-to { opacity: 0; }.achievement-sheet-enter-from .sheet, .achievement-sheet-leave-to .sheet { opacity: 0; transform: translateX(16px); }.sheet-close:active, .achievement-row:active, .danger-button:active { transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .achievement-sheet-enter-active, .achievement-sheet-leave-active, .achievement-sheet-enter-active .sheet, .achievement-sheet-leave-active .sheet { transition: opacity 140ms ease; }.achievement-sheet-enter-from .sheet, .achievement-sheet-leave-to .sheet { transform: none; } }
@media (prefers-reduced-transparency: reduce) { .sheet { background: var(--surface-raised); backdrop-filter: none; } }
@media (max-width: 560px) { .filters { flex-direction: column; }.achievement-row { align-items: flex-start; }.row-meta { align-items: start; justify-items: start; }.sheet { width: 100%; padding: 56px 20px 28px; border-radius: 18px 0 0 18px; } }
</style>
