<script setup lang="ts">
import type { Challenge } from "../composables/useSubmissionUpload";

defineProps<{ challenges: Challenge[]; selectedChallengeId: string }>();
const emit = defineEmits<{ select: [challengeId: string] }>();
const kindText: Record<Challenge["kind"], string> = { difficulty_completion: "难度通关", pioneer: "开拓者挑战", classic_completion: "经典版通关" };
</script>

<template>
  <div v-if="challenges.length" class="challenge-list">
    <button v-for="challenge in challenges" :key="challenge.challengeId" class="catalog-card" :class="{ 'catalog-card-selected': selectedChallengeId === challenge.challengeId }" type="button" @click="emit('select', challenge.challengeId)">
      <span class="catalog-card-meta">{{ challenge.mapName }} · {{ kindText[challenge.kind] }}</span>
      <strong>{{ challenge.name }}</strong>
      <span v-if="challenge.difficulty" class="catalog-card-detail">{{ challenge.difficulty }}</span>
    </button>
  </div>
  <p v-else class="catalog-empty">暂无可提交的成就挑战</p>
</template>

<style scoped>
.challenge-list { display: grid; gap: 10px; }
.catalog-card { display: grid; gap: 8px; width: 100%; padding: 18px; border: 1px solid var(--line); border-radius: 14px; color: inherit; background: var(--surface); text-align: left; cursor: pointer; transition: border-color 160ms ease, transform 160ms ease, background 160ms ease; }
.catalog-card:hover { transform: translateY(-1px); border-color: var(--line-strong); }
.catalog-card-selected { border-color: var(--accent); background: var(--accent-surface); }
.catalog-card-meta, .catalog-card-detail { color: var(--quiet); font-size: .75rem; }
.catalog-card strong { font-size: 1rem; letter-spacing: -.02em; }
.catalog-empty { margin: 0; color: var(--quiet); font-size: .85rem; }
</style>
