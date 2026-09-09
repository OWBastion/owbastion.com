<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";
import { formatRelativeCalendarDay } from "~/utils/editorial";

const props = defineProps<{
  value: string | Date;
  now?: Date;
  timeZone?: string;
}>();

const mounted = shallowRef(false);
onMounted(() => {
  mounted.value = true;
});

const label = computed(() => mounted.value
  ? formatRelativeCalendarDay(props.value, { now: props.now, timeZone: props.timeZone })
  : "");
</script>

<template>
  <span v-if="label" class="changelog-relative-day"> · {{ label }}</span>
</template>

<style scoped>
.changelog-relative-day { color: var(--quiet); }
</style>
