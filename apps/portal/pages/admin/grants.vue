<script setup lang="ts">
import { watchDebounced } from "@vueuse/core";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "批量发放称号 · 躲避堡垒 3" });

type Player = { playerAccountId: string; playerId: string; playerName: string; status: "active" | "banned" };
type Title = { titleKey: string; label: string; category: string; availability: "active" | "retired"; scope: "global" | "map"; mapId?: string };
type TitleOption = Title & { value: string; mapName?: string };
type BatchResult = { batchId: string; requestedCount: number; createdCount: number; alreadyOwnedCount: number };

const api = useAdminApi();
const toast = useToast();
const players = shallowRef<Player[]>([]);
const selectedPlayers = shallowRef<Player[]>([]);
const titles = shallowRef<TitleOption[]>([]);
const selectedTitleValues = shallowRef<string[]>([]);
const playerQuery = shallowRef("");
const titleQuery = shallowRef("");
const reason = shallowRef("");
const loadingPlayers = shallowRef(true);
const loadingTitles = shallowRef(true);
const saving = shallowRef(false);
const confirmOpen = shallowRef(false);
const errorMessage = shallowRef("");
const result = shallowRef<BatchResult | null>(null);

const selectedPlayerIds = computed(() => new Set(selectedPlayers.value.map((player) => player.playerAccountId)));
const selectedTitleSet = computed(() => new Set(selectedTitleValues.value));
function compareTitles(left: TitleOption, right: TitleOption) {
  if (left.scope !== right.scope) return left.scope === "global" ? -1 : 1;
  const map = (left.mapName ?? "").localeCompare(right.mapName ?? "", "zh-CN");
  if (map) return map;
  const category = left.category.localeCompare(right.category, "zh-CN");
  if (category) return category;
  return titleLabel(left).localeCompare(titleLabel(right), "zh-CN");
}
const filteredTitles = computed(() => {
  const query = titleQuery.value.trim().toLocaleLowerCase();
  const items = query
    ? titles.value.filter((title) => `${title.label} ${title.category} ${title.mapName ?? ""} ${title.titleKey}`.toLocaleLowerCase().includes(query))
    : titles.value;
  return [...items].sort(compareTitles);
});
const selectedTitles = computed(() => titles.value.filter((title) => selectedTitleSet.value.has(title.value)).sort(compareTitles));
const selectedPlayerList = computed(() => [...selectedPlayers.value].sort((left, right) => left.playerName.localeCompare(right.playerName, "zh-CN") || left.playerId.localeCompare(right.playerId)));
const requestedCount = computed(() => selectedPlayers.value.length * selectedTitles.value.length);
const tooLarge = computed(() => requestedCount.value > 500);
const canConfirm = computed(() => !saving.value && !loadingPlayers.value && !loadingTitles.value && selectedPlayers.value.length > 0 && selectedTitles.value.length > 0 && !tooLarge.value);

function titleLabel(title: TitleOption) {
  return `${title.label}${title.availability === "retired" ? "（不再发放）" : ""}`;
}
function titleDescription(title: TitleOption) {
  return title.mapName ? `${title.mapName} · ${titleLabel(title)}` : titleLabel(title);
}
function togglePlayer(player: Player, checked: boolean) {
  selectedPlayers.value = checked
    ? [...selectedPlayers.value.filter((item) => item.playerAccountId !== player.playerAccountId), player]
    : selectedPlayers.value.filter((item) => item.playerAccountId !== player.playerAccountId);
}
function toggleTitle(title: TitleOption, checked: boolean) {
  selectedTitleValues.value = checked
    ? [...new Set([...selectedTitleValues.value, title.value])]
    : selectedTitleValues.value.filter((value) => value !== title.value);
}
function resetResult() {
  result.value = null;
  errorMessage.value = "";
}

async function loadPlayers() {
  loadingPlayers.value = true;
  try {
    const response = await api<{ items: Player[] }>(`/v1/player-accounts?query=${encodeURIComponent(playerQuery.value.trim())}&status=active&page=1&pageSize=50`);
    players.value = response.items;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取玩家目录，请稍后重试。").description;
  } finally {
    loadingPlayers.value = false;
  }
}

