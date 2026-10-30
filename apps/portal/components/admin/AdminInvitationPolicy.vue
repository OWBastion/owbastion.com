<script setup lang="ts">
import type { AdminPlayerInvitationOverrideListResponse, AdminPlayerInvitationPolicyResponse, PlayerInvitationOverride, PlayerInvitationPolicy } from "@owbastion/contracts/player-invitation";
import { parseBattleTag } from "~/utils/binding-invite";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

const props = defineProps<{ playerAccountId?: string }>();
const emit = defineEmits<{ saved: [] }>();

const api = useAdminApi();
const error = shallowRef("");
const feedback = shallowRef("");
const busy = shallowRef(false);
const overrides = shallowRef<AdminPlayerInvitationOverrideListResponse | null>(null);
const overridePage = shallowRef(1);
const dialogOpen = shallowRef(false);

const emptyPolicy = (): PlayerInvitationPolicy => ({ enabled: false, period: "week", maxCodesCreatedPerPeriod: 1, maxRegistrationsPerPeriod: 1, maxUsesPerCode: 1, maxValidityDays: 7, minAccountAgeDays: 0, minApprovedSubmissions: 0, eligibilityMode: "any" });
const policy = reactive<PlayerInvitationPolicy>(emptyPolicy());

const emptyOverride = (): PlayerInvitationOverride => ({ enabled: null, maxCodesCreatedPerPeriod: null, maxRegistrationsPerPeriod: null, maxUsesPerCode: null, maxValidityDays: null, minAccountAgeDays: null, minApprovedSubmissions: null, eligibilityMode: null });
const override = reactive<PlayerInvitationOverride>(emptyOverride());
const battleTag = shallowRef("");
const targetId = shallowRef("");

type NumberKey = "maxCodesCreatedPerPeriod" | "maxRegistrationsPerPeriod" | "maxUsesPerCode" | "maxValidityDays" | "minAccountAgeDays" | "minApprovedSubmissions";
type Row = { key: NumberKey; label: string; unit: string; min: number; on?: number };
const requireRows: Row[] = [
  { key: "minAccountAgeDays", label: "帐号注册满", unit: "天", min: 1, on: 7 },
  { key: "minApprovedSubmissions", label: "通过提交满", unit: "次", min: 1, on: 1 },
];
const quotaRows: Row[] = [
  { key: "maxCodesCreatedPerPeriod", label: "最多创建邀请码", unit: "个", min: 1 },
  { key: "maxRegistrationsPerPeriod", label: "最多邀请注册", unit: "人", min: 1 },
];
const codeRows: Row[] = [
  { key: "maxUsesPerCode", label: "最多使用", unit: "次", min: 1 },
  { key: "maxValidityDays", label: "有效期最长", unit: "天", min: 1 },
];
const periods = [{ label: "每日", value: "day" }, { label: "每周", value: "week" }, { label: "每月", value: "month" }];
const modes = [{ label: "满足任一项", value: "any" }, { label: "两项都满足", value: "all" }];
const inheritModes = [{ label: "继承", value: "inherit" }, ...modes];
const enabledChoices = [{ label: "继承", value: "inherit" }, { label: "开启", value: "on" }, { label: "关闭", value: "off" }];
const enabledChoice = computed({
  get: () => override.enabled === null ? "inherit" : override.enabled ? "on" : "off",
  set: (value) => { override.enabled = value === "inherit" ? null : value === "on"; },
});
const modeChoice = computed({
  get: () => override.eligibilityMode ?? "inherit",
  set: (value) => { override.eligibilityMode = value === "inherit" ? null : value as "any" | "all"; },
});

const bothPolicy = computed(() => policy.minAccountAgeDays > 0 && policy.minApprovedSubmissions > 0);
const bothOverride = computed(() => (override.minAccountAgeDays ?? policy.minAccountAgeDays) > 0 && (override.minApprovedSubmissions ?? policy.minApprovedSubmissions) > 0);
const inheritText = (key: NumberKey) => `继承 ${policy[key] || "不限"}`;
const overrideSummary = (item: PlayerInvitationOverride) => {
  const parts = [...requireRows, ...quotaRows, ...codeRows].filter((row) => item[row.key] !== null).map((row) => `${row.label} ${item[row.key]} ${row.unit}`);
  if (item.enabled !== null) parts.unshift(item.enabled ? "开启邀请" : "关闭邀请");
  return parts.join("，") || "全部继承";
};

async function run(action: () => Promise<unknown>, done: string, fallback: string) {
  if (busy.value) return false;
  busy.value = true;
  error.value = "";
  feedback.value = "";
  try {
    await action();
    feedback.value = done;
    return true;
  } catch (cause) {
    error.value = portalErrorDetails(cause, fallback).description;
    return false;
  } finally { busy.value = false; }
}

