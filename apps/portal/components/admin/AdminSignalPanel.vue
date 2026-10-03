<script setup lang="ts">
defineProps<{ kicker?: string; title: string; titleId: string }>();
</script>

<template>
  <section class="signal-panel" :aria-labelledby="titleId">
    <header class="signal-panel__header">
      <div>
        <p v-if="kicker" class="signal-kicker">{{ kicker }}</p>
        <h3 :id="titleId">{{ title }}</h3>
      </div>
      <slot name="aside" />
    </header>
    <slot />
  </section>
</template>

<style scoped>
.signal-panel {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface-raised);
  box-shadow: var(--elevation-1);
  box-sizing: border-box;
}
.signal-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.signal-kicker {
  margin: 0 0 var(--space-1);
  color: var(--quiet);
  font-size: var(--type-caption-size);
  font-weight: 500;
  letter-spacing: .06em;
}
.signal-panel__header h3 {
  margin: 0;
  font-size: var(--type-label-size);
  font-weight: 700;
  letter-spacing: -.02em;
}
:slotted(.signal-empty) {
  margin: 0;
  color: var(--muted);
  font-size: var(--type-label-sm-size);
  line-height: 1.5;
}
:slotted(.signal-note),
:slotted(.signal-error) {
  margin: var(--space-3) 0 0;
  color: var(--muted);
  font-size: var(--type-caption-size);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
:slotted(.signal-error) {
  color: var(--danger);
}
</style>
