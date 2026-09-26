<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

type Title = { titleKey: string; label: string; category: string; availability: "active" | "retired"; scope: "global" | "map"; mapId?: string; slot?: "pioneer" | "conqueror" | "dominator" };
type TitleOption = Title & { mapName?: string; value: string };
type TitleMenuItem = { label: string; value: string };
type GrantRow = AdminPlayerDetail["titleGrants"][number] & { sourceLabel: string; mapLabel: string };

const props = defineProps<{ playerAccountId: string; titleGrants: AdminPlayerDetail["titleGrants"]; loading?: boolean }>();
const emit = defineEmits<{ granted: []; revoked: []; recovered: [] }>();
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
const revokeTarget = shallowRef<AdminPlayerDetail["titleGrants"][number] | null>(null);
const revokeReason = shallowRef("");
const revoking = shallowRef(false);
const recoveryOpen = shallowRef(false);
const recoveryGrantIds = ref<string[]>([]);
const recovering = shallowRef(false);
const recoveryError = shallowRef("");
const titleLabel = (title: TitleOption) => `${title.label}${title.availability === "retired" ? "（不再发放）" : ""}`;
const selectedTitleLabel = (title: TitleOption) => `${title.label}${title.mapName ? ` · ${title.mapName}` : ""}`;
const globalTitleItems = computed(() => titles.value.filter((title) => title.scope === "global").map((title) => ({ label: titleLabel(title), value: title.value })));
const mapTitleItems = computed(() => titles.value.filter((title) => title.scope === "map").map((title) => ({ label: `${title.mapName ?? "未知地图"} · ${titleLabel(title)}`, value: title.value })));
const selectedTitleValues = computed(() => new Set([...selectedGlobalValues.value, ...selectedMapValues.value].map((item) => item.value)));
const selectedTitles = computed(() => titles.value.filter((title) => selectedTitleValues.value.has(title.value)));
const selectedTitleCount = computed(() => selectedTitles.value.length);
const sourceLabels = { historical: "历史迁移", submission: "截图核对", manual: "人工发放", automatic: "自动获得" } as const;
const slotLabels = { pioneer: "开拓者", conqueror: "征服者", dominator: "主宰" } as const;
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const activeTab = shallowRef<"global" | "map">("global");
const globalGrants = computed(() => props.titleGrants.filter((g) => g.scope === "global"));
const mapGrants = computed(() => props.titleGrants.filter((g) => g.scope === "map"));
const activeGrants = computed(() => activeTab.value === "global" ? globalGrants.value : mapGrants.value);
const sorting = shallowRef<SortingState>([{ id: "grantedAt", desc: true }]);
const grantRows = computed<GrantRow[]>(() => activeGrants.value.map((grant) => ({
  ...grant,
  sourceLabel: sourceLabels[grant.sourceType],
  mapLabel: `${grant.mapName ?? "未知地图"}${grant.slot ? ` · ${slotLabels[grant.slot]}` : ""}`,
})));
const grantColumns = computed<TableColumn<GrantRow>[]>(() => [
  { accessorKey: "label", header: "称号" },
  ...(activeTab.value === "map" ? [{ accessorKey: "mapLabel", header: "地图 · 称号槽位" }] : []),
  { accessorKey: "sourceLabel", header: "来源" },
  { accessorKey: "grantedAt", header: "授予时间" },
  { id: "actions", header: "操作", enableHiding: false },
]);
const grantMobileColumns = computed(() => [
  { id: "label", priority: "primary" as const, order: 0 },
  ...(activeTab.value === "map" ? [{ id: "mapLabel", priority: "primary" as const, order: 1 }] : []),
  { id: "sourceLabel", priority: "detail" as const, order: 2 },
  { id: "grantedAt", priority: "detail" as const, order: 3 },
]);
const revokeDescription = computed(() => {
  if (!revokeTarget.value) return undefined;
  return `${revokeTarget.value.label}${revokeTarget.value.mapName ? ` · ${revokeTarget.value.mapName}` : ""}`;
});
const equipableGrants = computed(() => props.titleGrants.filter((grant) => grant.scope === "global" && grant.equipable !== false));
const recoveryRequired = computed(() => equipableGrants.value.length > 10 && equipableGrants.value.every((grant) => !grant.equipped));
const recoverySelectionError = computed(() => recoveryGrantIds.value.length > 10 ? "最多选择 10 个称号。" : "");

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
    titles.value = [...new Map(options.map((title) => [title.value, title])).values()].sort((left, right) => {
      if (left.scope !== right.scope) return left.scope === "global" ? -1 : 1;
      const map = (left.mapName ?? "").localeCompare(right.mapName ?? "", "zh-CN");
      if (map) return map;
      return left.label.localeCompare(right.label, "zh-CN");
    });
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
    const result = await api<{ requestedCount: number; createdCount: number; alreadyOwnedCount: number }>("/v1/title-grants/manual/batch", {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", playerAccountIds: [props.playerAccountId], targets: selected.map((title) => ({ titleKey: title.titleKey, ...(title.mapId ? { mapId: title.mapId } : {}) })), ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) },
    });
    toast.add({ title: result.alreadyOwnedCount === result.requestedCount ? `玩家已拥有所选 ${result.requestedCount} 个称号，未重复发放` : `已处理 ${result.requestedCount} 个称号${result.alreadyOwnedCount ? `，其中 ${result.alreadyOwnedCount} 个未重复发放` : ""}`, color: "success" });
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

