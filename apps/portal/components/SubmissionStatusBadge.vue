<script setup lang="ts">
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";

const props = defineProps<{ status: string }>();
const tone = computed(() => submissionStatusTone(props.status));
</script>

<template><StatusBadge :label="submissionStatusText[props.status] ?? props.status" :tone="tone" /></template>
