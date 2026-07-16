<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";

const props = defineProps<{ player: AdminPlayerDetail; loading?: boolean }>();
const emit = defineEmits<{ setStatus: [status: "active" | "banned"]; unbind: [bindingId: string] }>();
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
</script>

<template>
  <section class="admin-detail">
    <h2><PlayerBattleTag :player-name="props.player.playerName" :player-id="props.player.playerId" /></h2>
    <p class="admin-detail__meta">最近更新 {{ formatTime(props.player.updatedAt) }}</p>
    <UButton :label="props.player.status === 'active' ? '封禁玩家' : '解除封禁'" :color="props.player.status === 'active' ? 'error' : 'primary'" :loading="loading" @click="emit('setStatus', props.player.status === 'active' ? 'banned' : 'active')" />

    <h3>QQ 绑定</h3>
    <div v-if="props.player.bindings.length" class="detail-list">
      <div v-for="binding in props.player.bindings" :key="binding.bindingId"><div><strong>{{ binding.groupOpenId }}</strong><small>{{ binding.memberOpenId }}</small></div><UButton label="解绑" color="neutral" variant="link" :disabled="loading" @click="emit('unbind', binding.bindingId)" /></div>
    </div>
    <UEmpty v-else title="暂无 QQ 绑定" variant="naked" />

    <h3>最近提交</h3>
    <div v-if="props.player.recentSubmissions.length" class="detail-list">
      <div v-for="submission in props.player.recentSubmissions" :key="submission.submissionId"><strong>{{ submission.mapName }}</strong><small>{{ submission.status }} · {{ formatTime(submission.updatedAt) }}</small></div>
    </div>
    <UEmpty v-else title="暂无提交记录" variant="naked" />
  </section>
</template>

<style scoped>
.admin-detail h2 { margin: 0; font-size: 2.25rem; letter-spacing: -.05em; }.admin-detail__meta { margin: 9px 0 22px; color: var(--quiet); font-size: .8rem; }.admin-detail h3 { margin: 26px 0 10px; font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; }.detail-list { display: grid; gap: 9px; }.detail-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; }.detail-list strong, .detail-list small { display: block; }.detail-list small { margin-top: 5px; color: var(--quiet); font-size: .78rem; }
@media (max-width: 560px) { .detail-list > div { align-items: flex-start; flex-direction: column; } }
</style>
