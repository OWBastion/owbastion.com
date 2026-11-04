<script setup lang="ts">
import type { EventHistoryEntry } from "../../content/event-history";
import { findEventHistory } from "~/utils/editorial-content";
import EventBalanceEntries from "~/components/events/EventBalanceEntries.vue";

const props = defineProps<{ eventId: string }>();
const history = shallowRef<EventHistoryEntry[]>([]);
watch(() => props.eventId, async (eventId) => {
  history.value = [];
  const found = await findEventHistory(eventId);
  if (eventId === props.eventId) history.value = found;
}, { immediate: true });
</script>

<template>
  <UAccordion v-if="history.length" :items="[{ label: `平衡调整记录（${history.length}）`, slot: 'history' }]">
    <template #history><EventBalanceEntries :entries="history" /></template>
  </UAccordion>
</template>
