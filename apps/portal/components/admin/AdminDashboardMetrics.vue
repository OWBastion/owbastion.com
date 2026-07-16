<script setup lang="ts">
type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "accent" | "quiet";
};

defineProps<{ metrics: DashboardMetric[] }>();
</script>

<template>
  <section class="dashboard-metrics surface-card" aria-label="管理概览">
    <article v-for="metric in metrics" :key="metric.label" class="metric" :class="`metric--${metric.tone}`">
      <p class="metric-label">{{ metric.label }}</p>
      <strong class="metric-value">{{ metric.value }}</strong>
      <small class="metric-detail">{{ metric.detail }}</small>
    </article>
  </section>
</template>

<style scoped>
.dashboard-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); overflow:hidden; }.metric { position:relative; display:grid; align-content:start; min-height:132px; padding:22px; border-right:1px solid var(--line); }.metric:last-child { border-right:0; }.metric::before { content:""; width:7px; height:7px; margin-bottom:17px; border-radius:50%; background:var(--quiet); }.metric--accent::before { background:var(--accent); box-shadow:0 0 0 5px color-mix(in oklch,var(--accent) 16%,transparent); }.metric-label,.metric-detail { margin:0; color:var(--quiet); font-size:.72rem; font-weight:650; letter-spacing:.02em; }.metric-value { margin-top:5px; color:var(--text); font-size:clamp(1.8rem,3vw,2.45rem); font-weight:690; letter-spacing:-.065em; line-height:1; }.metric-detail { margin-top:10px; font-weight:500; letter-spacing:0; }
@media (max-width:760px) { .dashboard-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }.metric:nth-child(2) { border-right:0; }.metric:nth-child(-n+2) { border-bottom:1px solid var(--line); } }
@media (max-width:420px) { .dashboard-metrics { grid-template-columns:1fr; }.metric { min-height:112px; border-right:0; border-bottom:1px solid var(--line); }.metric:last-child { border-bottom:0; }.metric::before { margin-bottom:13px; } }
</style>
