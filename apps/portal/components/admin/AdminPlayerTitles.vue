<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

type Title = { titleKey: string; label: string; category: string; availability: "active" | "retired"; scope: "global" | "map"; mapId?: string; slot?: "pioneer" | "conqueror" | "dominator" };
type TitleOption = Title & { mapName?: string; value: string };
type TitleMenuItem = { label: string; value: string };

const props = defineProps<{ playerAccountId: string; titleGrants: AdminPlayerDetail["titleGrants"]; loading?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const api = useAdminApi();
const toast = useToast();
const maps = shallowRef<Array<{ mapId: string; mapName: string }>>([]);
const titles = shallowRef<TitleOption[]>([]);
const selectedGlobalValues = ref<TitleMenuItem[]>([]);
const selectedMapValues = ref<TitleMenuItem[]>([]);
const reason = shallowRef("");
const busyGrantId = shallowRef("");
const grantOpen = shallowRef(false);
const loadingOptions = shallowRef(true);
const saving = shallowRef(false);
const errorMessage = shallowRef("");
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
const globalGrants = computed(() => props.titleGrants.filter((grant) => grant.scope === "global"));
const mapGroups = computed(() => {
  const groups = new Map<string, AdminPlayerDetail["titleGrants"]>();
  for (const grant of props.titleGrants.filter((item) => item.scope === "map")) {
    const name = grant.mapName ?? "未知地图";
    groups.set(name, [...(groups.get(name) ?? []), grant]);
  }
  return [...groups.entries()].map(([mapName, grants]) => ({ mapName, grants }));
});
const grantMeta = (grant: AdminPlayerDetail["titleGrants"][number]) => [...(grant.status === "revoked" ? ["已回收"] : []), grant.slot ? slotLabels[grant.slot] : grant.category, sourceLabels[grant.sourceType], formatTime(grant.grantedAt)].join(" · ");
const equipableGrants = computed(() => props.titleGrants.filter((grant) => grant.equipable === true));
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
    emit("changed");
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法授予称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

async function revoke(grant: AdminPlayerDetail["titleGrants"][number]) {
  busyGrantId.value = grant.grantId;
  try {
    await api(`/v1/title-grants/${encodeURIComponent(grant.grantId)}/revoke`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
    emit("changed");
    toast.add({ title: `已回收${grant.label}`, color: "neutral", duration: 8000, actions: [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => { void restore(grant); } }] });
  } catch (error) {
    toast.add({ title: "无法回收称号", description: portalErrorDetails(error).description, color: "error" });
  } finally { busyGrantId.value = ""; }
}

async function restore(grant: AdminPlayerDetail["titleGrants"][number]) {
  busyGrantId.value = grant.grantId;
  try {
    await api(`/v1/title-grants/${encodeURIComponent(grant.grantId)}/restore`, { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1" } });
    emit("changed");
    toast.add({ title: `已恢复${grant.label}`, color: "success" });
  } catch (error) {
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
        <li v-for="grant in globalGrants" :key="grant.grantId" class="title-card" :class="{ 'title-card--revoked': grant.status === 'revoked' }">
          <div class="title-card__main"><strong>{{ grant.label }}<span v-if="grant.equipped" class="title-card__star" title="已佩戴"> ★</span></strong><small>{{ grantMeta(grant) }}</small></div>
          <UButton v-if="grant.status === 'active'" label="回收" size="sm" color="error" variant="ghost" :disabled="props.loading || busyGrantId === grant.grantId" @click="revoke(grant)" />
          <UButton v-else-if="grant.revocationType === 'administrator'" label="恢复" size="sm" color="neutral" variant="outline" :disabled="props.loading || busyGrantId === grant.grantId" @click="restore(grant)" />
        </li>
      </ul>
      <p v-else class="title-empty">暂无全局称号。</p>
    </section>
    <section v-for="group in mapGroups" :key="group.mapName" class="title-group" :aria-label="`${group.mapName}称号`">
      <h3>{{ group.mapName }}</h3>
      <ul class="title-cards">
        <li v-for="grant in group.grants" :key="grant.grantId" class="title-card" :class="{ 'title-card--revoked': grant.status === 'revoked' }">
          <div class="title-card__main"><strong>{{ grant.label }}<span v-if="grant.equipped" class="title-card__star" title="已佩戴"> ★</span></strong><small>{{ grantMeta(grant) }}</small></div>
          <UButton v-if="grant.status === 'active'" label="回收" size="sm" color="error" variant="ghost" :disabled="props.loading || busyGrantId === grant.grantId" @click="revoke(grant)" />
          <UButton v-else-if="grant.revocationType === 'administrator'" label="恢复" size="sm" color="neutral" variant="outline" :disabled="props.loading || busyGrantId === grant.grantId" @click="restore(grant)" />
        </li>
      </ul>
    </section>
    <p v-if="!titleGrants.length" class="title-empty">还没有称号。</p>
    <AdminResponsiveDialog v-model:open="grantOpen" title="手动授予称号" size="md" :dismissible="!saving">
      <template #body>
        <form id="manual-title-grant" class="grant-form" @submit.prevent="grant">
          <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
          <p class="recovery-note">系统会通过对应的手动挑战记录完成，再授予称号。</p>
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
  </section>
</template>

<style scoped>
.player-titles { container-type: inline-size; display: grid; gap: var(--space-5); margin: 0; }
.title-group { display: grid; gap: var(--space-2); }
.title-group h3 { margin: 0; color: var(--quiet); font-size: var(--type-caption-size); font-weight: 700; letter-spacing: .055em; }
.title-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.title-card { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); }
.title-card--revoked { opacity: .6; }
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
.recovery-note { margin: 0; color: var(--muted); line-height: 1.55; }
.recovery-list { display: grid; gap: var(--space-2); max-height: 360px; margin: 0; padding: 0; border: 0; overflow: auto; }
.recovery-list legend { margin-bottom: var(--space-1); color: var(--text); font-size: var(--type-label-sm-size); font-weight: 700; }
.recovery-item { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); cursor: pointer; }
.recovery-item input { margin-top: var(--space-1); }
.recovery-item span { display: grid; gap: var(--space-1); }
.recovery-item small { color: var(--quiet); }
</style>
