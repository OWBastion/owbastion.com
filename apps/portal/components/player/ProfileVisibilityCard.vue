<script setup lang="ts">
import type { PlayerProfileVisibilityResponse } from "@owbastion/contracts";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

const props = defineProps<{ publicProfile: boolean }>();
const emit = defineEmits<{ updated: [value: boolean] }>();

const api = usePortalApi();
const draft = shallowRef(props.publicProfile);
watch(() => props.publicProfile, (value) => { draft.value = value; });
const saving = shallowRef(false);
const error = shallowRef("");

async function toggle(value: boolean) {
  if (saving.value) return;
  draft.value = value;
  saving.value = true;
  error.value = "";
  try {
    const response = await api<PlayerProfileVisibilityResponse>("/v1/me/profile/visibility", {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", publicProfile: value },
    });
    emit("updated", response.publicProfile);
  } catch (cause) {
    draft.value = props.publicProfile;
    error.value = portalErrorDetails(cause, "保存失败，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UCard class="visibility-card" variant="subtle">
    <div class="visibility-row">
      <div class="visibility-copy">
        <strong>公开主页</strong>
        <p>在排行榜公开显示你的昵称与称号。关闭后名次与分数照常保留，但昵称、头像、称号和地图明细不再公开，你会显示为匿名玩家。</p>
        <p v-if="error" class="visibility-error" role="alert">{{ error }}</p>
      </div>
      <USwitch :model-value="draft" :disabled="saving" aria-label="公开主页" @update:model-value="toggle" />
    </div>
  </UCard>
</template>

<style scoped>
.visibility-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.visibility-copy { display: grid; min-width: 0; gap: var(--space-1); }
.visibility-copy strong { color: var(--text); font-size: .85rem; }
.visibility-copy p { margin: 0; color: var(--quiet); font-size: .73rem; }
.visibility-error { color: var(--danger) !important; }
</style>
