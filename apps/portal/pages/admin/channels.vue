<script setup lang="ts">
import type { AdminGroup } from "~/composables/useAdminApi";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "渠道管理 · 躲避堡垒 3" });
const api = useAdminApi();
const groups = ref<AdminGroup[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const actionMessage = ref("");
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
async function load() { loading.value = true; errorMessage.value = ""; try { groups.value = (await api<{ items: AdminGroup[] }>("/v1/qq/groups")).items; } catch (error: any) { errorMessage.value = error?.data?.error?.message ?? "无法读取群配置，请确认当前账号有管理员权限。"; } finally { loading.value = false; } }
async function setGroup(group: AdminGroup) { const enabled = !group.enabled; group.enabled = enabled; try { await api(`/v1/qq/groups/${encodeURIComponent(group.groupOpenId)}`, { method: "PUT", body: { contractVersion: "1", groupOpenId: group.groupOpenId, environment: group.environment, enabled } }); actionMessage.value = enabled ? "群已开放" : "群已关闭"; } catch (error) { group.enabled = !enabled; throw error; } }
onMounted(() => { void load(); });
</script>

<template>
  <main class="admin-page page-shell"><h1 class="sr-only">渠道管理</h1>
    <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p><p v-if="actionMessage" class="feedback" role="status">{{ actionMessage }}</p>
    <section aria-labelledby="channels-title"><div class="heading"><h2 id="channels-title">开放群</h2><span>{{ loading ? "读取中…" : `${groups.length} 个` }}</span></div><div class="list"><div v-for="group in groups" :key="group.groupOpenId" class="row surface-card"><div><strong>{{ group.groupOpenId }}</strong><small>{{ group.environment === 'production' ? '正式群' : '测试群' }} · 更新于 {{ formatTime(group.updatedAt) }}</small></div><button class="toggle" :class="{ enabled: group.enabled }" type="button" :aria-pressed="group.enabled" @click="setGroup(group)"><span class="track" aria-hidden="true"><span /></span>{{ group.enabled ? '已开放' : '已关闭' }}</button></div><p v-if="!loading && !groups.length" class="empty surface-card">暂无群配置。</p></div></section>
  </main>
</template>

<style scoped>
.admin-page { padding-block:clamp(46px,7vh,72px); max-width:920px; }.heading { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:14px; }.heading h2 { margin:0; font-size:clamp(1.5rem,3vw,2.1rem); letter-spacing:-.045em; }.heading span,.row small { color:var(--quiet); font-size:.78rem; }.list { display:grid; gap:9px; }.row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 18px; }.row strong,.row small { display:block; overflow-wrap:anywhere; }.row small { margin-top:5px; }.toggle { display:inline-flex; min-height:44px; align-items:center; gap:9px; padding:0 11px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:var(--surface-raised); font-size:.76rem; font-weight:680; }.track { display:inline-flex; width:30px; height:18px; align-items:center; padding:2px; border-radius:999px; background:var(--quiet); }.track > span { width:14px; height:14px; border-radius:50%; background:var(--surface); box-shadow:0 1px 2px var(--shadow); transition:transform 160ms ease; }.toggle.enabled { color:var(--text); border-color:color-mix(in oklch,var(--accent) 55%,var(--line)); }.toggle.enabled .track { background:var(--accent); }.toggle.enabled .track > span { transform:translateX(12px); }.empty { margin:0; padding:24px; color:var(--quiet); text-align:center; }.alert,.feedback { margin:0 0 18px; padding:12px 14px; border-radius:11px; font-size:.82rem; }.alert { color:color-mix(in oklch,var(--danger) 82%,var(--text)); background:color-mix(in oklch,var(--danger) 16%,var(--surface)); }.feedback { background:var(--accent-surface); }@media(max-width:520px){.row{align-items:flex-start;flex-direction:column}.toggle{min-height:40px}}
</style>
