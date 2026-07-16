<script setup lang="ts">
import { submissionStatusText } from "~/utils/submissionStatus";

const props = defineProps<{ status: string }>();
const tone = computed(() => props.status === "approved" || props.status === "ready_for_review" ? "success" : props.status === "resubmission_required" || props.status === "ocr_review_required" ? "warning" : "default");
</script>

<template><StatusBadge :label="submissionStatusText[props.status] ?? props.status" :tone="tone" /></template>
