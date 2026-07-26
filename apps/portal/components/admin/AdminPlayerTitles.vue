<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";

type Title = { titleKey: string; label: string; category: string; availability: "active" | "retired"; scope: "global" | "map"; mapId?: string; slot?: "pioneer" | "conqueror" | "dominator" };
type TitleOption = Title & { mapName?: string; value: string };

const props = defineProps<{ playerAccountId: string; titleGrants: AdminPlayerDetail["titleGrants"]; loading?: boolean }>();
const emit = defineEmits<{ granted: [] }>();
const api = useAdminApi();
const toast = useToast();
const maps = shallowRef<Array<{ mapId: string; mapName: string }>>([]);
const titles = shallowRef<TitleOption[]>([]);
const selectedTitleValue = shallowRef("");
const reason = shallowRef("");
const loadingOptions = shallowRef(true);
const saving = shallowRef(false);
const errorMessage = shallowRef("");
const selectedTitle = computed(() => titles.value.find((title) => title.value === selectedTitleValue.value));
const titleItems = computed(() => titles.value.map((title) => ({ label: `${title.label}${title.mapName ? ` · ${title.mapName}` : ""}${title.availability === "retired" ? "（不再发放）" : ""}`, value: title.value })));
const sourceLabels = { historical: "历史迁移", submission: "截图审核", manual: "人工发放", automatic: "自动发放" } as const;
const slotLabels = { pioneer: "先锋", conqueror: "征服者", dominator: "支配者" } as const;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);

async function loadOptions() {
  loadingOptions.value = true;
  try {
    const mapResponse = await api<{ items: Array<{ mapId: string; mapName: string }> }>("/v1/maps");
    maps.value = mapResponse.items;
    const responses = await Promise.all([
      api<{ items: Title[] }>("/v1/titles"),
      ...mapResponse.items.map((map) => api<{ items: Title[] }>(`/v1/titles?mapId=${encodeURIComponent(map.mapId)}`)),
    ]);
    const mapNames = new Map(mapResponse.items.map((map) => [map.mapId, map.mapName]));
    const options = responses.flatMap((response) => response.items).map((title) => ({ ...title, mapName: title.mapId ? mapNames.get(title.mapId) : undefined, value: `${title.titleKey}:${title.mapId ?? ""}` }));
    titles.value = [...new Map(options.map((title) => [title.value, title])).values()].sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取称号目录，请稍后重试。").description;
  } finally {
    loadingOptions.value = false;
  }
}

async function grant() {
  const title = selectedTitle.value;
  if (!title) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const result = await api<{ titleName: string; alreadyOwned: boolean }>("/v1/title-grants/manual", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", playerAccountId: props.playerAccountId, titleKey: title.titleKey, ...(title.mapId ? { mapId: title.mapId } : {}), ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) },
    });
    toast.add({ title: result.alreadyOwned ? `玩家此前已拥有「${result.titleName}」，未重复发放` : `已发放「${result.titleName}」`, color: "success" });
    selectedTitleValue.value = "";
    reason.value = "";
    emit("granted");
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法发放称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

onMounted(() => { void loadOptions(); });
</script>

<template>
  <section class="player-titles" aria-labelledby="player-titles-title">
    <div class="section-heading"><div><h3 id="player-titles-title">成就与称号</h3><p>展示当前有效权益，可从这里补发称号。</p></div><UBadge :label="`${props.titleGrants.length} 项有效称号`" color="neutral" variant="subtle" /></div>
    <p v-if="errorMessage" class="title-error" role="alert">{{ errorMessage }}</p>
    <div v-if="props.titleGrants.length" class="title-table-wrap">
      <table class="title-table">
        <thead><tr><th>称号</th><th>范围</th><th>来源</th><th>授予时间</th></tr></thead>
        <tbody><tr v-for="grant in props.titleGrants" :key="grant.grantId"><td><strong>{{ grant.label }}</strong><small>{{ grant.category }}</small></td><td>{{ grant.scope === "map" ? `${grant.mapName ?? "未知地图"} · ${grant.slot ? slotLabels[grant.slot] : ""}` : "全局" }}</td><td>{{ sourceLabels[grant.sourceType] }}</td><td class="table-meta">{{ formatTime(grant.grantedAt) }}</td></tr></tbody>
      </table>
    </div>
    <UEmpty v-else-if="!props.loading" title="暂无有效称号" description="可在下方选择称号进行人工发放。" variant="naked" />
    <form class="grant-form" @submit.prevent="grant">
      <UFormField label="直接发放称号" hint="地图称号的地图范围由目录自动确定"><USelect v-model="selectedTitleValue" :items="titleItems" placeholder="选择称号" :loading="loadingOptions" :disabled="loadingOptions || saving" /></UFormField>
      <UFormField label="发放原因（可选）" hint="最多 512 字"><UTextarea v-model="reason" :maxlength="512" placeholder="漏发、申诉纠正或特殊人工奖励" :disabled="saving" /></UFormField>
      <div class="form-actions"><UButton type="submit" label="确认发放" :loading="saving" :disabled="loadingOptions || saving || !selectedTitle" /></div>
    </form>
  </section>
</template>

<style scoped>
.player-titles { display: grid; gap: 14px; margin-top: 28px; }.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; }.section-heading h3 { margin: 0; font-size: 1rem; }.section-heading p { margin: 5px 0 0; color: var(--quiet); font-size: .78rem; }.title-table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; }.title-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: .78rem; }.title-table th, .title-table td { padding: 11px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }.title-table th { color: var(--quiet); font-size: .7rem; font-weight: 650; letter-spacing: .04em; }.title-table tr:last-child td { border-bottom: 0; }.title-table td:first-child { white-space: normal; }.title-table strong, .title-table small { display: block; }.title-table small { margin-top: 4px; color: var(--quiet); }.table-meta { color: var(--quiet); }.grant-form { display: grid; gap: 12px; padding-top: 4px; }.form-actions { display: flex; justify-content: flex-end; }.title-error { margin: 0; padding: 10px 12px; border-radius: 9px; color: var(--danger); background: color-mix(in oklch, var(--danger) 12%, var(--surface)); }
</style>
