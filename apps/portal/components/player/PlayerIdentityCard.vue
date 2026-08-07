<script setup lang="ts">
defineProps<{ playerName: string; playerId: string }>();
</script>

<template>
  <UCard class="identity-card" variant="subtle">
    <PlayerBattleTag :player-name="playerName" :player-id="playerId" mode="identity" />
  </UCard>
</template>
