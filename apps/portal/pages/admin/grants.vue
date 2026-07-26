<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";
import { portalErrorDetails } from "~/utils/portal-error";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号发放 · 躲避堡垒 3" });

type Player = { playerAccountId: string; playerName: string; playerId: string };
type MapItem = { mapId: string; mapName: string };
type Title = { titleKey: string; label: string; category: string; condition: string; availability: "active" | "retired"; scope: "global" | "map"; mapId?: string; slot?: "pioneer" | "conqueror" | "dominator" };
type TitleOption = Title & { mapName?: string; value: string };

const api = useAdminApi();
const toast = useToast();
const players = shallowRef<Player[]>([]);
const titles = shallowRef<TitleOption[]>([]);
const selectedPlayerId = shallowRef("");
const selectedTitleValue = shallowRef("");
const reason = shallowRef("");
const loading = shallowRef(true);
const saving = shallowRef(false);
const errorMessage = shallowRef("");

const selectedTitle = computed(() => titles.value.find((title) => title.value === selectedTitleValue.value));
const titleItems = computed(() => titles.value.map((title) => ({ label: `${title.label}${title.mapName ? ` · ${title.mapName}` : ""}${title.availability === "retired" ? "（不再发放）" : ""}`, value: title.value })));

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [playerResponse, mapResponse] = await Promise.all([
      api<{ items: Player[] }>("/v1/player-accounts?page=1&pageSize=50"),
      api<{ items: MapItem[] }>("/v1/maps"),
    ]);
    const titleResponses = await Promise.all([
      api<{ items: Title[] }>("/v1/titles"),
      ...mapResponse.items.map((map) => api<{ items: Title[] }>(`/v1/titles?mapId=${encodeURIComponent(map.mapId)}`)),
    ]);
    const mapNames = new Map(mapResponse.items.map((map) => [map.mapId, map.mapName]));
    const options = titleResponses.flatMap((response) => response.items).map((title) => ({ ...title, mapName: title.mapId ? mapNames.get(title.mapId) : undefined, value: `${title.titleKey}:${title.mapId ?? ""}` }));
    titles.value = [...new Map(options.map((title) => [title.value, title])).values()].sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
    players.value = playerResponse.items;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取玩家和称号目录，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

async function grant() {
  const title = selectedTitle.value;
  if (!selectedPlayerId.value || !title) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const result = await api<{ titleName: string; alreadyOwned: boolean }>("/v1/title-grants/manual", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", playerAccountId: selectedPlayerId.value, titleKey: title.titleKey, ...(title.mapId ? { mapId: title.mapId } : {}), ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) },
    });
    toast.add({ title: result.alreadyOwned ? `玩家此前已拥有「${result.titleName}」，未重复发放` : `已发放「${result.titleName}」`, color: "success" });
    reason.value = "";
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法发放称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="称号发放" :count="loading ? '读取中…' : `${titles.length} 项称号`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <UCard class="grant-card" variant="subtle">
      <form class="grant-form" @submit.prevent="grant">
        <UFormField label="玩家" required><USelect v-model="selectedPlayerId" :items="players.map((player) => ({ label: `${player.playerName}#${player.playerId}`, value: player.playerAccountId }))" placeholder="选择玩家帐号" :disabled="loading || saving" /></UFormField>
        <UFormField label="称号" required><USelect v-model="selectedTitleValue" :items="titleItems" placeholder="选择称号" :disabled="loading || saving" /></UFormField>
        <div v-if="selectedTitle" class="title-preview"><span>{{ selectedTitle.category }} · {{ selectedTitle.scope === "map" ? selectedTitle.mapName : "全局" }}</span><strong>{{ selectedTitle.label }}</strong><UBadge v-if="selectedTitle.availability === 'retired'" label="不再发放" color="warning" variant="subtle" /></div>
        <UFormField label="原因（可选）" hint="最多 512 字"><UTextarea v-model="reason" :maxlength="512" placeholder="漏发、申诉纠正或特殊奖励说明" :disabled="saving" /></UFormField>
        <div class="form-actions"><UButton type="submit" label="确认发放" :loading="saving" :disabled="loading || saving || !selectedPlayerId || !selectedTitle" /></div>
      </form>
    </UCard>
  </AdminWorkspace>
</template>

<style scoped>
.grant-card { max-width: 720px; }.grant-form { display: grid; gap: 18px; }.title-preview { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }.title-preview span { width: 100%; color: var(--quiet); font-size: .78rem; }.title-preview strong { font-size: 1.1rem; }.form-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
@media (max-width: 620px) { .form-actions, .form-actions button { width: 100%; }.form-actions button { justify-content: center; } }
</style>
