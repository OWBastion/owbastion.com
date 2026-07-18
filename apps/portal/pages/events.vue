<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";
import EventDirectory from "~/components/events/EventDirectory.vue";
useSeoMeta({ title: "随机事件 · 躲避堡垒 3", description: "查看当前随机事件与开放挑战。" });
const api = usePortalApi(); const events = ref<RandomEvent[]>([]); const loading = shallowRef(true); const error = shallowRef(false);
onMounted(async () => { try { events.value = (await api<{ items: RandomEvent[] }>("/v1/events")).items; } catch { error.value = true; } finally { loading.value = false; } });
</script>
<template><main class="events-page page-shell"><section class="page-intro"><h1 class="page-title">随机事件</h1><p class="body-copy">查看已实装事件、历史记录与开放挑战。</p></section><section class="events-panel surface-card"><p v-if="loading" class="state">读取中…</p><UAlert v-else-if="error" color="error" variant="subtle" title="无法读取事件" description="请稍后重试。" /><EventDirectory v-else :events="events" /></section></main></template>
<style scoped>.events-page { padding-block:clamp(64px,9vh,104px) 72px; }.page-intro { margin-bottom:32px; }.events-panel { padding:clamp(18px,4vw,36px); }.state { padding:100px 0; color:var(--muted); text-align:center; } @media (max-width:620px) { .events-page { padding-block:48px; }.page-intro { margin-bottom:20px; }.events-panel { padding:14px; } }</style>
