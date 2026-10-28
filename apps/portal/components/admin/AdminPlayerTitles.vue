<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

type TitleMenuItem = { label: string; value: string };

const props = defineProps<{ playerAccountId: string; titleGrants: AdminPlayerDetail["titleGrants"]; loading?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const api = useAdminApi();
const toast = useToast();
const titles = shallowRef<AdminTitleOption[]>([]);
const selectedGlobalValues = ref<TitleMenuItem[]>([]);
const selectedMapValues = ref<TitleMenuItem[]>([]);
const reason = shallowRef("");
const busyGrantId = shallowRef("");
/** Shown at once on press and dropped when the server state arrives or the request fails. */
const optimistic = ref<Record<string, "active" | "revoked">>({});
const statusOf = (grant: AdminPlayerDetail["titleGrants"][number]) => optimistic.value[grant.grantId] ?? grant.status;
watch(() => props.titleGrants, () => { optimistic.value = {}; });
const grantOpen = shallowRef(false);
const loadingOptions = shallowRef(true);
const saving = shallowRef(false);
const errorMessage = shallowRef("");
const recoveryOpen = shallowRef(false);
const recoveryGrantIds = ref<string[]>([]);
const recovering = shallowRef(false);
const recoveryError = shallowRef("");
const titleLabel = (title: AdminTitleOption) => `${title.label}${title.availability === "retired" ? "（不再发放）" : ""}`;
const selectedTitleLabel = (title: AdminTitleOption) => `${title.label}${title.mapName ? ` · ${title.mapName}` : ""}`;
const globalTitleItems = computed(() => titles.value.filter((title) => title.scope === "global").map((title) => ({ label: titleLabel(title), value: title.value })));
const mapTitleItems = computed(() => titles.value.filter((title) => title.scope === "map").map((title) => ({ label: `${title.mapName ?? "未知地图"} · ${titleLabel(title)}`, value: title.value })));
const selectedTitleValues = computed(() => new Set([...selectedGlobalValues.value, ...selectedMapValues.value].map((item) => item.value)));
const selectedTitles = computed(() => titles.value.filter((title) => selectedTitleValues.value.has(title.value)));
const selectedTitleCount = computed(() => selectedTitles.value.length);
const sourceLabels = { historical: "历史迁移", submission: "截图核对", manual: "人工发放", automatic: "自动获得" } as const;
const slotLabels = { pioneer: "开拓者", conqueror: "征服者", dominator: "主宰" } as const;
const globalGrants = computed(() => props.titleGrants.filter((grant) => grant.scope === "global"));
const mapGroups = computed(() => {
  const groups = new Map<string, AdminPlayerDetail["titleGrants"]>();
  for (const grant of props.titleGrants.filter((item) => item.scope === "map")) {
    const name = grant.mapName ?? "未知地图";
    groups.set(name, [...(groups.get(name) ?? []), grant]);
  }
  return [...groups.entries()].map(([mapName, grants]) => ({ mapName, grants }));
});
const grantMeta = (grant: AdminPlayerDetail["titleGrants"][number]) => [grant.slot ? slotLabels[grant.slot] : grant.category, sourceLabels[grant.sourceType], formatTime(grant.grantedAt)].join(" · ");
const equipableGrants = computed(() => props.titleGrants.filter((grant) => grant.equipable === true));
const recoveryItems = computed(() => equipableGrants.value.map((grant) => ({
  value: grant.grantId,
  label: grant.label,
  description: grant.scope === "map" ? grant.mapName ?? "地图称号" : grant.category,
  disabled: recovering.value || (recoveryGrantIds.value.length >= 10 && !recoveryGrantIds.value.includes(grant.grantId)),
})));
const recoverySelectionError = computed(() => recoveryGrantIds.value.length > 10 ? "最多选择 10 个称号。" : "");

async function loadOptions() {
  loadingOptions.value = true;
  try {
    titles.value = (await loadAdminTitleOptions(api)).sort((left, right) => {
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
    emit("changed");
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法授予称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

async function revoke(grant: AdminPlayerDetail["titleGrants"][number]) {
  busyGrantId.value = grant.grantId;
  optimistic.value = { ...optimistic.value, [grant.grantId]: "revoked" };
  try {
    await api(`/v1/title-grants/${encodeURIComponent(grant.grantId)}/revoke`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
    emit("changed");
    toast.add({ title: `已回收${grant.label}`, color: "neutral", duration: 8000, actions: [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => { void restore(grant); } }] });
  } catch (error) {
    optimistic.value = { ...optimistic.value, [grant.grantId]: "active" };
    toast.add({ title: "无法回收称号", description: portalErrorDetails(error).description, color: "error" });
  } finally { busyGrantId.value = ""; }
}

async function restore(grant: AdminPlayerDetail["titleGrants"][number]) {
  busyGrantId.value = grant.grantId;
  optimistic.value = { ...optimistic.value, [grant.grantId]: "active" };
  try {
    await api(`/v1/title-grants/${encodeURIComponent(grant.grantId)}/restore`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
    emit("changed");
    toast.add({ title: `已恢复${grant.label}`, color: "success" });
  } catch (error) {
    optimistic.value = { ...optimistic.value, [grant.grantId]: "revoked" };
    toast.add({ title: `无法恢复${grant.label}`, description: `${portalErrorDetails(error).description} 同一地图和版本已有当前称号时无法恢复。`, color: "error" });
  } finally { busyGrantId.value = ""; }
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
    emit("changed");
  } catch (error) {
    recoveryError.value = portalErrorDetails(error, "无法修复佩戴称号，请稍后重试。").description;
  } finally {
    recovering.value = false;
  }
}

onMounted(() => { void loadOptions(); });
defineExpose({ openGrant: () => { grantOpen.value = true; }, openEquip: openRecovery });
</script>

<template>
  <section class="player-titles" aria-label="称号">
    <UAlert v-if="errorMessage && !grantOpen" color="error" variant="subtle" :description="errorMessage" />
    <section class="title-group" aria-labelledby="titles-global">
      <h3 id="titles-global">全局称号</h3>
      <ul v-if="globalGrants.length" class="title-cards">
        <li v-for="grant in globalGrants" :key="grant.grantId" class="title-card" :class="{ 'title-card--revoked': statusOf(grant) === 'revoked' }">
          <div class="title-card__main"><strong>{{ grant.label }}<span v-if="grant.equipped" class="title-card__star" title="已佩戴"> ★</span></strong><small>{{ grantMeta(grant) }}</small></div>
          <UButton v-if="statusOf(grant) === 'active'" label="回收" size="sm" color="error" variant="ghost" @click="revoke(grant)" />
          <UBadge v-else label="已回收" color="error" variant="subtle" />
        </li>
      </ul>
      <p v-else class="title-empty">暂无全局称号。</p>
    </section>
    <section v-for="group in mapGroups" :key="group.mapName" class="title-group" :aria-label="`${group.mapName}称号`">
      <h3>{{ group.mapName }}</h3>
      <ul class="title-cards">
        <li v-for="grant in group.grants" :key="grant.grantId" class="title-card" :class="{ 'title-card--revoked': statusOf(grant) === 'revoked' }">
          <div class="title-card__main"><strong>{{ grant.label }}<span v-if="grant.equipped" class="title-card__star" title="已佩戴"> ★</span></strong><small>{{ grantMeta(grant) }}</small></div>
          <UButton v-if="statusOf(grant) === 'active'" label="回收" size="sm" color="error" variant="ghost" @click="revoke(grant)" />
          <UBadge v-else label="已回收" color="error" variant="subtle" />
        </li>
      </ul>
    </section>
    <p v-if="!titleGrants.length" class="title-empty">还没有称号。</p>
    <AdminResponsiveDialog v-model:open="grantOpen" title="手动授予称号" size="md" :dismissible="!saving">
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
      <template #footer><UButton type="submit" form="manual-title-grant" label="确认授予" :loading="saving" :disabled="loadingOptions || saving || !selectedTitleCount" /><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="grantOpen = false" /></template>
    </AdminResponsiveDialog>
    <AdminResponsiveDialog v-model:open="recoveryOpen" title="修复佩戴称号" size="md" :dismissible="!recovering">
      <template #body>
        <form id="recover-player-titles" class="recovery-form" @submit.prevent="recover">
          <UAlert v-if="recoveryError" color="error" variant="subtle" :description="recoveryError" />
          <p class="recovery-note">修复只更新佩戴选择，不会回收或删除其他称号。</p>
          <UCheckboxGroup v-model="recoveryGrantIds" class="recovery-list" variant="card" :legend="`可佩戴称号（已选择 ${recoveryGrantIds.length} / 10）`" :items="recoveryItems" />
          <p v-if="recoverySelectionError" class="title-error" role="alert">{{ recoverySelectionError }}</p>
        </form>
      </template>
      <template #footer><UButton label="保存佩戴选择" type="submit" form="recover-player-titles" :loading="recovering" :disabled="recovering || Boolean(recoverySelectionError)" /><UButton label="取消" color="neutral" variant="outline" :disabled="recovering" @click="recoveryOpen = false" /></template>
    </AdminResponsiveDialog>
  </section>
</template>

<style scoped>
.player-titles { container-type: inline-size; display: grid; gap: var(--space-5); margin: 0; }
.title-group { display: grid; gap: var(--space-2); }
.title-group h3 { margin: 0; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 700; letter-spacing: .055em; }
.title-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.title-card { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); }
.title-card { transition: opacity 160ms ease, background-color 160ms ease; }
.title-card--revoked { opacity: .55; }
.title-card__main { display: grid; gap: var(--space-1); min-width: 0; }
.title-card__main strong { overflow-wrap: anywhere; }
.title-card__main small { color: var(--quiet); }
.title-card__star { color: var(--accent); }
.title-empty { margin: 0; color: var(--quiet); }
.grant-form { display: grid; gap: var(--space-5); }
.grant-section { display: grid; gap: var(--space-2); }
.grant-section__heading strong { font-size: var(--type-label-sm-size); }
.selected-titles { display: grid; gap: var(--space-2); padding-top: var(--space-1); border-top: 1px solid var(--line); }
.selected-titles__list { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.title-error { margin: 0; padding: var(--space-3); border-radius: var(--radius-control); color: var(--danger); background: color-mix(in oklch, var(--danger) 12%, var(--surface)); }
.recovery-form { display: grid; gap: var(--space-4); }
.recovery-list { max-height: 360px; overflow: auto; }
.recovery-note { margin: 0; color: var(--muted); line-height: 1.55; }
</style>
