<script setup lang="ts">
import type { AdminGroup } from "~/composables/useAdminApi";
import type { QqChangelogPushItem } from "@owbastion/contracts";
import { computed, shallowRef, watch } from "vue";
import { findChangelogMarkdown, queryEditorialSummaries } from "~/utils/editorial-content";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "更新日志推送 · 躲避堡垒 3" });
const toast = useToast();
const api = useAdminApi();
const errorMessage = ref("");
const groups = ref<AdminGroup[]>([]);
const pushes = ref<QqChangelogPushItem[]>([]);
const version = shallowRef("");
const selected = ref<string[]>([]);
const confirmResend = shallowRef(false);
const sending = shallowRef(false);

const { data: releases } = await useAsyncData("admin-changelog-releases", () => queryEditorialSummaries("changelog"), { default: () => [] });
const versionItems = computed(() => releases.value.map((release) => ({ label: `${release.version} · ${release.title}`, value: release.version })));
if (!version.value) version.value = releases.value[0]?.version ?? "";

const pushableGroups = computed(() => groups.value.filter((group) => group.status !== "disconnected"));
const statusOf = (groupOpenId: string) => pushes.value.find((item) => item.groupOpenId === groupOpenId);
const needsConfirm = computed(() => selected.value.some((id) => statusOf(id)?.status === "sent"));
const resultLabel = (item?: QqChangelogPushItem) => !item ? "未推送" : item.status === "sent" ? "已发送" : item.status === "pending" ? "发送中" : item.retryable ? `失败，可重试（${item.errorCode}）` : `失败，不可重试（${item.errorCode}）`;

const adminData = useAdminAsyncData("changelog-push", async () => ({
  groups: (await api<{ items: AdminGroup[] }>("/v1/qq/groups")).items,
  pushes: version.value ? (await api<{ items: QqChangelogPushItem[] }>(`/v1/qq/changelog-pushes?version=${encodeURIComponent(version.value)}`)).items : [],
}), {
  onStart: () => { errorMessage.value = ""; },
  onData: (data) => { groups.value = data.groups; pushes.value = data.pushes; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取群和推送记录，请确认当前账号有管理员权限。").description; },
});
watch(version, () => { selected.value = []; confirmResend.value = false; adminData.refresh(); });

async function send() {
  if (!version.value || !selected.value.length || sending.value) return;
  sending.value = true;
  errorMessage.value = "";
  try {
    const source = await findChangelogMarkdown(version.value);
    if (!source) throw new Error("该版本没有更新日志。");
    await api("/v1/qq/changelog-pushes", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", version: version.value, markdown: `# ${source.title}\n\n${source.markdown}`, groupOpenIds: selected.value, confirmResend: confirmResend.value } });
    toast.add({ title: "已提交推送", color: "success" });
    selected.value = [];
    confirmResend.value = false;
    await adminData.refresh();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法提交推送，请稍后重试。").description;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <AdminWorkspace title="更新日志推送">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <form class="push" @submit.prevent="send">
      <UFormField label="版本" required><USelect v-model="version" :items="versionItems" :ui="{ base: 'w-full' }" /></UFormField>
      <fieldset class="groups">
        <legend>目标群</legend>
        <p v-if="!pushableGroups.length" class="meta">暂无可推送的群。</p>
        <label v-for="group in pushableGroups" :key="group.groupOpenId" class="group">
          <UCheckbox v-model="selected" :value="group.groupOpenId" :aria-label="group.displayName || group.groupOpenId" />
          <span><strong>{{ group.displayName || '未命名群组' }}</strong><small class="meta">{{ group.groupOpenId }}</small></span>
          <StatusBadge :label="resultLabel(statusOf(group.groupOpenId))" :tone="statusOf(group.groupOpenId)?.status === 'sent' ? 'success' : statusOf(group.groupOpenId)?.status === 'failed' ? 'error' : 'warning'" />
        </label>
      </fieldset>
      <UCheckbox v-if="needsConfirm" v-model="confirmResend" label="所选群已收到该版本，确认重新发送" />
      <div class="actions">
        <UButton type="submit" label="推送" :loading="sending" :disabled="!version || !selected.length || (needsConfirm && !confirmResend)" />
        <UButton label="刷新结果" color="neutral" variant="outline" :loading="adminData.loading.value" @click="adminData.refresh()" />
      </div>
    </form>
  </AdminWorkspace>
</template>

<style scoped>
.push { display:grid; gap:1rem; max-width:40rem; }
.groups { display:grid; gap:.5rem; border:0; padding:0; margin:0; }
.group { display:flex; align-items:center; gap:.75rem; }
.group > span { flex:1; display:grid; }
.meta { display:block; overflow-wrap:anywhere; color:var(--quiet); font-size:.78rem; }
.actions { display:flex; gap:.5rem; }
</style>
