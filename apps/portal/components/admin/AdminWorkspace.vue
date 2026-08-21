<script setup lang="ts">
defineProps<{
  title: string;
  count?: string;
}>();
</script>

<template>
  <main class="admin-workspace page-shell page-shell--wide">
    <header class="admin-workspace__header">
      <div class="admin-workspace__title-row">
        <h1>{{ title }}</h1>
        <span v-if="count" class="admin-workspace__count">{{ count }}</span>
      </div>
      <div v-if="$slots.actions" class="admin-workspace__actions"><slot name="actions" /></div>
    </header>
    <div v-if="$slots.messages" class="admin-workspace__messages"><slot name="messages" /></div>
    <div v-if="$slots.toolbar" class="admin-workspace__toolbar"><slot name="toolbar" /></div>
    <slot />
  </main>
</template>

<style>
.admin-workspace { display: grid; gap: clamp(1rem, 2.4vw, 1.5rem); padding-block: clamp(2.375rem, 6vh, 4.125rem); }
.admin-workspace__header { display: flex; align-items: end; justify-content: space-between; gap: 1.25rem; }
.admin-workspace__title-row { display: flex; align-items: baseline; gap: 0.75rem; min-width: 0; }
.admin-workspace__header h1 { margin: 0; font-size: var(--type-title-size); font-weight: 690; letter-spacing: var(--type-title-tracking); line-height: var(--type-title-leading); overflow-wrap: anywhere; }
.admin-workspace__count { color: var(--quiet); font-size: var(--type-caption-size); font-weight: 650; white-space: nowrap; }
.admin-workspace__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; min-width: 0; }
.admin-workspace__actions :where(button, a) { min-height: 2.75rem; }
.admin-workspace__icon-action { flex: 0 0 2.75rem; width: 2.75rem; padding-inline: 0; }
.admin-workspace__messages { display: grid; gap: 0.5rem; }
.admin-workspace__toolbar { min-width: 0; }
.admin-workspace > * { min-width: 0; }
.admin-toolbar { display: flex; align-items: center; gap: 0.5625rem; padding: 0.5625rem; border: 1px solid var(--line); border-radius: 0.875rem; background: color-mix(in oklch, var(--surface) 92%, var(--surface-raised)); }
.admin-toolbar > * { min-width: 0; }
.admin-toolbar > :first-child { flex: 1 1 16.25rem; }
.admin-toolbar > :not(:first-child) { flex: 0 1 12.5rem; }
.admin-toolbar .portal-control { max-width: 100%; }
.admin-alert, .admin-feedback { margin: 0; padding: 0.75rem 0.875rem; border-radius: 0.6875rem; font-size: .82rem; }
.admin-alert { color: color-mix(in oklch, var(--danger) 82%, var(--text)); background: color-mix(in oklch, var(--danger) 16%, var(--surface)); }
.admin-feedback { background: var(--accent-surface); }
.admin-empty { margin: 0; padding: 1.75rem; color: var(--quiet); text-align: center; }
.admin-detail h2 { margin: 0; font-size: 2.25rem; letter-spacing: var(--type-title-tracking); overflow-wrap: anywhere; }
.admin-detail__meta { margin: 0.5625rem 0 1.375rem; color: var(--quiet); font-size: .8rem; }
@media (max-width: 620px) {
  .admin-workspace { gap: 0.75rem; padding-block: 1.25rem 1.5rem; }
  .admin-workspace__header { align-items: stretch; flex-direction: column; gap: 0.75rem; }
  .admin-workspace__actions { justify-content: stretch; }
  .admin-workspace__actions:has(> :only-child.admin-workspace__icon-action) { justify-content: flex-end; }
  .admin-workspace__actions > :where(button, a):not(.admin-workspace__icon-action) { flex: 1 1 9rem; min-height: 2.75rem; justify-content: center; }
  .admin-toolbar { align-items: stretch; flex-direction: column; }
  .admin-toolbar > :first-child, .admin-toolbar > :not(:first-child) { flex: 1 1 auto; max-width: none; }
}
</style>