async function loadTitles() {
  loadingTitles.value = true;
  try {
    const mapsResponse = await api<{ items: Array<{ mapId: string; mapName: string }> }>("/v1/maps");
    const responses = await Promise.all([
      api<{ items: Title[] }>("/v1/titles"),
      ...mapsResponse.items.map((map) => api<{ items: Title[] }>(`/v1/titles?mapId=${encodeURIComponent(map.mapId)}`)),
    ]);
    const mapNames = new Map(mapsResponse.items.map((map) => [map.mapId, map.mapName]));
    const options = responses.flatMap((response) => response.items).map((title) => ({ ...title, mapName: title.mapId ? mapNames.get(title.mapId) : undefined, value: `${title.titleKey}:${title.mapId ?? ""}` }));
    titles.value = [...new Map(options.map((title) => [title.value, title])).values()].sort(compareTitles);
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取称号目录，请稍后重试。").description;
  } finally {
    loadingTitles.value = false;
  }
}

function openConfirm() {
  resetResult();
  if (canConfirm.value) confirmOpen.value = true;
}
function closeConfirm(force = false) {
  if (saving.value && !force) return;
  confirmOpen.value = false;
}
async function grant() {
  if (!canConfirm.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const response = await api<BatchResult>("/v1/title-grants/manual/batch", {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: {
        contractVersion: "1",
        playerAccountIds: selectedPlayers.value.map((player) => player.playerAccountId),
        targets: selectedTitles.value.map((title) => ({ titleKey: title.titleKey, ...(title.mapId ? { mapId: title.mapId } : {}) })),
        ...(reason.value.trim() ? { reason: reason.value.trim() } : {}),
      },
    });
    result.value = response;
    toast.add({ title: `已处理 ${response.requestedCount} 个称号授予`, color: "success" });
    selectedPlayers.value = [];
    selectedTitleValues.value = [];
    reason.value = "";
    closeConfirm(true);
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法批量发放称号，请检查选择后重试。").description;
  } finally {
    saving.value = false;
  }
}

watchDebounced(playerQuery, () => { void loadPlayers(); }, { debounce: 250 });
onMounted(() => { void Promise.all([loadPlayers(), loadTitles()]); });
</script>

