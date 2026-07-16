<script setup lang="ts">
const props = withDefaults(defineProps<{
  playerName: string;
  playerId: string;
  mode?: "inline" | "identity";
}>(), { mode: "inline" });
</script>

<template>
  <span v-if="props.mode === 'inline'" class="battle-tag">
    <span>{{ props.playerName }}</span><span class="battle-tag__id" aria-hidden="true">#{{ props.playerId }}</span>
  </span>
  <div v-else class="battle-tag-identity">
    <span class="battle-tag-identity__mark" aria-hidden="true">{{ props.playerName.slice(0, 1) }}</span>
    <div>
      <p class="battle-tag-identity__label">战网 ID</p>
      <strong class="battle-tag"><span>{{ props.playerName }}</span><span class="battle-tag__id" aria-hidden="true">#{{ props.playerId }}</span></strong>
    </div>
  </div>
</template>

<style scoped>
.battle-tag { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.battle-tag__id { color: var(--quiet); }
.battle-tag-identity { display: flex; min-width: 0; align-items: center; gap: 15px; }
.battle-tag-identity__mark { display: grid; flex: 0 0 48px; width: 48px; height: 48px; place-items: center; border: 1px solid color-mix(in oklch, var(--accent) 52%, var(--line)); border-radius: 50%; color: var(--accent); background: var(--accent-surface); font-size: 1.2rem; font-weight: 720; letter-spacing: -.04em; }
.battle-tag-identity__label { margin: 0 0 8px; color: var(--quiet); font-size: .72rem; font-weight: 680; letter-spacing: .05em; }
.battle-tag-identity .battle-tag { display: block; max-width: 100%; font-size: clamp(1.25rem, 2.6vw, 1.75rem); font-weight: 680; letter-spacing: -.045em; line-height: 1.1; }
</style>