function requestRevoke(grant: AdminPlayerDetail["titleGrants"][number]) {
  revokeReason.value = "";
  revokeTarget.value = grant;
}

function closeRevoke(force = false) {
  if (revoking.value && !force) return;
  revokeTarget.value = null;
  revokeReason.value = "";
}

async function revoke() {
  const target = revokeTarget.value;
  if (!target) return;
  revoking.value = true;
  errorMessage.value = "";
  try {
    const reasonValue = revokeReason.value.trim();
    await api(`/v1/title-grants/${encodeURIComponent(target.grantId)}/revoke`, {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", ...(reasonValue ? { reason: reasonValue } : {}) },
    });
    toast.add({ title: `已回收${target.label}`, color: "success" });
    closeRevoke(true);
    emit("revoked");
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法回收称号，请稍后重试。").description;
  } finally {
    revoking.value = false;
  }
}

function openRecovery() {
  recoveryGrantIds.value = [];
  recoveryError.value = "";
  recoveryOpen.value = true;
}

async function recover() {
  if (recoveryGrantIds.value.length > 10) return;
  recovering.value = true;
  recoveryError.value = "";
  try {
    await api(`/v1/player-accounts/${encodeURIComponent(props.playerAccountId)}/titles/equipped`, {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", grantIds: recoveryGrantIds.value },
    });
    toast.add({ title: "佩戴称号已修复", color: "success" });
    recoveryOpen.value = false;
    emit("recovered");
  } catch (error) {
    recoveryError.value = portalErrorDetails(error, "无法修复佩戴称号，请稍后重试。").description;
  } finally {
    recovering.value = false;
  }
}

onMounted(() => { void loadOptions(); });
</script>

