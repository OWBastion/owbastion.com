<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";

type Passkey = { passkeyId: string; name: string; createdAt: number; lastUsedAt: number | null };

const api = usePortalApi();
const { busy: passkeyBusy, errorMessage: passkeyError, registerCurrentPlayer } = usePasskeys();
const items = shallowRef<Passkey[]>([]);
const qqBound = shallowRef(false);
const canRemove = computed(() => items.value.length > 1 || (items.value.length > 0 && qqBound.value));
const name = shallowRef("此设备");
const loading = shallowRef(true);
const saving = shallowRef(false);
const error = shallowRef("");
const pendingRemoval = shallowRef<Passkey | null>(null);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api<{ contractVersion: "1"; items: Passkey[]; qqBound: boolean }>("/v1/me/passkeys");
    items.value = response.items;
    qqBound.value = response.qqBound;
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法读取 Passkey，请稍后重试。").description;
  } finally { loading.value = false; }
}

async function add() {
  const saved = await registerCurrentPlayer(name.value.trim() || "此设备");
  if (saved) {
    await load();
    name.value = "此设备";
  }
}

async function remove() {
  if (!pendingRemoval.value || !canRemove.value) return;
  saving.value = true;
  error.value = "";
  try {
    await api(`/v1/me/passkeys/${encodeURIComponent(pendingRemoval.value.passkeyId)}`, { method: "DELETE" });
    pendingRemoval.value = null;
    await load();
  } catch (cause) {
    error.value = portalErrorDetails(cause, "无法移除 Passkey，请稍后重试。").description;
  } finally { saving.value = false; }
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
}

onMounted(() => { void load(); });
</script>

<template>
  <section class="passkey-manager surface-card" aria-labelledby="passkeys-title">
    <div class="passkey-heading">
      <div>
        <h3 id="passkeys-title" class="passkey-title">Passkey</h3>
        <p class="passkey-note">{{ qqBound ? "添加后可用 Passkey 一键登录；QQ 群验证仍可作为备用登录方式。" : "Passkey 用于登录 Portal。未绑定 QQ 时，请保留至少一个 Passkey。" }}</p>
      </div>
      <UButton label="刷新" color="neutral" variant="outline" size="sm" :loading="loading" @click="load" />
    </div>

    <UAlert v-if="error || passkeyError" color="error" variant="subtle" :description="error || passkeyError" />
    <p v-if="loading" class="passkey-note" role="status">读取 Passkey…</p>
    <UEmpty v-else-if="items.length === 0" title="尚无 Passkey" description="添加后，下次可以用设备的指纹、面容或屏幕锁直接登录。" variant="naked" />
    <ul v-else class="passkey-list">
      <li v-for="item in items" :key="item.passkeyId" class="passkey-row">
        <div class="passkey-copy">
          <strong>{{ item.name }}</strong>
          <span>添加于 {{ formatDate(item.createdAt) }}<template v-if="item.lastUsedAt"> · 最近使用 {{ formatDate(item.lastUsedAt) }}</template></span>
        </div>
        <UButton label="移除" color="error" variant="soft" size="sm" :disabled="!canRemove || saving || passkeyBusy" @click="pendingRemoval = item" />
      </li>
    </ul>

    <div class="passkey-add">
      <UFormField label="新 Passkey 名称" hint="例如：手机、笔记本">
        <UInput v-model="name" maxlength="64" class="w-full" :disabled="passkeyBusy || saving" />
      </UFormField>
      <UButton :label="passkeyBusy ? '正在添加…' : '添加 Passkey'" icon="i-lucide-plus" :loading="passkeyBusy" :disabled="passkeyBusy || saving" @click="add" />
    </div>

    <div v-if="pendingRemoval" class="passkey-confirm" role="group" aria-label="确认移除 Passkey">
      <p>确定移除「{{ pendingRemoval.name }}」？这个设备之后将无法用该 Passkey 登录。</p>
      <div class="passkey-actions">
        <UButton label="确认移除" color="error" variant="soft" :loading="saving" :disabled="saving" @click="remove" />
        <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="pendingRemoval = null" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.passkey-manager { display: grid; gap: var(--space-4); padding: var(--space-6); }
.passkey-heading { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
.passkey-title { margin: 0; font-size: 1rem; font-weight: 600; }
.passkey-note { margin: var(--space-2) 0 0; color: var(--muted); font-size: .88rem; line-height: 1.55; }
.passkey-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.passkey-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) 0; border-top: 1px solid var(--line); }
.passkey-copy { display: grid; gap: var(--space-1); min-width: 0; }
.passkey-copy span { color: var(--muted); font-size: .8rem; line-height: 1.45; }
.passkey-add { display: grid; grid-template-columns: minmax(12rem, 1fr) auto; align-items: end; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); }
.passkey-confirm { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface-raised); }
.passkey-confirm p { margin: 0; line-height: 1.55; }
.passkey-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
@media (width < 48rem) { .passkey-manager { padding: var(--space-4); } .passkey-add { grid-template-columns: 1fr; } .passkey-row { align-items: start; } }
</style>
