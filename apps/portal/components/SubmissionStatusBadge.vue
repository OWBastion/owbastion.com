<script setup lang="ts">
import { playerSubmissionStatusLabel, playerSubmissionStatusTone } from "~/utils/submissionStatus";

const props = defineProps<{ status: string; resubmissionRequired?: boolean }>();
</script>

<template><StatusBadge :label="playerSubmissionStatusLabel(props.status, props.resubmissionRequired)" :tone="playerSubmissionStatusTone(props.status, props.resubmissionRequired)" /></template>
