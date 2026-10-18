<script setup lang="ts">
import type { PlayerHandleStateResponse } from "@owbastion/contracts";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";
import { playerHandleErrorMessage, playerHandlePath } from "~/utils/player-handle";

const props = defineProps<{ publicProfile: boolean }>();

const api = usePortalApi();
const siteUrl = useRuntimeConfig().public.siteUrl;
const state = shallowRef<PlayerHandleStateResponse | null>(null);
const draft = shallowRef("");
const busy = shallowRef(false);
const loadFailed = shallowRef(false);
const error = shallowRef("");
const copied = shallowRef(false);

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
  if (await write("/v1/me/handle", { method: "PUT", body: { contractVersion: "1", handle } }, "申请失败，请稍后重试。")) draft.value = "";
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
  <UCard class="handle-card" variant="subtle">
    <div class="handle-body">
      <strong>公开 ID</strong>
      <p v-if="loadFailed" class="handle-error" role="alert">无法读取公开 ID。<UButton label="重试" color="neutral" variant="link" size="sm" @click="load" /></p>
      <template v-else-if="state">
        <div v-if="state.handle" class="handle-current">
          <span class="handle-value">{{ state.handle }}</span>
          <span class="handle-url">{{ profileUrl }}</span>
          <div class="handle-actions">
            <UButton :label="copied ? '已复制' : '复制链接'" color="neutral" variant="outline" size="sm" @click="copy" />
            <UButton label="查看主页" :to="playerHandlePath(state.handle)" color="neutral" variant="ghost" size="sm" />
          </div>
          <p v-if="!props.publicProfile" class="handle-note">公开主页已关闭，链接暂不可访问。</p>
        </div>
        <p v-else class="handle-note">未设置</p>

        <div v-if="state.pending" class="handle-pending">
          <span><b>{{ state.pending.handle }}</b> · 审核中</span>
          <UButton label="撤回申请" color="neutral" variant="outline" size="sm" :disabled="busy" @click="withdraw" />
        </div>
        <p v-else-if="state.rejected" class="handle-note">{{ state.rejected.handle }} · 未通过</p>

        <form class="handle-form" @submit.prevent="submit">
          <UInput v-model="draft" aria-label="公开 ID" placeholder="2–9 个字符" maxlength="9" :disabled="busy" />
          <UButton type="submit" :label="state.handle ? '申请更换' : '申请 ID'" :loading="busy" :disabled="!draft.trim()" />
        </form>
        <p class="handle-note">字母、数字和汉字，不能全为数字。</p>
        <p v-if="error" class="handle-error" role="alert">{{ error }}</p>
      </template>
      <USkeleton v-else class="handle-skeleton" role="status" aria-label="读取中…" />
    </div>
  </UCard>
</template>

<style scoped>
.handle-body { display: grid; gap: var(--space-3); min-width: 0; }
.handle-body strong { color: var(--text); font-size: .85rem; }
.handle-body p { margin: 0; }
.handle-current { display: grid; gap: var(--space-1); min-width: 0; }
.handle-value { color: var(--text); font-size: var(--type-card-title-size); font-weight: 700; overflow-wrap: anywhere; }
.handle-url { color: var(--quiet); font-size: .73rem; overflow-wrap: anywhere; }
.handle-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.handle-pending { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: .85rem; }
.handle-form { display: flex; gap: var(--space-2); }
.handle-form > :first-child { flex: 1 1 auto; min-width: 0; }
.handle-note { color: var(--quiet); font-size: .73rem; }
.handle-error { color: var(--danger); font-size: .73rem; }
.handle-skeleton { height: 5rem; border-radius: var(--radius-control); }
</style>
