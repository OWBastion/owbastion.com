<script setup lang="ts">
defineProps<{
  title: string;
  count?: string;
}>();
</script>

<template>
  <main class="admin-workspace page-shell">
    <header class="admin-workspace__header">
      <div>
        <p class="eyebrow">管理后台</p>
        <h1>{{ title }}</h1>
      </div>
      <div v-if="count || $slots.actions" class="admin-workspace__meta">
        <slot name="actions" />
        <span v-if="count" class="admin-workspace__count">{{ count }}</span>
      </div>
    </header>

    <div v-if="$slots.messages" class="admin-workspace__messages"><slot name="messages" /></div>
    <div v-if="$slots.toolbar" class="admin-workspace__toolbar"><slot name="toolbar" /></div>
    <slot />
  </main>
</template>

<style>
.admin-workspace { display: grid; gap: clamp(16px, 2.4vw, 24px); padding-block: clamp(38px, 6vh, 66px); }
.admin-workspace__header { display: flex; align-items: end; justify-content: space-between; gap: 20px; }
.admin-workspace__header .eyebrow { margin-bottom: 7px; }
.admin-workspace__header h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.2rem); font-weight: 690; letter-spacing: -.052em; line-height: .98; }
.admin-workspace__meta { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.admin-workspace__count { color: var(--quiet); font-size: .78rem; font-weight: 650; white-space: nowrap; }
.admin-workspace__messages { display: grid; gap: 8px; }
.admin-workspace__toolbar { min-width: 0; }
.admin-toolbar { display: flex; align-items: center; gap: 9px; padding: 9px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in oklch, var(--surface) 92%, var(--surface-raised)); }
.admin-toolbar > * { min-width: 0; }
.admin-toolbar .portal-control { flex: 1 1 220px; }
.admin-table { overflow-x: auto; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.admin-table [data-slot="base"] { min-width: 680px; }
.admin-table [data-slot="th"] { color: var(--quiet); font-size: .72rem; font-weight: 700; letter-spacing: .025em; }
.admin-table [data-slot="td"] { vertical-align: middle; }
.admin-table [data-slot="tr"][data-selectable="true"] { cursor: pointer; }
.admin-table [data-slot="tr"][data-selectable="true"]:hover [data-slot="td"] { background: color-mix(in oklch, var(--accent-surface) 42%, var(--surface)); }
.admin-alert, .admin-feedback { margin: 0; padding: 12px 14px; border-radius: 11px; font-size: .82rem; }
.admin-alert { color: color-mix(in oklch, var(--danger) 82%, var(--text)); background: color-mix(in oklch, var(--danger) 16%, var(--surface)); }
.admin-feedback { background: var(--accent-surface); }
.admin-empty { margin: 0; padding: 28px; color: var(--quiet); text-align: center; }
.admin-detail h2 { margin: 0; font-size: 2.25rem; letter-spacing: -.05em; overflow-wrap: anywhere; }
.admin-detail__meta { margin: 9px 0 22px; color: var(--quiet); font-size: .8rem; }
@media (max-width: 620px) { .admin-workspace__header { align-items: start; flex-direction: column; }.admin-workspace__meta { width: 100%; justify-content: space-between; }.admin-toolbar { align-items: stretch; flex-direction: column; }.admin-toolbar .portal-control { flex-basis: auto; }.admin-table { margin-inline: -2px; }.admin-table [data-slot="base"] { min-width: 620px; } }
</style>
