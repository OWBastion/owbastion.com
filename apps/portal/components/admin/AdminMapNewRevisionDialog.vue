<script setup lang="ts">
import { formatCurrentGameVersion } from "~/utils/game-version";

export type NewRevisionKind = "event" | "rework" | "classic";
export type NewRevisionInput = { kind: NewRevisionKind; gameVersion: string; resetReason: string | null };

const open = defineModel<boolean>("open", { required: true });
defineProps<{ saving?: boolean }>();
const emit = defineEmits<{ create: [input: NewRevisionInput] }>();

const options: Array<{ kind: NewRevisionKind; label: string; description: string }> = [
  { kind: "event", label: "限时 / 活动版本", description: "周年庆、万圣节等限时玩法。从空白开始。" },
  { kind: "rework", label: "地图重置 / 重做", description: "复制当前点位和关联，在此基础上修改；准备好后再设为正式版。" },
  { kind: "classic", label: "经典版", description: "从空白开始，默认只关联经典版称号。" },
];
const kind = shallowRef<NewRevisionKind>("rework");
const gameVersion = shallowRef(formatCurrentGameVersion());
const reason = shallowRef("");
watch(open, (value) => {
  if (!value) return;
  kind.value = "rework";
  gameVersion.value = formatCurrentGameVersion();
  reason.value = "";
});
</script>

<template>
  <AdminResponsiveDialog v-model:open="open" title="新建修订" description="新修订从「准备中」开始，不影响玩家当前的进度。" size="md" :dismissible="!saving">
    <template #body>
      <form id="map-new-revision-form" class="new-revision" @submit.prevent="emit('create', { kind, gameVersion: gameVersion.trim(), resetReason: reason.trim() || null })">
        <URadioGroup v-model="kind" :items="options" value-key="kind" variant="card" legend="修订类型" :disabled="saving" />
        <UFormField label="游戏版本" required><UInput v-model="gameVersion" required :disabled="saving" /></UFormField>
        <UFormField label="备注"><UTextarea v-model="reason" :rows="2" :disabled="saving" placeholder="例如：2026 周年庆活动" /></UFormField>
      </form>
    </template>
    <template #footer>
      <UButton type="submit" form="map-new-revision-form" class="pressable" label="创建修订" :loading="saving" :disabled="saving || !gameVersion.trim()" />
      <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="open = false" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.new-revision { display: grid; gap: 0.75rem; }
</style>