<template>
  <section class="player-titles" aria-labelledby="player-titles-title">
    <div class="section-heading"><div><h3 id="player-titles-title">称号</h3></div><div class="section-heading__actions"><UBadge :label="`${activeGrants.length} 项`" color="neutral" variant="subtle" /><UButton label="编辑佩戴选择" size="sm" :color="recoveryRequired ? 'warning' : 'neutral'" @click="openRecovery" /><UButton label="直接发放" size="sm" @click="grantOpen = true" /></div></div>
    <UAlert v-if="recoveryRequired" color="warning" variant="subtle" title="该玩家需要选择佩戴称号" description="迁移保留了全部称号，但没有初始化佩戴选择。可在这里选择最多 10 个，不会改变称号授予记录。" />
    <p v-if="errorMessage && !grantOpen && !revokeTarget" class="title-error" role="alert">{{ errorMessage }}</p>
    <nav class="grants-tabs" aria-label="称号分类">
      <button class="grants-tab" :class="{ 'grants-tab--active': activeTab === 'global' }" :aria-pressed="activeTab === 'global'" @click="activeTab = 'global'">全局称号<span class="grants-tab__count">{{ globalGrants.length }}</span></button>
      <button class="grants-tab" :class="{ 'grants-tab--active': activeTab === 'map' }" :aria-pressed="activeTab === 'map'" @click="activeTab = 'map'">地图称号<span class="grants-tab__count">{{ mapGrants.length }}</span></button>
    </nav>
    <AdminDataTable
      v-model:sorting="sorting"
      :data="grantRows"
      :columns="grantColumns"
      :mobile-columns="grantMobileColumns"
      :default-sorting="[{ id: 'grantedAt', desc: true }]"
      row-key="grantId"
      :loading="props.loading"
      :empty="activeTab === 'global' ? '暂无全局称号。' : '暂无地图称号。'"
      table-key="player-title-grants"
      table-min-width="640px"
    >
      <template #label-cell="{ row }"><strong>{{ row.original.label }}<span v-if="row.original.equipped" class="equipped-mark"> · 已佩戴</span></strong><small>{{ row.original.category }}</small></template>
      <template #sourceLabel-cell="{ row }"><span>{{ row.original.sourceLabel }}</span></template>
      <template #grantedAt-cell="{ row }"><span class="table-meta">{{ formatTime(row.original.grantedAt) }}</span></template>
      <template #actions-cell="{ row }">
        <div class="table-actions">
          <UButton label="回收" color="error" variant="outline" size="sm" :disabled="props.loading || revoking" @click="requestRevoke(row.original)" />
        </div>
      </template>
    </AdminDataTable>
    <AdminResponsiveDialog v-model:open="grantOpen" title="直接发放称号" size="md" :dismissible="!saving">
      <template #body>
        <form id="manual-title-grant" class="grant-form" @submit.prevent="grant">
          <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
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
      <template #footer><UButton type="submit" form="manual-title-grant" label="确认发放" :loading="saving" :disabled="loadingOptions || saving || !selectedTitleCount" /><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="grantOpen = false" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog v-model:open="recoveryOpen" title="修复佩戴称号" size="md" :dismissible="!recovering">
      <template #body>
        <form id="recover-player-titles" class="recovery-form" @submit.prevent="recover">
          <UAlert v-if="recoveryError" color="error" variant="subtle" :description="recoveryError" />
          <p class="recovery-note">选择 0–10 个称号。修复只更新佩戴选择，不会回收或删除其他称号。</p>
          <fieldset class="recovery-list">
            <legend>可佩戴称号（已选择 {{ recoveryGrantIds.length }} / 10）</legend>
            <label v-for="grant in equipableGrants" :key="grant.grantId" class="recovery-item">
              <input v-model="recoveryGrantIds" type="checkbox" :value="grant.grantId" :disabled="recovering || (recoveryGrantIds.length >= 10 && !recoveryGrantIds.includes(grant.grantId))" />
              <span>{{ grant.label }}<small>{{ grant.scope === 'map' ? grant.mapName ?? '地图称号' : grant.category }}</small></span>
            </label>
          </fieldset>
          <p v-if="recoverySelectionError" class="title-error" role="alert">{{ recoverySelectionError }}</p>
        </form>
      </template>
      <template #footer><UButton label="保存佩戴选择" type="submit" form="recover-player-titles" :loading="recovering" :disabled="recovering || Boolean(recoverySelectionError)" /><UButton label="取消" color="neutral" variant="outline" :disabled="recovering" @click="recoveryOpen = false" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog :open="revokeTarget !== null" title="回收玩家称号" :description="revokeDescription" size="sm" :dismissible="!revoking" @update:open="(open) => { if (!open) closeRevoke(); }">
      <template #body>
        <form id="revoke-player-title" class="revoke-form" @submit.prevent="revoke">
          <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
          <p class="revoke-note">回收后，该称号将不再计入玩家当前称号；历史记录会保留。</p>
          <UFormField label="回收原因"><UTextarea v-model="revokeReason" maxlength="256" placeholder="例如：误授或资格变更" :disabled="revoking" /></UFormField>
        </form>
      </template>
      <template #footer><UButton label="确认回收" color="error" variant="soft" type="submit" form="revoke-player-title" :loading="revoking" /><UButton label="取消" color="neutral" variant="outline" :disabled="revoking" @click="closeRevoke()" /></template>
    </AdminResponsiveDialog>
  </section>
