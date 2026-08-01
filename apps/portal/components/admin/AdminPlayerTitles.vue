<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

type Title = { titleKey: string; label: string; category: string; availability: "active" | "retired"; scope: "global" | "map"; mapId?: string; slot?: "pioneer" | "conqueror" | "dominator" };
type TitleOption = Title & { mapName?: string; value: string };
type TitleMenuItem = { label: string; value: string };

const props = defineProps<{ playerAccountId: string; titleGrants: AdminPlayerDetail["titleGrants"]; loading?: boolean }>();
const emit = defineEmits<{ granted: [] }>();
const api = useAdminApi();
const toast = useToast();
const maps = shallowRef<Array<{ mapId: string; mapName: string }>>([]);
const titles = shallowRef<TitleOption[]>([]);
const selectedGlobalValues = ref<TitleMenuItem[]>([]);
const selectedMapValues = ref<TitleMenuItem[]>([]);
const reason = shallowRef("");
const grantOpen = shallowRef(false);
const loadingOptions = shallowRef(true);
const saving = shallowRef(false);
const errorMessage = shallowRef("");
const titleLabel = (title: TitleOption) => `${title.label}${title.availability === "retired" ? "（不再发放）" : ""}`;
const selectedTitleLabel = (title: TitleOption) => `${title.label}${title.mapName ? ` · ${title.mapName}` : ""}`;
const globalTitleItems = computed(() => titles.value.filter((title) => title.scope === "global").map((title) => ({ label: titleLabel(title), value: title.value })));
const mapTitleItems = computed(() => titles.value.filter((title) => title.scope === "map").map((title) => ({ label: `${title.mapName ?? "未知地图"} · ${titleLabel(title)}`, value: title.value })));
const selectedTitleValues = computed(() => new Set([...selectedGlobalValues.value, ...selectedMapValues.value].map((item) => item.value)));
const selectedTitles = computed(() => titles.value.filter((title) => selectedTitleValues.value.has(title.value)));
const selectedTitleCount = computed(() => selectedTitles.value.length);
const sourceLabels = { historical: "历史迁移", submission: "截图审核", manual: "人工发放", automatic: "自动发放" } as const;
const slotLabels = { pioneer: "开拓者", conqueror: "征服者", dominator: "主宰" } as const;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const activeTab = shallowRef<"global" | "map">("global");
const globalGrants = computed(() => props.titleGrants.filter((g) => g.scope === "global"));
const mapGrants = computed(() => props.titleGrants.filter((g) => g.scope === "map"));
const activeGrants = computed(() => activeTab.value === "global" ? globalGrants.value : mapGrants.value);

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
  const selected = selectedTitles.value;
  if (!selected.length) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const results = [];
    for (const title of selected) {
      results.push(await api<{ titleName: string; alreadyOwned: boolean }>("/v1/title-grants/manual", {
        method: "POST",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", playerAccountId: props.playerAccountId, titleKey: title.titleKey, ...(title.mapId ? { mapId: title.mapId } : {}), ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) },
      }));
    }
    const ownedCount = results.filter((result) => result.alreadyOwned).length;
    toast.add({ title: ownedCount === results.length ? `玩家已拥有所选 ${results.length} 个称号，未重复发放` : `已处理 ${results.length} 个称号${ownedCount ? `，其中 ${ownedCount} 个未重复发放` : ""}`, color: "success" });
    selectedGlobalValues.value = [];
    selectedMapValues.value = [];
    reason.value = "";
    grantOpen.value = false;
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
    <div class="section-heading"><div><p class="card-kicker">Entitlements</p><h3 id="player-titles-title">成就与称号</h3></div><div class="section-heading__actions"><UBadge :label="`${activeGrants.length} 项`" color="neutral" variant="subtle" /><UButton data-testid="open-title-grant" label="直接发放" size="sm" @click="grantOpen = true" /></div></div>
    <p v-if="errorMessage" class="title-error" role="alert">{{ errorMessage }}</p>
    <nav class="grants-tabs" aria-label="称号分类">
      <button class="grants-tab" :class="{ 'grants-tab--active': activeTab === 'global' }" @click="activeTab = 'global'">通用称号<span class="grants-tab__count">{{ globalGrants.length }}</span></button>
      <button class="grants-tab" :class="{ 'grants-tab--active': activeTab === 'map' }" @click="activeTab = 'map'">地图专属<span class="grants-tab__count">{{ mapGrants.length }}</span></button>
    </nav>
    <div v-if="activeGrants.length" class="title-table-wrap">
      <table class="title-table">
        <thead v-if="activeTab === 'global'"><tr><th>称号</th><th>来源</th><th>授予时间</th></tr></thead>
        <thead v-else><tr><th>称号</th><th>地图 · 称号槽位</th><th>来源</th><th>授予时间</th></tr></thead>
        <tbody v-if="activeTab === 'global'"><tr v-for="grant in globalGrants" :key="grant.grantId"><td><strong>{{ grant.label }}</strong><small>{{ grant.category }}</small></td><td>{{ sourceLabels[grant.sourceType] }}</td><td class="table-meta">{{ formatTime(grant.grantedAt) }}</td></tr></tbody>
        <tbody v-else><tr v-for="grant in mapGrants" :key="grant.grantId"><td><strong>{{ grant.label }}</strong><small>{{ grant.category }}</small></td><td class="table-map">{{ grant.mapName ?? "未知地图" }}{{ grant.slot ? ` · ${slotLabels[grant.slot]}` : "" }}</td><td>{{ sourceLabels[grant.sourceType] }}</td><td class="table-meta">{{ formatTime(grant.grantedAt) }}</td></tr></tbody>
      </table>
    </div>
    <UEmpty v-else-if="!props.loading" :title="activeTab === 'global' ? '暂无通用称号' : '暂无地图专属称号'" variant="naked" />
    <AdminResponsiveDialog v-model:open="grantOpen" title="直接发放称号" size="md" :dismissible="!saving">
      <template #body>
        <form id="manual-title-grant" class="grant-form" @submit.prevent="grant">
          <div class="grant-section">
            <div class="grant-section__heading"><strong>全局称号</strong></div>
            <UInputMenu v-model="selectedGlobalValues" multiple :items="globalTitleItems" placeholder="选择全局称号" :loading="loadingOptions" :disabled="loadingOptions || saving" />
          </div>
          <div class="grant-section">
            <div class="grant-section__heading"><strong>地图称号</strong></div>
            <UInputMenu v-model="selectedMapValues" multiple :items="mapTitleItems" placeholder="选择地图称号" :loading="loadingOptions" :disabled="loadingOptions || saving" />
          </div>
          <div v-if="selectedTitles.length" class="selected-titles" aria-live="polite">
            <div class="grant-section__heading"><strong>已选择 {{ selectedTitleCount }} 项</strong></div>
            <div class="selected-titles__list"><UBadge v-for="title in selectedTitles" :key="title.value" :label="selectedTitleLabel(title)" color="neutral" variant="subtle" /></div>
          </div>
          <UFormField label="发放原因"><UTextarea v-model="reason" maxlength="512" placeholder="漏发、申诉纠正或特殊人工奖励" :disabled="saving" /></UFormField>
        </form>
      </template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="grantOpen = false" /><UButton type="submit" form="manual-title-grant" label="确认发放" :loading="saving" :disabled="loadingOptions || saving || !selectedTitleCount" /></template>
    </AdminResponsiveDialog>
  </section>
