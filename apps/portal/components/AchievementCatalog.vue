<script setup lang="ts">
export type PublicAchievement = {
  challengeId: string;
  family: "achievement";
  type: "title_achievement";
  kind: "title_achievement";
  titleKey: string;
  titleName: string;
  category: string;
  condition: string;
  evidenceRule: string;
  gameVersion: string;
  status: "active" | "sunsetting";
  retiredVersion?: string;
  submissionMode: "manual" | "automatic";
};

const props = defineProps<{ challenges: PublicAchievement[] }>();
const groups = computed(() => {
  const grouped = new Map<string, PublicAchievement[]>();
  for (const challenge of props.challenges) grouped.set(challenge.category, [...(grouped.get(challenge.category) ?? []), challenge]);
  return [...grouped.entries()].map(([category, challenges]) => ({ category, challenges }));
});
</script>

<template>
  <div v-if="groups.length" class="achievement-groups">
    <section v-for="group in groups" :key="group.category" class="achievement-section" :aria-labelledby="`category-${group.category}`">
      <div class="group-heading"><div><h2 :id="`category-${group.category}`">{{ group.category }}</h2></div><span>{{ group.challenges.length }} 项</span></div>
      <div class="achievement-grid">
        <article v-for="challenge in group.challenges" :key="challenge.challengeId" class="achievement-card">
          <div class="achievement-card-copy"><strong>{{ challenge.titleName }}</strong><span>{{ challenge.condition }}</span><span v-if="challenge.status === 'sunsetting'" class="sunsetting"><b>即将结束</b><i>{{ challenge.retiredVersion }}</i></span></div>
        </article>
      </div>
    </section>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.achievement-groups, .achievement-section { display: grid; gap: 18px; }.achievement-section + .achievement-section { margin-top: 58px; }.group-heading { display: flex; align-items: end; justify-content: space-between; gap: 18px; }.group-heading h2 { margin: 0; color: var(--text); font-size: clamp(1.55rem, 3vw, 2.2rem); letter-spacing: -.045em; }.group-heading > span { color: var(--quiet); font-size: .78rem; }.achievement-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.achievement-card { display: grid; min-height: 0; align-content: start; gap: 20px; padding: 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }.achievement-card-copy { display: grid; gap: 9px; }.achievement-card strong { color: var(--text); font-size: 1.22rem; letter-spacing: -.035em; }.achievement-card-copy > span:not(.sunsetting) { color: var(--muted); font-size: .86rem; line-height: 1.6; }.sunsetting { display: inline-flex; width: fit-content; align-items: center; gap: 6px; border: 1px solid color-mix(in oklch, var(--warning) 38%, var(--line)); border-radius: 999px; overflow: hidden; color: color-mix(in oklch, var(--warning) 82%, var(--text)); background: color-mix(in oklch, var(--warning) 14%, var(--surface)); font-size: .72rem; font-weight: 700; }.sunsetting b { padding-left: 8px; }.sunsetting i { padding: 4px 8px 4px 6px; border-left: 1px solid color-mix(in oklch, var(--warning) 34%, var(--line)); color: var(--text); font-style: normal; font-weight: 650; }
@media (max-width: 620px) { .achievement-grid { grid-template-columns: 1fr; }.achievement-card { min-height: 0; }.group-heading { align-items: flex-start; flex-direction: column; gap: 8px; } }
</style>
