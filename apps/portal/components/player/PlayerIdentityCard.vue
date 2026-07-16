<script setup lang="ts">
defineProps<{ playerName: string; playerId: string }>();
</script>

<template>
  <UCard class="identity-card" variant="subtle">
    <PlayerBattleTag :player-name="playerName" :player-id="playerId" mode="identity" />
    <div class="identity-status"><p>QQ 绑定</p><StatusBadge label="已绑定" tone="success" /></div>
  </UCard>
</template>

<style scoped>
.identity-card :deep(.ring) { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-width: 0; }
.identity-status { flex: 0 0 auto; }
.identity-status p { margin: 0 0 8px; color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .05em; }
@media (max-width: 620px) { .identity-card :deep(.ring) { align-items: flex-start; flex-direction: column; gap: 18px; }.identity-status { width: 100%; padding-top: 17px; border-top: 1px solid var(--line); } }
</style>
