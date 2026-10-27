<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";

const { wearMapTitles, updateMapTitleWear } = usePlayerTitles();
const saving = shallowRef(false);
const error = shallowRef("");

async function save(wear: boolean) {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    await updateMapTitleWear(wear);
  } catch (cause) {
    error.value = portalErrorDetails(cause, "保存失败，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="wear-card">
    <div class="wear-row">
      <strong>佩戴地图称号</strong>
      <USwitch :model-value="wearMapTitles" :disabled="saving" aria-label="佩戴地图称号" @update:model-value="save" />
    </div>
    <p class="wear-note">对所有地图生效</p>
    <p v-if="error" class="wear-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.wear-card { display: grid; gap: var(--space-2); width: min(18rem, calc(100vw - 2rem)); padding: var(--space-4); }
.wear-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.wear-row strong { color: var(--text); font-size: .85rem; }
.wear-note { margin: 0; color: var(--muted); font-size: var(--type-caption-size); }
.wear-error { margin: 0; color: var(--danger) !important; }
</style>
