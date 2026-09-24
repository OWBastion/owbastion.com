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
      <div class="group-heading"><h2 :id="`category-${group.category}`" class="type-headline">{{ group.category }}</h2><span class="type-label-sm">{{ group.challenges.length }} 项</span></div>
      <div class="directory-grid">
        <article v-for="challenge in group.challenges" :key="challenge.challengeId" class="achievement-card">
          <div class="achievement-icon" aria-hidden="true"><img v-if="challenge.iconUrl" :src="challenge.iconUrl" alt="" /><UIcon v-else :name="`i-lucide-${challenge.icon}`" /></div>
          <div class="achievement-card-copy"><strong class="type-card-title">{{ challenge.titleName }}</strong><span class="type-label-sm">{{ challenge.condition }}</span><span v-if="challenge.status === 'scheduled'" class="type-label-sm scheduled">未开放</span><span v-else-if="challenge.status === 'sunsetting'" class="sunsetting-row"><StatusBadge label="即将结束" tone="warning" /><small class="type-caption">{{ challenge.retiredVersion }}</small></span></div>
        </article>
      </div>
    </section>
  </div>
  <UEmpty v-else title="暂无记录" variant="naked" />
</template>

<style scoped>
.achievement-groups, .achievement-section { display: grid; gap: var(--space-4); }
.achievement-section + .achievement-section { margin-top: var(--space-8); }
.group-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
.group-heading h2 { margin: 0; }
.group-heading > span, .scheduled, .sunsetting-row small { color: var(--quiet); }
.achievement-card { container-type: inline-size; display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: start; align-items: start; gap: var(--space-4); min-width: 0; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.achievement-icon { display: grid; width: 3.5rem; height: 3.5rem; place-items: center; overflow: hidden; border: 1px dashed var(--line-strong); border-radius: var(--radius-control); color: var(--quiet); background: color-mix(in oklch, var(--surface-raised) 70%, var(--surface)); font-size: 1.5rem; }
.achievement-icon img { width: 60%; height: 60%; object-fit: contain; }
.achievement-card-copy { display: grid; gap: var(--space-2); min-width: 0; }
.achievement-card strong { overflow-wrap: anywhere; color: var(--text); }
.achievement-card-copy > span:not(.sunsetting-row) { color: var(--muted); }
.sunsetting-row { display: inline-flex; width: fit-content; align-items: center; gap: var(--space-2); }
@container (max-width: 23.99rem) { .achievement-icon { width: 2.5rem; height: 2.5rem; font-size: 1.125rem; } }
</style>