<template>
  <AdminWorkspace title="批量发放称号" :count="requestedCount ? `${requestedCount} 个授予` : '未选择'">
    <template #messages>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
      <UAlert v-if="result" color="success" variant="subtle" :title="`批次已完成：${result.createdCount} 个新授予，${result.alreadyOwnedCount} 个已拥有`" :description="`共处理 ${result.requestedCount} 个授予单元。`" />
    </template>
    <section class="grant-workspace" aria-label="批量发放称号工作区">
      <div class="grant-panel surface-card">
        <div class="panel-heading"><h2>选择玩家</h2><span>{{ selectedPlayers.length }} 人</span></div>
        <UInput v-model="playerQuery" aria-label="搜索玩家" placeholder="搜索战网 ID" :disabled="saving" />
        <div v-if="selectedPlayerList.length" class="selection-chips" aria-live="polite"><UBadge v-for="player in selectedPlayerList" :key="player.playerAccountId" :label="`${player.playerName}#${player.playerId}`" color="primary" variant="subtle" /></div>
        <div v-if="loadingPlayers" class="selector-state" role="status">读取中…</div>
        <div v-else-if="!players.length" class="selector-state">暂无匹配玩家。</div>
        <div v-else class="selector-list" role="group" aria-label="玩家结果">
          <UCheckbox v-for="player in players" :key="player.playerAccountId" class="selector-option" :model-value="selectedPlayerIds.has(player.playerAccountId)" :disabled="saving" @update:model-value="(value) => togglePlayer(player, value === true)"><span class="selector-copy"><strong>{{ player.playerName }}#{{ player.playerId }}</strong><small>{{ player.playerAccountId }}</small></span></UCheckbox>
        </div>
      </div>
      <div class="grant-panel surface-card">
        <div class="panel-heading"><h2>选择称号</h2><span>{{ selectedTitles.length }} 项</span></div>
        <UInput v-model="titleQuery" aria-label="搜索称号" placeholder="搜索称号、地图或系列" :disabled="saving" />
        <div v-if="selectedTitles.length" class="selection-chips" aria-live="polite"><UBadge v-for="title in selectedTitles" :key="title.value" :label="titleDescription(title)" color="primary" variant="subtle" /></div>
        <div v-if="loadingTitles" class="selector-state" role="status">读取中…</div>
        <div v-else-if="!filteredTitles.length" class="selector-state">暂无匹配称号。</div>
        <div v-else class="selector-list" role="group" aria-label="称号结果">
          <UCheckbox v-for="title in filteredTitles" :key="title.value" class="selector-option" :model-value="selectedTitleSet.has(title.value)" :disabled="saving" @update:model-value="(value) => toggleTitle(title, value === true)"><span class="selector-copy"><strong>{{ titleDescription(title) }}</strong><small>{{ title.category }} · {{ title.scope === 'map' ? '地图称号' : '全局称号' }}</small></span></UCheckbox>
        </div>
      </div>
    </section>
    <section class="grant-summary surface-card" aria-labelledby="grant-summary-title">
      <div class="panel-heading"><h2 id="grant-summary-title">授予计划</h2><span>{{ selectedPlayers.length }} × {{ selectedTitles.length }}</span></div>
      <p class="grant-count" aria-live="polite">{{ selectedPlayers.length }} 玩家 × {{ selectedTitles.length }} 称号 = <strong>{{ requestedCount }} 个授予</strong></p>
      <UAlert v-if="tooLarge" color="warning" variant="subtle" title="批次超过上限" description="一次最多处理 500 个授予单元，请减少玩家或称号选择。" />
      <UFormField label="发放原因"><UTextarea v-model="reason" maxlength="512" placeholder="漏发、申诉纠正或特殊人工奖励" :disabled="saving" /></UFormField>
      <UButton block label="确认发放" :disabled="!canConfirm" @click="openConfirm" />
    </section>
    <AdminResponsiveDialog v-model:open="confirmOpen" title="确认批量发放" size="sm" :dismissible="!saving">
      <template #body><div class="confirm-body"><p>将为 {{ selectedPlayerList.length }} 名玩家处理 {{ selectedTitles.length }} 个称号，共 {{ requestedCount }} 个授予单元。</p><div class="confirm-list"><strong>玩家</strong><span>{{ selectedPlayerList.map((player) => `${player.playerName}#${player.playerId}`).join("、") }}</span><strong>称号</strong><span>{{ selectedTitles.map(titleDescription).join("、") }}</span></div></div></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeConfirm()" /><UButton label="确认发放" :loading="saving" @click="grant" /></template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.grant-workspace { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(1rem, 2.4vw, 1.5rem); }.grant-panel, .grant-summary { display: grid; gap: 0.875rem; padding: clamp(1rem, 2.5vw, 1.375rem); }.grant-summary { gap: 1rem; }.panel-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }.panel-heading h2 { margin: 0; font-size: 1rem; letter-spacing: -0.02em; }.panel-heading > span { color: var(--quiet); font-size: 0.78rem; }.selector-list { display: grid; gap: 0.25rem; max-height: 22rem; overflow-y: auto; }.selector-option { display: flex; align-items: start; gap: 0.6875rem; min-width: 0; min-height: 2.75rem; padding: 0.625rem 0.5rem; border-radius: 0.5625rem; cursor: pointer; }.selector-option:hover { background: var(--accent-surface); }.selector-copy { display: grid; min-width: 0; gap: 0.1875rem; }.selector-option strong { overflow-wrap: anywhere; }.selector-option small { color: var(--quiet); overflow-wrap: anywhere; }.selector-state { min-height: 5rem; display: grid; place-items: center; color: var(--quiet); font-size: 0.82rem; }.selection-chips { display: flex; flex-wrap: wrap; gap: 0.375rem; max-height: 5.5rem; overflow-y: auto; }.grant-count { margin: 0; color: var(--muted); }.grant-count strong { color: var(--text); }.confirm-body { display: grid; gap: 1rem; }.confirm-body p { margin: 0; line-height: 1.55; }.confirm-list { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.5rem 0.75rem; font-size: 0.82rem; }.confirm-list span { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
@media (max-width: 760px) { .grant-workspace { grid-template-columns: 1fr; } }
</style>
