<script setup lang="ts">
const { busy, errorMessage, registerRecovery } = usePasskeys();
const token = shallowRef("");
const name = shallowRef("恢复设备");
const complete = shallowRef(false);

useSeoMeta({ title: "恢复玩家帐号 · 躲避堡垒 3" });

onMounted(() => {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  token.value = fragment.get("token") ?? "";
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
});

async function recover() {
  if (!token.value) return;
  complete.value = await registerRecovery(token.value, name.value.trim() || "恢复设备");
  if (complete.value) token.value = "";
}
</script>

<template>
  <main class="recovery-page page-shell--narrow">
    <section class="recovery-card surface-card" aria-live="polite">
      <h1 class="page-title">恢复玩家帐号</h1>
      <p class="body-copy">管理员已为原有 Player Account 签发一次性恢复凭据。注册新 Passkey 后，BattleTag、提交记录、称号和精通记录仍属于同一帐号。</p>
      <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
      <UAlert v-if="!token" color="warning" variant="subtle" title="恢复链接无效" description="请联系管理员重新核验并签发恢复链接。" />
      <UFormField label="新 Passkey 名称" hint="例如：新手机">
        <UInput v-model="name" maxlength="64" class="w-full" :disabled="busy || !token" />
      </UFormField>
      <UButton :label="busy ? '正在恢复…' : '注册新 Passkey 并恢复登录'" color="primary" size="lg" :loading="busy" :disabled="busy || !token" @click="recover" />
      <NuxtLink v-if="!token" to="/login" class="recovery-link">返回登录</NuxtLink>
    </section>
  </main>
</template>

<style scoped>
.recovery-page { display: grid; min-height: calc(100svh - 68px); place-items: center; padding-block: clamp(4.5rem, 11vh, 8.125rem) 3.5rem; }
.recovery-card { display: grid; width: 100%; gap: var(--space-5); padding: clamp(var(--space-6), 6vw, var(--space-16)); }
.body-copy { margin: 0; color: var(--muted); line-height: 1.6; }
.recovery-link { color: var(--accent); }
</style>
