<script setup lang="ts">
import type { AdminPlayerInvitationOverrideListResponse, AdminPlayerInvitationPolicyResponse, PlayerInvitationOverride, PlayerInvitationPolicy } from "@owbastion/contracts/player-invitation";
import { parseBattleTag } from "~/utils/binding-invite";
import { portalErrorDetails } from "~/utils/portal-error";
import { playerInvitationPeriodLabel } from "~/utils/player-invitation";
import { createRequestId } from "~/utils/request-id";

const props = defineProps<{ playerAccountId?: string }>();
const emit = defineEmits<{ saved: [] }>();

const api = useAdminApi();
const error = shallowRef("");
const feedback = shallowRef("");
const busy = shallowRef(false);
const overrides = shallowRef<AdminPlayerInvitationOverrideListResponse | null>(null);
const overridePage = shallowRef(1);

const emptyPolicy = (): PlayerInvitationPolicy => ({ enabled: false, period: "week", maxCodesCreatedPerPeriod: 0, maxRegistrationsPerPeriod: 0, maxUsesPerCode: 1, maxValidityDays: 7, minAccountAgeDays: 0, minApprovedSubmissions: 0, eligibilityMode: "any" });
const policy = reactive<PlayerInvitationPolicy>(emptyPolicy());

const emptyOverride = (): PlayerInvitationOverride => ({ enabled: null, maxCodesCreatedPerPeriod: null, maxRegistrationsPerPeriod: null, maxUsesPerCode: null, maxValidityDays: null, minAccountAgeDays: null, minApprovedSubmissions: null, eligibilityMode: null });
const override = reactive<PlayerInvitationOverride>(emptyOverride());
const battleTag = shallowRef("");
const targetId = shallowRef(props.playerAccountId ?? "");
watch(() => props.playerAccountId, (id) => { if (id) targetId.value = id; });