</template>

<style scoped>
.player-titles { display: grid; gap: 18px; margin: 0; }.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; }.section-heading h3 { margin: 0; font-size: 1.08rem; letter-spacing: -.025em; }.section-heading__actions { display: flex; align-items: center; gap: 9px; }.card-kicker { margin: 0 0 5px; color: var(--quiet); font-size: .68rem; font-weight: 700; letter-spacing: .055em; text-transform: uppercase; }
.grants-tabs { display: flex; gap: 5px; width: fit-content; max-width: 100%; padding: 4px; overflow-x: auto; border: 1px solid color-mix(in oklch, var(--line) 76%, transparent); border-radius: 11px; background: color-mix(in oklch, var(--surface-raised) 60%, transparent); }.grants-tab { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font-size: .78rem; font-weight: 650; cursor: pointer; transition: color 140ms ease, background 140ms ease; }.grants-tab:hover { color: var(--text); background: color-mix(in oklch, var(--surface) 72%, transparent); }.grants-tab--active { color: var(--on-accent); background: var(--accent); }.grants-tab__count { display: inline-grid; place-items: center; min-width: 18px; padding: 1px 5px; border-radius: 5px; background: color-mix(in oklch, currentColor 18%, transparent); font-size: .68rem; font-weight: 750; line-height: 1.4; }
.title-table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in oklch, var(--surface-raised) 38%, transparent); }.title-table { width: 100%; min-width: 480px; border-collapse: collapse; font-size: .78rem; }.title-table th, .title-table td { padding: 12px 13px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }.title-table th { color: var(--quiet); font-size: .7rem; font-weight: 700; letter-spacing: .04em; }.title-table tr:last-child td { border-bottom: 0; }.title-table td:first-child { white-space: normal; }.title-table strong, .title-table small { display: block; }.title-table small { margin-top: 4px; color: var(--quiet); }.table-meta { color: var(--quiet); }.table-map { max-width: 200px; white-space: normal; }
.grant-form { display: grid; gap: 18px; }.grant-section { display: grid; gap: 9px; }.grant-section__heading { display: flex; align-items: baseline; gap: 12px; }.grant-section__heading strong { font-size: .84rem; }.selected-titles { display: grid; gap: 9px; padding-top: 2px; border-top: 1px solid var(--line); }.selected-titles__list { display: flex; flex-wrap: wrap; gap: 7px; }.title-error { margin: 0; padding: 10px 12px; border-radius: 9px; color: var(--danger); background: color-mix(in oklch, var(--danger) 12%, var(--surface)); }
@media (max-width: 520px) { .section-heading__actions { align-items: flex-end; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .grants-tab { transition: color 140ms ease, background 140ms ease; } }
</style>
