<script setup lang="ts">
type EventVersion = { gameVersion: string; availability: "available" | "suspended"; mode: string | null; eventCount: number };

defineProps<{ poolSize: number; poolWeight: number; versions: EventVersion[]; saving: string | null }>();
const emit = defineEmits<{ toggle: [version: EventVersion, availability: EventVersion["availability"]] }>();
</script>

<template>
  <section class="pool-summary surface-card" aria-label="候选池">
    <div class="pool-summary__fact"><b class="num">{{ poolSize }}</b><span>个已实装事件在候选池</span></div>
    <div class="pool-summary__fact"><b class="num">{{ Number(poolWeight.toFixed(2)) }}</b><span>权重合计</span></div>
    <ul class="pool-summary__versions" aria-label="版本可用性">
      <li v-for="version in versions" :key="version.gameVersion">
        <button type="button" class="pool-summary__version pressable-soft" :class="{ 'is-off': version.availability === 'suspended' }" :disabled="saving !== null" :aria-pressed="version.availability === 'available'" :aria-label="`${version.availability === 'available' ? '挂起' : '恢复'}版本 ${version.gameVersion}`" @click="emit('toggle', version, version.availability === 'available' ? 'suspended' : 'available')">
          <i aria-hidden="true" />{{ version.gameVersion }}<span v-if="version.availability === 'suspended'" class="pool-summary__state">已挂起</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pool-summary { container-type: inline-size; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-6); padding: var(--space-3) var(--space-4); }
.pool-summary__fact { display: flex; align-items: baseline; gap: var(--space-2); color: var(--muted); font-size: var(--type-label-sm-size); }
.pool-summary__fact b { color: var(--text); font-size: var(--type-card-title-size, 1.125rem); }
.pool-summary__versions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 0 auto; padding: 0; list-style: none; }
.pool-summary__version { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--control-sm, 2rem); padding: 0 var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-pill); background: none; color: var(--text); font: inherit; font-size: var(--type-label-sm-size); cursor: pointer; }
.pool-summary__version i { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--success); }
.pool-summary__version.is-off { color: var(--quiet); }
.pool-summary__version.is-off i { background: var(--warning); }
.pool-summary__version.is-off { text-decoration: line-through; }
.pool-summary__state { margin-left: var(--space-1); text-decoration: none; display: inline-block; color: var(--warning); font-size: var(--type-caption-size); }
@container (max-width: 39.99rem) { .pool-summary__versions { margin-left: 0; } }
</style>
