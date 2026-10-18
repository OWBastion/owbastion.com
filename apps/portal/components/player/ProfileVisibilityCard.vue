<script setup lang="ts">
import type { PlayerProfileVisibilityResponse } from "@owbastion/contracts";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

const props = defineProps<{ publicProfile: boolean; hideBattleTag: boolean }>();
const emit = defineEmits<{ updated: [value: PlayerProfileVisibilityResponse] }>();

const api = usePortalApi();
const draft = reactive({ publicProfile: props.publicProfile, hideBattleTag: props.hideBattleTag });
watch(() => [props.publicProfile, props.hideBattleTag], ([publicProfile, hideBattleTag]) => Object.assign(draft, { publicProfile, hideBattleTag }));
const saving = shallowRef(false);
const error = shallowRef("");

async function save(change: Partial<typeof draft>) {
  if (saving.value) return;
  const next = { ...draft, ...change };
  Object.assign(draft, next);
  saving.value = true;
  error.value = "";
  try {
    const response = await api<PlayerProfileVisibilityResponse>("/v1/me/profile/visibility", {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", ...next },
    });
    emit("updated", response);
  } catch (cause) {
    Object.assign(draft, { publicProfile: props.publicProfile, hideBattleTag: props.hideBattleTag });
    error.value = portalErrorDetails(cause, "保存失败，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="visibility-card">
    <div class="visibility-row">
      <div class="visibility-copy">
        <strong>在排行榜公开我的主页</strong>
        <p>关闭后你在排行榜显示为匿名玩家，名次与分数照常保留。</p>
      </div>
      <USwitch :model-value="draft.publicProfile" :disabled="saving" aria-label="公开主页" @update:model-value="save({ publicProfile: $event })" />
    </div>
    <div v-if="draft.publicProfile" class="visibility-row visibility-extra">
      <div class="visibility-copy">
        <strong>隐藏我的 BattleTag</strong>
        <p>其他玩家会看到你的公开 ID（未设置则显示匿名玩家），称号和名次照常公开。你自己始终能看到。</p>
      </div>
      <USwitch :model-value="draft.hideBattleTag" :disabled="saving" aria-label="隐藏 BattleTag" @update:model-value="save({ hideBattleTag: $event })" />
    </div>
    <p v-if="error" class="visibility-error" role="alert">{{ error }}</p>
    <div v-if="$slots.default" class="visibility-extra"><slot /></div>
  </div>
</template>

<style scoped>
.visibility-card { display: grid; gap: var(--space-3); width: min(26rem, calc(100vw - 2rem)); padding: var(--space-4); }
.visibility-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.visibility-copy { display: grid; min-width: 0; gap: var(--space-1); }
.visibility-copy strong { color: var(--text); font-size: .85rem; }
.visibility-copy p { margin: 0; color: var(--quiet); font-size: .73rem; }
.visibility-extra { padding-top: var(--space-3); border-top: 1px solid var(--line); }
.visibility-error { margin: var(--space-2) 0 0; color: var(--danger) !important; }
</style>
