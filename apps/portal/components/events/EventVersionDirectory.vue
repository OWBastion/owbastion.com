<script setup lang="ts">
import type { RandomEvent } from "~/types/random-event";
import EventDirectory from "~/components/events/EventDirectory.vue";

type EventVersion = { gameVersion: string; eventCount: number };
const props = defineProps<{ versions: EventVersion[]; eventsByVersion: Record<string, RandomEvent[]>; loadingVersion?: string | null; failedVersion?: string | null }>();
const emit = defineEmits<{ loadVersion: [gameVersion: string] }>();
const openVersions = ref(new Set<string>());

watch(() => props.versions, (versions) => {
  if (!openVersions.value.size && versions[0]) openVersions.value = new Set([versions[0].gameVersion]);
}, { immediate: true });

function toggleVersion(gameVersion: string) {
  const next = new Set(openVersions.value);
  if (next.has(gameVersion)) next.delete(gameVersion);
  else { next.add(gameVersion); if (!props.eventsByVersion[gameVersion]) emit("loadVersion", gameVersion); }
  openVersions.value = next;
}
</script>

<template>
  <section class="version-directory" aria-label="随机事件版本目录">
    <article v-for="version in versions" :key="version.gameVersion" class="version-section">
      <button class="version-toggle" type="button" :aria-expanded="openVersions.has(version.gameVersion)" @click="toggleVersion(version.gameVersion)">
        <span><strong>{{ version.gameVersion }}</strong><small>{{ version.eventCount }} 项事件</small></span><span aria-hidden="true">{{ openVersions.has(version.gameVersion) ? '−' : '+' }}</span>
      </button>
      <div v-if="openVersions.has(version.gameVersion)" class="version-content">
        <p v-if="loadingVersion === version.gameVersion" class="state">读取中…</p>
        <UAlert v-else-if="failedVersion === version.gameVersion" color="error" variant="subtle" title="无法读取事件" description="请稍后重试。" />
        <EventDirectory v-else-if="eventsByVersion[version.gameVersion]" :events="eventsByVersion[version.gameVersion] ?? []" />
      </div>
    </article>
  </section>
</template>

<style scoped>
.version-directory { display:grid; gap:12px; }.version-section { overflow:hidden; border:1px solid var(--line); border-radius:14px; background:var(--surface-raised); }.version-toggle { display:flex; width:100%; align-items:center; justify-content:space-between; gap:16px; padding:17px 18px; border:0; color:var(--text); background:transparent; cursor:pointer; text-align:left; transition:background 160ms ease; }.version-toggle:hover,.version-toggle:focus-visible { background:color-mix(in oklch,var(--accent-surface) 68%,transparent); }.version-toggle:active { transform:scale(.99); }.version-toggle span:first-child { display:grid; gap:4px; }.version-toggle strong { font-size:1rem; letter-spacing:-.02em; }.version-toggle small { color:var(--quiet); font-size:.78rem; }.version-toggle span:last-child { color:var(--accent); font-size:1.3rem; }.version-content { padding:0 18px 18px; border-top:1px solid var(--line); }.state { margin:0; padding:36px 0; color:var(--muted); text-align:center; } @media (prefers-reduced-motion:reduce) { .version-toggle { transition:opacity 120ms ease; } }
</style>
