<script setup lang="ts">
import type { Challenge } from "@owbastion/contracts";
import type { OwnedTitle } from "~/types/title";
import { achievementState, findOwnedTitle } from "~/utils/achievement-status";

export type PublicAchievement = Extract<Challenge, { family: "achievement" }>;

const props = defineProps<{ challenges: PublicAchievement[]; titles?: OwnedTitle[] }>();
const stateOf = (challenge: PublicAchievement) => achievementState(findOwnedTitle(props.titles, challenge));
const groups = computed(() => {
  const grouped = new Map<string, PublicAchievement[]>();
  for (const challenge of props.challenges) grouped.set(challenge.category, [...(grouped.get(challenge.category) ?? []), challenge]);
  return [...grouped.entries()]
    .map(([category, challenges], index) => ({
      category,
      anchor: `series-${index}`,
      obtained: props.titles ? challenges.filter((challenge) => stateOf(challenge) !== "none").length : null,
      challenges: [...challenges].sort((left, right) => left.titleName.localeCompare(right.titleName, "zh-CN")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
});
const selected = shallowRef<PublicAchievement | null>(null);
const sheetOpen = computed({ get: () => selected.value !== null, set: (value) => { if (!value) selected.value = null; } });
const noteOf = (challenge: PublicAchievement) => challenge.status === "scheduled" ? "未开放" : challenge.status === "sunsetting" ? `即将结束${challenge.retiredVersion ? ` · ${challenge.retiredVersion}` : ""}` : undefined;
</script>

<template>
  <div v-if="groups.length" class="catalog">
    <AchievementWall>
      <AchievementShelf v-for="(group, groupIndex) in groups" :key="group.anchor" :title="group.category" :heading-id="`${group.anchor}-title`" :count="group.obtained === null ? String(group.challenges.length) : `${group.obtained}/${group.challenges.length}`">
        <li v-for="(challenge, index) in group.challenges" :key="challenge.challengeId">
          <AchievementTile :name="challenge.titleName" :icon-url="challenge.iconUrl" :icon="challenge.icon" :earned="challenge.status !== 'scheduled' && (!titles || stateOf(challenge) !== 'none')" :checked="Boolean(titles) && stateOf(challenge) !== 'none'" check-label="已获得" :shine-delay="groupIndex * .8 + index * .22" @click="selected = challenge" />
        </li>
      </AchievementShelf>
    </AchievementWall>

    <UModal v-model:open="sheetOpen" :title="selected?.titleName ?? ''" :description="selected ? noteOf(selected) : undefined">
      <template #body>
        <div v-if="selected" class="sheet">
          <AchievementIcon class="sheet__icon" entrance :url="selected.iconUrl" :icon="selected.icon" earned />
          <p class="sheet__condition">{{ selected.condition }}</p>
          <p v-if="titles && stateOf(selected) !== 'none'" class="sheet__owned"><UIcon name="i-lucide-check" aria-hidden="true" />已获得</p>
        </div>
      </template>
    </UModal>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.catalog { display: grid; gap: var(--space-12); }
.sheet { display: grid; justify-items: center; gap: var(--space-4); text-align: center; }
.sheet__icon { --achievement-icon-size: 7rem; }
.sheet__condition { margin: 0; color: var(--muted); }
.sheet__owned { display: inline-flex; align-items: center; gap: var(--space-2); margin: 0; color: var(--accent); font-weight: 600; }
</style>