const periods = (["day", "week", "month"] as const).map((value) => ({ label: { day: "每日", week: "每周", month: "每月" }[value], value }));
const modes = [{ label: "满足任一项", value: "any" }, { label: "两项都满足", value: "all" }];
const inheritModes = [{ label: "继承", value: "inherit" }, ...modes];
const enabledChoices = [{ label: "继承", value: "inherit" }, { label: "开启", value: "on" }, { label: "关闭", value: "off" }];
type NumberKey = "maxCodesCreatedPerPeriod" | "maxRegistrationsPerPeriod" | "maxUsesPerCode" | "maxValidityDays" | "minAccountAgeDays" | "minApprovedSubmissions";
const periodWord = computed(() => periods.find((item) => item.value === policy.period)?.label ?? "每周期");
const groups = computed<{ title: string; fields: { key: NumberKey; label: string; unit: string; hint?: string; min: number }[] }[]>(() => [
  { title: "名额", fields: [
    { key: "maxCodesCreatedPerPeriod", label: `${periodWord.value}可创建邀请码`, unit: "个", hint: "0 为不可创建", min: 0 },
    { key: "maxRegistrationsPerPeriod", label: `${periodWord.value}可邀请注册`, unit: "人", hint: "0 为不可邀请", min: 0 },
  ] },
  { title: "邀请码", fields: [
    { key: "maxUsesPerCode", label: "单码最多使用", unit: "次", min: 1 },
    { key: "maxValidityDays", label: "有效期最长", unit: "天", min: 1 },
  ] },
  { title: "邀请资格", fields: [
    { key: "minAccountAgeDays", label: "帐号注册至少", unit: "天", hint: "0 为不限", min: 0 },
    { key: "minApprovedSubmissions", label: "通过提交至少", unit: "次", hint: "0 为不限", min: 0 },
  ] },
]);
const bothRequirements = (source: { minAccountAgeDays: number | null; minApprovedSubmissions: number | null }) => (source.minAccountAgeDays ?? policy.minAccountAgeDays) > 0 && (source.minApprovedSubmissions ?? policy.minApprovedSubmissions) > 0;
const overrideSummary = (item: PlayerInvitationOverride) => {
  const parts = groups.value.flatMap((group) => group.fields).filter((field) => item[field.key] !== null).map((field) => `${field.label} ${item[field.key]} ${field.unit}`);
  if (item.enabled !== null) parts.unshift(item.enabled ? "开启邀请" : "关闭邀请");
  if (item.eligibilityMode !== null) parts.push(modes.find((mode) => mode.value === item.eligibilityMode)!.label);
  return parts.join("，") || "全部继承";
};
const enabledChoice = computed({
  get: () => override.enabled === null ? "inherit" : override.enabled ? "on" : "off",
  set: (value) => { override.enabled = value === "inherit" ? null : value === "on"; },
});
const modeChoice = computed({
  get: () => override.eligibilityMode ?? "inherit",
  set: (value) => { override.eligibilityMode = value === "inherit" ? null : value as "any" | "all"; },
});

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
const saveOverride = () => run(async () => {
  const id = await resolveTarget();
  await api(`/v1/player-invitations/overrides/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", override: { ...override } } });
  Object.assign(override, emptyOverride());
  battleTag.value = "";
  targetId.value = "";
  await loadOverrides();
}, "已保存个人额度。", "保存失败，请稍后重试。");
const clearOverride = (id: string) => run(async () => {
  await api(`/v1/player-invitations/overrides/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Idempotency-Key": createRequestId() } });
  await loadOverrides();
}, "已恢复默认。", "操作未完成，请稍后重试。");

function edit(item: AdminPlayerInvitationOverrideListResponse["items"][number]) {
  Object.assign(override, item.override);
  targetId.value = item.playerAccountId;
  battleTag.value = `${item.playerName}#${item.playerId}`;
}

watch(overridePage, () => void run(loadOverrides, "", "无法读取个人额度。"));
onMounted(load);
</script>

<template>
  <div class="policy">
    <UAlert v-if="error" color="error" variant="subtle" :description="error" />
    <UAlert v-if="feedback" color="success" variant="subtle" :description="feedback" />

    <form class="block" aria-labelledby="policy-title" @submit.prevent="savePolicy">
      <h2 id="policy-title" class="block-title">全局策略</h2>
      <USwitch v-model="policy.enabled" label="开放玩家邀请" />
      <fieldset class="group" :disabled="!policy.enabled">
        <legend class="group-title">名额</legend>
        <div class="fields">
          <UFormField label="额度周期"><USelect v-model="policy.period" :items="periods" class="w-full" /></UFormField>
          <UFormField v-for="field in groups[0]!.fields" :key="field.key" :label="field.label" :help="field.hint">
            <UInputNumber v-model="policy[field.key]" :min="field.min" class="w-full" />
          </UFormField>
        </div>
      </fieldset>
      <fieldset v-for="group in groups.slice(1)" :key="group.title" class="group" :disabled="!policy.enabled">
        <legend class="group-title">{{ group.title }}</legend>
        <div class="fields">
          <UFormField v-for="field in group.fields" :key="field.key" :label="field.label" :help="field.hint">
            <UInputNumber v-model="policy[field.key]" :min="field.min" class="w-full" />
          </UFormField>
          <UFormField v-if="group.title === '邀请资格' && bothRequirements(policy)" label="资格关系">
            <USelect v-model="policy.eligibilityMode" :items="modes" class="w-full" />
          </UFormField>
        </div>
      </fieldset>
      <UButton type="submit" label="保存策略" :loading="busy" :disabled="busy" />
    </form>

    <form class="block" aria-labelledby="override-title" @submit.prevent="saveOverride">
      <h2 id="override-title" class="block-title">个人额度</h2>
      <div class="fields">
        <UFormField label="玩家">
          <UInput v-model="battleTag" placeholder="玩家名#1234" class="w-full" :disabled="!!targetId && !!props.playerAccountId" @update:model-value="targetId = props.playerAccountId ?? ''" />
        </UFormField>
        <UFormField label="邀请功能"><USelect v-model="enabledChoice" :items="enabledChoices" class="w-full" /></UFormField>
      </div>
      <fieldset v-for="group in groups" :key="group.title" class="group">
        <legend class="group-title">{{ group.title }}</legend>
        <div class="fields">
          <UFormField v-for="field in group.fields" :key="field.key" :label="field.label">
            <UInputNumber v-model="override[field.key]" :min="field.min" :placeholder="`继承 ${policy[field.key]}`" class="w-full" />
          </UFormField>
          <UFormField v-if="group.title === '邀请资格' && bothRequirements(override)" label="资格关系">
            <USelect v-model="modeChoice" :items="inheritModes" class="w-full" />
          </UFormField>
        </div>
      </fieldset>
      <UButton type="submit" label="保存个人额度" :loading="busy" :disabled="busy || (!battleTag && !targetId)" />
      <ul v-if="overrides?.items.length" class="list">
        <li v-for="item in overrides.items" :key="item.playerAccountId" class="row">
          <PlayerBattleTag :player-name="item.playerName" :player-id="item.playerId" mode="identity" />
          <span class="summary">{{ overrideSummary(item.override) }}</span>
          <span class="actions">
            <UButton label="编辑" color="neutral" variant="ghost" size="sm" @click="edit(item)" />
            <UButton label="恢复默认" color="neutral" variant="ghost" size="sm" :disabled="busy" @click="clearOverride(item.playerAccountId)" />
          </span>
        </li>
      </ul>
      <UPagination v-if="overrides && overrides.total > overrides.pageSize" v-model:page="overridePage" :total="overrides.total" :items-per-page="overrides.pageSize" />
    </form>
  </div>
</template>

<style scoped>
.policy { display: grid; gap: var(--space-6); }
.block { display: grid; gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.block-title { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 700; }
.group { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
.group:disabled { opacity: 0.55; }
.group-title { padding: 0; font-size: var(--type-caption-size); font-weight: 600; color: var(--quiet); }
.summary { color: var(--quiet); font-size: var(--type-caption-size); }
.fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: var(--space-2); }
.block > button { justify-self: start; }
.list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.actions { display: flex; gap: var(--space-1); margin-left: auto; }
</style>
