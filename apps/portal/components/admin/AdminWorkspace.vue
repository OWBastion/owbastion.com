<script setup lang="ts">
import { adminSectionForPath } from "~/utils/admin-sections";

defineProps<{
  title: string;
  count?: string;
}>();
const route = useRoute();
const location = computed(() => adminSectionForPath(route.path));
</script>

<template>
  <main class="admin-workspace page-shell page-shell--wide">
    <header class="admin-workspace__header">
      <div class="admin-workspace__heading">
        <nav class="admin-workspace__crumbs" aria-label="位置">
          <NuxtLink to="/admin">Admin</NuxtLink>
          <template v-if="location">
            <span aria-hidden="true">/</span><span>{{ location.group.label }}</span>
            <template v-if="location.section.label !== title"><span aria-hidden="true">/</span><NuxtLink :to="location.section.to">{{ location.section.label }}</NuxtLink></template>
          </template>
        </nav>
        <div class="admin-workspace__title-row">
          <h1>{{ title }}</h1>
          <span v-if="count" class="admin-workspace__count num">{{ count }}</span>
        </div>
      </div>
      <div v-if="$slots.actions" class="admin-workspace__actions"><slot name="actions" /></div>
    </header>
    <div v-if="$slots.messages" class="admin-workspace__messages"><slot name="messages" /></div>
    <div v-if="$slots.toolbar" class="admin-workspace__toolbar"><slot name="toolbar" /></div>
    <slot />
  </main>
</template>

<style>
.admin-workspace { display: grid; gap: clamp(1rem, 2vw, 1.25rem); padding-block: clamp(1.5rem, 4vh, 2.5rem) 3rem; }
.admin-workspace__header { position: relative; display: flex; align-items: end; justify-content: space-between; gap: 1.25rem; padding-bottom: var(--space-4); border-bottom: 1px solid var(--line); }
/* Status rail: a short signal-coloured segment marks admin pages apart from the player site. */
.admin-workspace__header::after { position: absolute; bottom: -1px; left: 0; width: 3rem; height: 2px; background: var(--signal); content: ""; }
.admin-workspace__heading { display: grid; gap: var(--space-2); min-width: 0; }
.admin-workspace__crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); color: var(--quiet); font-family: var(--font-display); font-size: var(--type-caption-size); font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.admin-workspace__crumbs a { color: var(--signal); text-decoration: none; }
.admin-workspace__crumbs a:hover { text-decoration: underline; }
.admin-workspace__title-row { display: flex; align-items: baseline; gap: 0.75rem; min-width: 0; }
.admin-workspace__header h1 { margin: 0; font-family: var(--font-display); font-size: clamp(1.75rem, 3vw, 2.25rem); font-weight: 700; letter-spacing: -.01em; line-height: 1.1; overflow-wrap: anywhere; }
.admin-workspace__count { padding: 0 var(--space-2); border: 1px solid var(--line-strong); border-radius: calc(var(--radius-control) / 1.5); color: var(--muted); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.7; white-space: nowrap; }
.admin-workspace__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.5rem; min-width: 0; }
.admin-workspace__actions :where(button, a) { min-height: 2.75rem; }
.admin-workspace__icon-action { flex: 0 0 2.75rem; width: 2.75rem; padding-inline: 0; }
.admin-workspace__messages { display: grid; gap: 0.5rem; }
.admin-workspace__toolbar { min-width: 0; }
.admin-workspace > * { min-width: 0; }
.admin-toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.admin-toolbar > * { min-width: 0; }
.admin-toolbar > :first-child { flex: 1 1 16.25rem; }
.admin-toolbar > :not(:first-child) { flex: 0 1 12.5rem; }
.admin-toolbar .portal-control { max-width: 100%; }
.admin-alert, .admin-feedback { margin: 0; padding: 0.75rem 0.875rem; border-radius: var(--radius-control); font-size: .82rem; }
.admin-alert { color: color-mix(in oklch, var(--danger) 82%, var(--text)); background: color-mix(in oklch, var(--danger) 16%, var(--surface)); }
.admin-feedback { background: var(--accent-surface); }
.admin-empty { margin: 0; padding: 1.75rem; color: var(--quiet); text-align: center; }
.admin-detail h2 { margin: 0; font-family: var(--font-display); font-size: 2.25rem; letter-spacing: var(--type-title-tracking); overflow-wrap: anywhere; }
.admin-detail__meta { margin: 0.5625rem 0 1.375rem; color: var(--quiet); font-size: .8rem; }
@media (max-width: 47.99rem) {
  .admin-workspace { gap: 0.75rem; padding-block: 1.25rem 1.5rem; }
  .admin-workspace__header { align-items: stretch; flex-direction: column; gap: 0.75rem; }
  .admin-workspace__actions { justify-content: stretch; }
  .admin-workspace__actions:has(> :only-child.admin-workspace__icon-action) { justify-content: flex-end; }
  .admin-workspace__actions > :where(button, a):not(.admin-workspace__icon-action) { flex: 1 1 9rem; min-height: 2.75rem; justify-content: center; }
  .admin-toolbar { align-items: stretch; flex-direction: column; }
  .admin-toolbar > :first-child, .admin-toolbar > :not(:first-child) { flex: 1 1 auto; max-width: none; }
}
</style>