</template>

<style scoped>
.player-titles { container-type: inline-size; display: grid; gap: var(--space-5); margin: 0; }
.section-heading { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
.section-heading h3 { margin: 0; font-size: var(--type-card-title-size); letter-spacing: -.025em; }
.section-heading__actions { display: flex; align-items: center; gap: var(--space-2); }
.card-kicker { margin: 0 0 var(--space-1); color: var(--quiet); font-size: var(--type-caption-size); font-weight: 700; letter-spacing: .055em; text-transform: uppercase; }
.grants-tabs { display: flex; gap: var(--space-1); width: fit-content; max-width: 100%; padding: var(--space-1); overflow-x: auto; border: 1px solid color-mix(in oklch, var(--line) 76%, transparent); border-radius: var(--radius-control); background: color-mix(in oklch, var(--surface-raised) 60%, transparent); }
.grants-tab { display: flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--muted); font-size: var(--type-caption-size); font-weight: 600; cursor: pointer; transition: color 140ms ease, background 140ms ease; }
.grants-tab:hover { color: var(--text); background: color-mix(in oklch, var(--surface) 72%, transparent); }
.grants-tab--active { color: var(--on-accent); background: var(--accent); }
.grants-tab__count { display: inline-grid; place-items: center; min-width: 18px; padding: 1px var(--space-1); border-radius: var(--radius-pill); background: color-mix(in oklch, currentColor 18%, transparent); font-size: var(--type-caption-size); font-weight: 700; line-height: 1.4; }
.grant-form { display: grid; gap: var(--space-5); }
.grant-section { display: grid; gap: var(--space-2); }
.grant-section__heading { display: flex; align-items: baseline; gap: var(--space-3); }
.grant-section__heading strong { font-size: var(--type-label-sm-size); }
.selected-titles { display: grid; gap: var(--space-2); padding-top: var(--space-1); border-top: 1px solid var(--line); }
.selected-titles__list { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.title-error { margin: 0; padding: var(--space-3); border-radius: var(--radius-control); color: var(--danger); background: color-mix(in oklch, var(--danger) 12%, var(--surface)); }
.player-titles :deep(td strong) { display: block; }
.player-titles :deep(td small) { display: block; margin-top: var(--space-1); color: var(--quiet); }
.equipped-mark { color: var(--success); font-size: var(--type-caption-size); }
.table-meta { color: var(--quiet); }
.recovery-form { display: grid; gap: var(--space-4); }
.recovery-note { margin: 0; color: var(--muted); line-height: 1.55; }
.recovery-list { display: grid; gap: var(--space-2); max-height: 360px; margin: 0; padding: 0; border: 0; overflow: auto; }
.recovery-list legend { margin-bottom: var(--space-1); color: var(--text); font-size: var(--type-label-sm-size); font-weight: 700; }
.recovery-item { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); cursor: pointer; }
.recovery-item input { margin-top: var(--space-1); }
.recovery-item span { display: grid; gap: var(--space-1); }
.recovery-item small { color: var(--quiet); }
@container (max-width: 23.99rem) { .section-heading__actions { align-items: flex-end; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .grants-tab { transition: color 140ms ease, background 140ms ease; } }
</style>