async function loadPolicy() {
  const response = await api<AdminPlayerInvitationPolicyResponse>("/v1/player-invitations/policy");
  Object.assign(policy, response.policy ?? emptyPolicy());
}
async function loadOverrides() {
  overrides.value = await api<AdminPlayerInvitationOverrideListResponse>(`/v1/player-invitations/overrides?page=${overridePage.value}&pageSize=20`);
}
const load = () => run(() => Promise.all([loadPolicy(), loadOverrides()]), "", "无法读取邀请策略。");

const savePolicy = () => run(async () => {
  await api("/v1/player-invitations/policy", { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", policy: { ...policy } } });
  emit("saved");
}, "已保存策略。", "保存失败，请稍后重试。");

async function resolveTarget() {
  if (targetId.value) return targetId.value;
  const tag = parseBattleTag(battleTag.value);
  if (!tag) throw new Error("请输入 BattleTag，如 玩家名#1234。");
  const found = await api<{ items: { playerAccountId: string; playerName: string; playerId: string }[] }>(`/v1/player-accounts?query=${encodeURIComponent(tag.playerName)}&status=active&page=1&pageSize=20`);
  const match = found.items.find((item) => item.playerName === tag.playerName && item.playerId === tag.playerId);
  if (!match) throw new Error("没有找到这个玩家。");
  return match.playerAccountId;
}
const saveOverride = async () => {
  const saved = await run(async () => {
    const id = await resolveTarget();
    await api(`/v1/player-invitations/overrides/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", override: { ...override } } });
    await loadOverrides();
  }, "已保存个人额度。", "保存失败，请稍后重试。");
  if (saved) dialogOpen.value = false;
};
const clearOverride = (id: string) => run(async () => {
  await api(`/v1/player-invitations/overrides/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Idempotency-Key": createRequestId() } });
  await loadOverrides();
}, "已恢复默认。", "操作未完成，请稍后重试。");

function openOverride(item?: AdminPlayerInvitationOverrideListResponse["items"][number]) {
  Object.assign(override, item?.override ?? emptyOverride());
  targetId.value = item?.playerAccountId ?? "";
  battleTag.value = item ? `${item.playerName}#${item.playerId}` : "";
  dialogOpen.value = true;
}

watch(() => props.playerAccountId, (id) => {
  if (!id) return;
  openOverride(overrides.value?.items.find((item) => item.playerAccountId === id));
  targetId.value = id;
});
watch(overridePage, () => void run(loadOverrides, "", "无法读取个人额度。"));
onMounted(load);
</script>

<template>
  <div class="policy">
    <UAlert v-if="error" color="error" variant="subtle" :description="error" />
    <UAlert v-if="feedback" color="success" variant="subtle" :description="feedback" />

    <form class="block" aria-labelledby="policy-title" @submit.prevent="savePolicy">
      <div class="head">
        <h2 id="policy-title" class="block-title">玩家邀请</h2>
        <USwitch v-model="policy.enabled" aria-label="开放玩家邀请" />
      </div>
      <fieldset class="group" :disabled="!policy.enabled">
        <legend class="group-title">谁可以邀请</legend>
        <div v-for="row in requireRows" :key="row.key" class="row">
          <USwitch :model-value="policy[row.key] > 0" :aria-label="row.label" @update:model-value="policy[row.key] = $event ? row.on ?? 1 : 0" />
          <span class="label">{{ row.label }}</span>
          <template v-if="policy[row.key] > 0">
            <UInputNumber v-model="policy[row.key]" :aria-label="row.label" :min="row.min" class="num" />
            <span class="unit">{{ row.unit }}</span>
          </template>
        </div>
        <URadioGroup v-if="bothPolicy" v-model="policy.eligibilityMode" :items="modes" orientation="horizontal" legend="资格关系" />
      </fieldset>
      <fieldset class="group" :disabled="!policy.enabled">
        <legend class="group-title">名额</legend>
        <USelect v-model="policy.period" aria-label="额度周期" :items="periods" class="w-full" />
        <div v-for="row in quotaRows" :key="row.key" class="row">
          <span class="label">{{ row.label }}</span>
          <UInputNumber v-model="policy[row.key]" :aria-label="row.label" :min="row.min" class="num" />
          <span class="unit">{{ row.unit }}</span>
        </div>
      </fieldset>
      <fieldset class="group" :disabled="!policy.enabled">
        <legend class="group-title">每个邀请码</legend>
        <div v-for="row in codeRows" :key="row.key" class="row">
          <span class="label">{{ row.label }}</span>
          <UInputNumber v-model="policy[row.key]" :aria-label="row.label" :min="row.min" class="num" />
          <span class="unit">{{ row.unit }}</span>
        </div>
      </fieldset>
      <UButton type="submit" label="保存" :loading="busy" :disabled="busy" />
    </form>

    <section class="block" aria-labelledby="override-title">
      <div class="head">
        <h2 id="override-title" class="block-title">个人例外</h2>
        <UButton label="添加" color="neutral" variant="outline" size="sm" @click="openOverride()" />
      </div>
      <ul v-if="overrides?.items.length" class="list">
        <li v-for="item in overrides.items" :key="item.playerAccountId" class="entry">
          <div class="entry-main">
            <PlayerBattleTag :player-name="item.playerName" :player-id="item.playerId" mode="identity" />
            <span class="summary">{{ overrideSummary(item.override) }}</span>
          </div>
          <span class="actions">
            <UButton label="编辑" color="neutral" variant="ghost" size="sm" @click="openOverride(item)" />
            <UButton label="恢复默认" color="neutral" variant="ghost" size="sm" :disabled="busy" @click="clearOverride(item.playerAccountId)" />
          </span>
        </li>
      </ul>
      <UPagination v-if="overrides && overrides.total > overrides.pageSize" v-model:page="overridePage" :total="overrides.total" :items-per-page="overrides.pageSize" />
    </section>

    <AdminResponsiveDialog v-model:open="dialogOpen" title="个人例外" size="sm" :dismissible="!busy">
      <template #body>
        <form id="invitation-override-form" class="dialog-form" @submit.prevent="saveOverride">
          <UAlert v-if="error" color="error" variant="subtle" :description="error" />
          <UFormField label="玩家">
            <UInput v-model="battleTag" placeholder="玩家名#1234" class="w-full" :disabled="!!targetId" />
          </UFormField>
          <UFormField label="邀请功能"><USelect v-model="enabledChoice" :items="enabledChoices" class="w-full" /></UFormField>
          <fieldset class="group">
            <legend class="group-title">谁可以邀请</legend>
            <div v-for="row in requireRows" :key="row.key" class="row">
              <span class="label">{{ row.label }}</span>
              <UInputNumber v-model="override[row.key]" :aria-label="row.label" :min="0" :placeholder="inheritText(row.key)" class="num" />
              <span class="unit">{{ row.unit }}</span>
            </div>
            <USelect v-if="bothOverride" v-model="modeChoice" aria-label="资格关系" :items="inheritModes" class="w-full" />
          </fieldset>
          <fieldset class="group">
            <legend class="group-title">名额</legend>
            <div v-for="row in quotaRows" :key="row.key" class="row">
              <span class="label">{{ row.label }}</span>
              <UInputNumber v-model="override[row.key]" :aria-label="row.label" :min="row.min" :placeholder="inheritText(row.key)" class="num" />
              <span class="unit">{{ row.unit }}</span>
            </div>
          </fieldset>
          <fieldset class="group">
            <legend class="group-title">每个邀请码</legend>
            <div v-for="row in codeRows" :key="row.key" class="row">
              <span class="label">{{ row.label }}</span>
              <UInputNumber v-model="override[row.key]" :aria-label="row.label" :min="row.min" :placeholder="inheritText(row.key)" class="num" />
              <span class="unit">{{ row.unit }}</span>
            </div>
          </fieldset>
        </form>
      </template>
      <template #footer>
        <UButton type="submit" form="invitation-override-form" label="保存" :loading="busy" :disabled="busy || (!battleTag && !targetId)" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="busy" @click="dialogOpen = false" />
      </template>
    </AdminResponsiveDialog>
  </div>
</template>

<style scoped>
.policy { display: grid; gap: var(--space-6); }
.block { display: grid; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.block > button { justify-self: start; }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.block-title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.group { display: grid; gap: var(--space-2); min-width: 0; margin: 0; padding: 0; border: 0; }
.group:disabled { opacity: 0.55; }
.group-title { padding: 0 0 var(--space-1); font-size: var(--type-caption-size); font-weight: 600; color: var(--quiet); }
.row { display: flex; align-items: center; gap: var(--space-2); min-height: 2.5rem; }
.label { flex: 1; min-width: 0; }
.num { width: 8.5rem; }
.unit { width: 1.25rem; color: var(--quiet); }
.dialog-form { display: grid; gap: var(--space-4); }
.list { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.entry { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--line); }
.entry-main { display: grid; gap: var(--space-1); }
.summary { color: var(--quiet); font-size: var(--type-caption-size); }
.actions { display: flex; gap: var(--space-1); }
</style>
