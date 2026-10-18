<script setup lang="ts">
import type { PlayerHandleStateResponse } from "@owbastion/contracts";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";
import { playerHandleErrorMessage, playerHandlePath } from "~/utils/player-handle";

const api = usePortalApi();
const siteUrl = useRuntimeConfig().public.siteUrl;
const state = shallowRef<PlayerHandleStateResponse | null>(null);
const draft = shallowRef("");
const busy = shallowRef(false);
const loadFailed = shallowRef(false);
const error = shallowRef("");
const copied = shallowRef(false);
const editing = shallowRef(false);

const profileUrl = computed(() => state.value?.handle ? `${siteUrl}${playerHandlePath(state.value.handle)}` : "");

async function load() {
  loadFailed.value = false;
  try {
    state.value = await api<PlayerHandleStateResponse>("/v1/me/handle");
  } catch {
    loadFailed.value = true;
  }
}

async function write(path: string, options: { method: "PUT" | "DELETE"; body?: Record<string, unknown> }, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    state.value = await api<PlayerHandleStateResponse>(path, { ...options, headers: { "Idempotency-Key": createRequestId() } });
    return true;
  } catch (cause) {
    const details = portalErrorDetails(cause, fallback);
    error.value = playerHandleErrorMessage(details.code) ?? details.description;
  } finally {
    busy.value = false;
  }
}

async function submit() {
  const handle = draft.value.trim();
  if (!handle) return;
  if (await write("/v1/me/handle", { method: "PUT", body: { contractVersion: "1", handle } }, "申请失败，请稍后重试。")) cancel();
}

function cancel() {
  editing.value = false;
  draft.value = "";
  error.value = "";
}

const withdraw = () => write("/v1/me/handle/request", { method: "DELETE" }, "撤回失败，请稍后重试。");

async function copy() {
  try {
    await navigator.clipboard.writeText(profileUrl.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1800);
  } catch {
    error.value = "复制失败，请手动复制链接。";
  }
}

onMounted(load);
</script>

<template>
  <div class="handle">
    <p v-if="loadFailed" class="handle-error" role="alert">无法读取公开 ID。<UButton label="重试" color="neutral" variant="link" size="sm" @click="load" /></p>
    <template v-else-if="state">
      <form v-if="editing" class="handle-row" @submit.prevent="submit">
        <UInput v-model="draft" class="handle-input" aria-label="公开 ID" placeholder="2–9 个字符" maxlength="9" autofocus :disabled="busy" />
        <UButton type="submit" label="提交申请" :loading="busy" :disabled="!draft.trim()" />
        <UButton label="取消" color="neutral" variant="ghost" :disabled="busy" @click="cancel" />
      </form>
      <div v-else class="handle-row">
        <span class="handle-label">公开 ID</span>
        <span class="handle-value" :class="{ 'handle-value--unset': !state.handle }">{{ state.handle ?? "未设置" }}</span>
        <div class="handle-actions">
          <UButton v-if="state.handle" :label="copied ? '已复制' : '复制链接'" color="neutral" variant="ghost" size="sm" @click="copy" />
          <UButton v-if="state.handle" label="查看" :to="playerHandlePath(state.handle)" color="neutral" variant="ghost" size="sm" />
          <UButton :label="state.handle ? '更换' : '设置'" color="neutral" variant="outline" size="sm" @click="editing = true" />
        </div>
      </div>
      <p v-if="editing" class="handle-note">2–9 个字母、数字或汉字，不能全为数字。</p>
      <div v-if="state.pending" class="handle-row">
        <span class="handle-note"><b>{{ state.pending.handle }}</b> · 审核中</span>
        <UButton label="撤回申请" color="neutral" variant="ghost" size="sm" :disabled="busy" @click="withdraw" />
      </div>
      <p v-else-if="state.rejected" class="handle-note">{{ state.rejected.handle }} · 未通过</p>
      <p v-if="error" class="handle-error" role="alert">{{ error }}</p>
    </template>
    <USkeleton v-else class="handle-skeleton" role="status" aria-label="读取中…" />
  </div>
</template>

<style scoped>
.handle { display: grid; gap: var(--space-2); min-width: 0; }
.handle p { margin: 0; }
.handle-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-width: 0; }
.handle-label { color: var(--quiet); font-size: .73rem; }
.handle-value { color: var(--text); font-size: .85rem; font-weight: 700; overflow-wrap: anywhere; }
.handle-value--unset { color: var(--quiet); font-weight: 400; }
.handle-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-left: auto; }
.handle-input { flex: 1 1 10rem; min-width: 0; }
.handle-note { color: var(--quiet); font-size: .73rem; }
.handle-error { color: var(--danger); font-size: .73rem; }
.handle-skeleton { height: 2rem; border-radius: var(--radius-control); }
</style>
