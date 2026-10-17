<script setup lang="ts">
import type { AchievementState } from "~/utils/achievement-status";

defineProps<{ state: AchievementState }>();
const labels = { equipped: "已佩戴", obtained: "已获得", none: "未获得" } as const;
const tones = { equipped: "info", obtained: "success", none: "default" } as const;
</script>

<template><StatusBadge :label="labels[state]" :tone="tones[state]" /></template>
