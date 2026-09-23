<script setup lang="ts">
import type { AdminPendingWorkGroup } from "~/composables/useAdminInbox";

const props = defineProps<{
  groups: readonly AdminPendingWorkGroup[];
  loading?: boolean;
}>();

const visibleGroups = computed(() => props.groups.filter((group) => group.error || group.count === null || group.count > 0));
const hasErrors = computed(() => props.groups.some((group) => group.error));
</script>

<template>
  <section class="pending-work" aria-label="待处理事项">
    <div v-if="props.loading" class="pending-work__loading" role="status" aria-label="正在读取待处理事项">
      <USkeleton v-for="index in 3" :key="index" class="pending-work__skeleton" />
    </div>
    <template v-else>
      <UAlert v-if="hasErrors" color="error" variant="subtle" description="部分待处理队列暂时无法读取；请稍后重试或打开对应队列。" />
      <section
        v-for="group in visibleGroups"
        :key="group.id"
        class="pending-work__group"
        :aria-labelledby="`pending-work-${group.id}`"
      >
        <header class="pending-work__heading">
          <h2 :id="`pending-work-${group.id}`" class="type-headline">{{ group.label }}</h2>
          <span v-if="group.count !== null" class="pending-work__count">{{ group.count }} 项</span>
          <NuxtLink class="pending-work__all pressable" :to="group.href">打开队列</NuxtLink>
        </header>
        <UAlert v-if="group.error" color="error" variant="subtle" :description="group.error" />
        <ul v-else-if="group.items.length" class="pending-work__list">
          <li v-for="item in group.items" :key="item.id">
            <NuxtLink class="pending-work__item pressable-soft" :to="item.href">
              <span class="pending-work__copy">
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
              </span>
              <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" />
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="pending-work__empty">暂无待处理事项</p>
      </section>
      <UEmpty v-if="!visibleGroups.length && !hasErrors" title="暂无待处理事项" variant="naked" />
    </template>
  </section>
</template>

<style scoped>
.pending-work { display: grid; gap: 1.25rem; min-width: 0; }
.pending-work__group { display: grid; gap: 0.625rem; min-width: 0; padding-bottom: 1rem; border-bottom: 1px solid var(--line); }
.pending-work__heading { display: flex; align-items: baseline; gap: 0.75rem; min-width: 0; }
.pending-work__heading h2 { margin: 0; font-weight: 680; }
.pending-work__count, .pending-work__empty { color: var(--muted); font-size: var(--type-caption-size); }
.pending-work__all { margin-left: auto; color: var(--accent); font-size: var(--type-caption-size); text-decoration: none; white-space: nowrap; }
.pending-work__list { display: grid; gap: 0.25rem; padding: 0; margin: 0; list-style: none; }
.pending-work__item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-width: 0; padding: 0.75rem 0.875rem; border-radius: 0.5rem; color: var(--text); text-decoration: none; }
.pending-work__item:hover, .pending-work__item:focus-visible { background: var(--surface-raised); }
.pending-work__copy { display: grid; min-width: 0; gap: 0.25rem; }
.pending-work__copy strong { overflow-wrap: anywhere; font-size: 0.875rem; font-weight: 650; }
.pending-work__copy > span { color: var(--muted); font-size: var(--type-caption-size); overflow-wrap: anywhere; }
.pending-work__item :deep(svg) { flex: 0 0 auto; color: var(--quiet); }
.pending-work__empty { margin: 0; padding: 0.5rem 0; }
.pending-work__loading { display: grid; gap: 1rem; }
.pending-work__skeleton { width: 100%; height: 5rem; }
@media (max-width: 38.75rem) {
  .pending-work__heading { flex-wrap: wrap; }
  .pending-work__all { margin-left: 0; }
}
</style>
