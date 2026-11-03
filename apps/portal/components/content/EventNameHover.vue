<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";

const props = defineProps<{ eventId: string }>();
// The changelog page loads the catalog once; every heading reads the shared result.
const { data } = useNuxtData<{ items: RandomEvent[] }>("public-event-directory");
const event = computed(() => data.value?.items.find((item) => item.eventId === props.eventId));
const statusText = (value: RandomEvent["releaseStatus"]) => value === "implemented" ? "已实装" : value === "removed" ? "已移除" : "开发中";
const categoryColor = (value: string) => value === "减益" ? "error" : value === "增益" ? "success" : value === "机制" ? "info" : "neutral";
</script>

<template>
  <UPopover mode="hover" :open-delay="200" :content="{ side: 'top', align: 'start' }">
    <span class="event-name-hover" tabindex="0"><slot /></span>
    <template #content>
      <div class="event-card">
        <template v-if="event">
          <div class="event-card__tags">
            <UBadge :label="event.category" :color="categoryColor(event.category)" variant="subtle" />
            <UBadge v-if="event.rarity" :label="event.rarity" color="neutral" variant="outline" />
            <UBadge v-if="event.releaseStatus !== 'implemented'" :label="statusText(event.releaseStatus)" color="warning" variant="subtle" />
          </div>
          <p class="event-card__desc">{{ event.description }}</p>
        </template>
        <NuxtLink :to="{ path: '/events', query: { eventId } }" class="event-card__link">平衡调整记录</NuxtLink>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.event-name-hover { text-decoration: underline dotted; text-decoration-color: var(--quiet); text-underline-offset: .25em; cursor: help; }
.event-card { display: grid; gap: var(--space-2); max-width: 20rem; padding: var(--space-3); }
.event-card__tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.event-card__desc { display: -webkit-box; margin: 0; overflow: hidden; color: var(--muted); font-size: var(--type-caption-size); line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; }
.event-card__link { color: var(--info); font-size: var(--type-caption-size); font-weight: 500; }
</style>
