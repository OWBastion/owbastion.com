<script setup lang="ts">
import type { Map } from "~/types/challenge";

type Metadata = { gameVersion: string; difficultyRating: Map["difficultyRating"]; mechanics: string[]; coverUrl: string | null; backgroundUrl: string | null };

const props = defineProps<{ map: Map; saving?: boolean }>();
const emit = defineEmits<{ save: [input: Metadata] }>();

const difficultyItems = [
  { label: "暂无评级", value: null },
  ...(["T0", "T1", "T2", "T3", "T4", "T5"] as const).map((rating) => ({ label: rating, value: rating })),
];
const form = reactive({ gameVersion: "", coverUrl: "", backgroundUrl: "", difficultyRating: null as Map["difficultyRating"], mechanics: [] as string[] });
watch(() => props.map, (value) => {
  form.gameVersion = value.gameVersion;
  form.coverUrl = value.coverUrl ?? "";
  form.backgroundUrl = value.backgroundUrl ?? "";
  form.difficultyRating = value.difficultyRating;
  form.mechanics = [...value.mechanics];
}, { immediate: true, deep: true });

const submit = () => emit("save", {
  gameVersion: form.gameVersion.trim(),
  difficultyRating: form.difficultyRating,
  mechanics: form.mechanics,
  coverUrl: form.coverUrl.trim() || null,
  backgroundUrl: form.backgroundUrl.trim() || null,
});
</script>

<template>
  <form class="metadata-form" @submit.prevent="submit">
    <UFormField label="地图难度评级" hint="地图综合评级，不等同于挑战难度。"><USelect v-model="form.difficultyRating" :items="difficultyItems" :disabled="saving" /></UFormField>
    <UFormField label="特殊机制" hint="服务端负责最终数量和长度校验。"><UInputTags v-model="form.mechanics" :disabled="saving" placeholder="输入机制标签" /></UFormField>
    <UFormField label="目录版本" required><UInput v-model="form.gameVersion" required :disabled="saving" /></UFormField>
    <UFormField label="地图封面地址"><UInput v-model="form.coverUrl" type="url" placeholder="https://…" :disabled="saving" /></UFormField>
    <UFormField label="地图背景地址"><UInput v-model="form.backgroundUrl" type="url" placeholder="https://…" :disabled="saving" /></UFormField>
    <UButton type="submit" class="pressable" label="保存地图资料" :loading="saving" :disabled="saving" />
  </form>
</template>

<style scoped>
.metadata-form { display: grid; gap: 0.875rem; }
.metadata-form :deep(button[type="submit"]) { justify-self: start; min-height: 2.75rem; }
</style>
