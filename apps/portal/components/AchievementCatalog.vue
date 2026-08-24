<script setup lang="ts">

export type PublicAchievement = {
  challengeId: string;
  family: "achievement";
  type: "title_achievement";
  kind: "title_achievement";
  titleKey: string;
  titleName: string;
  icon: string;
  iconUrl?: string | null;
  category: string;
  condition: string;
  evidenceRule: string;
  gameVersion: string;
  status: "scheduled" | "active" | "sunsetting";
  startsAt?: number;
  endsAt?: number;
  retiredVersion?: string;
  submissionMode: "manual" | "automatic";
};

const props = defineProps<{ challenges: PublicAchievement[] }>();
const groups = computed(() => {
  const grouped = new Map<string, PublicAchievement[]>();
  for (const challenge of props.challenges) grouped.set(challenge.category, [...(grouped.get(challenge.category) ?? []), challenge]);
  return [...grouped.entries()]
    .map(([category, challenges]) => ({
      category,
      challenges: [...challenges].sort((left, right) => left.titleName.localeCompare(right.titleName, "zh-CN")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
});
</script>

<template>
  <div v-if="groups.length" class="achievement-groups">
    <section v-for="group in groups" :key="group.category" class="achievement-section" :aria-labelledby="`category-${group.category}`">
      <div class="group-heading"><div><h2 :id="`category-${group.category}`" class="type-headline">{{ group.category }}</h2></div><span>{{ group.challenges.length }} 项</span></div>
      <div class="achievement-grid">
        <article v-for="challenge in group.challenges" :key="challenge.challengeId" class="achievement-card">
          <div class="achievement-icon" aria-hidden="true"><img v-if="challenge.iconUrl" :src="challenge.iconUrl" alt="" /><UIcon v-else :name="`i-lucide-${challenge.icon}`" /></div>
          <div class="achievement-card-copy"><strong>{{ challenge.titleName }}</strong><span>{{ challenge.condition }}</span><span v-if="challenge.status === 'scheduled'" class="scheduled">未开放</span><span v-else-if="challenge.status === 'sunsetting'" class="sunsetting-row"><StatusBadge label="即将结束" tone="warning" /><small>{{ challenge.retiredVersion }}</small></span></div>
        </article>
      </div>
    </section>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.achievement-groups, .achievement-section { display: grid; gap: 18px; }.achievement-section + .achievement-section { margin-top: 58px; }.group-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; }.group-heading h2 { margin: 0; }.group-heading > span { color: var(--quiet); font-size: .78rem; }.achievement-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.achievement-card { display: grid; grid-template-columns: 58px minmax(0, 1fr); min-height: 0; align-content: start; align-items: start; gap: 16px; padding: 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }.achievement-icon { display: grid; width: 58px; height: 58px; place-items: center; border: 1px dashed var(--line-strong); border-radius: 14px; color: var(--quiet); background: color-mix(in oklch, var(--surface-raised) 70%, var(--surface)); font-size: 1.45rem; font-weight: 700; overflow: hidden; }.achievement-icon img { width: 34px; height: 34px; object-fit: contain; }.achievement-card-copy { display: grid; gap: 9px; }.achievement-card strong { color: var(--text); font-size: 1.22rem; letter-spacing: -.035em; }.achievement-card-copy > span:not(.sunsetting-row) { color: var(--muted); font-size: .86rem; line-height: 1.6; }.sunsetting-row { display: inline-flex; width: fit-content; align-items: center; gap: 8px; }.sunsetting-row small { color: var(--quiet); font-size: .72rem; }
@media (max-width: 620px) { .achievement-grid { grid-template-columns: 1fr; }.achievement-card { min-height: 0; padding: 18px; }.group-heading { align-items: flex-start; flex-direction: column; gap: 8px; } }
</style>
