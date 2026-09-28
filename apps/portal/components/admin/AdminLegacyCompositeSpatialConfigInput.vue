<script setup lang="ts">
import AdminCompositeSpatialConfigInput from "./AdminCompositeSpatialConfigInput.vue";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

const props = defineProps<{
  modelValue: SpatialConfigValue;
  revisionKey: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: SpatialConfigValue];
  valid: [value: boolean];
}>();
</script>

<template>
  <AdminCompositeSpatialConfigInput
    :model-value="props.modelValue"
    :revision-key="props.revisionKey"
    :disabled="props.disabled"
    mode="legacy"
    @update:model-value="emit('update:modelValue', $event)"
    @valid="emit('valid', $event)"
  />
</template>
