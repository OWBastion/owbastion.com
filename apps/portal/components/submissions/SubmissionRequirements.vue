<script setup lang="ts">
import SubmissionSectionHeading from "~/components/submissions/SubmissionSectionHeading.vue";

const requirements = [
  { icon: "i-lucide-user-round", title: "游戏 ID", description: "左下角显示的玩家名称" },
  { icon: "i-lucide-map", title: "地图名称", description: "游戏右上角显示的地图名称" },
  { icon: "i-lucide-chart-no-axes-column", title: "游戏难度", description: "游戏右上角显示的难度标识" },
  { icon: "i-lucide-badge-check", title: "通关数据与标志", description: "左上角通关数据与通关标志" },
  { icon: "i-lucide-star", title: "相关挑战数据", description: "与挑战相关的具体数据" },
];
</script>

<template>
  <section class="requirements" aria-labelledby="requirements-title">
    <SubmissionSectionHeading number="2." title="截图要求" description="请确保截图包含以下内容" heading-id="requirements-title" />
    <div class="requirement-list">
      <UCard v-for="item in requirements" :key="item.title" class="requirement-card" variant="subtle">
        <UIcon :name="item.icon" class="requirement-icon" aria-hidden="true" />
        <div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </div>
      </UCard>
    </div>
    <UAlert class="tip" icon="i-lucide-lightbulb" color="warning" variant="subtle" title="小贴士" description="优先使用游戏内截图，避免裁剪或二次压缩。" />
  </section>
</template>

<style scoped>
.requirements { min-width: 0; }
.requirement-list { display: grid; gap: 8px; }
.requirement-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 8px 12px;
  border-color: color-mix(in oklch, var(--accent) 10%, var(--line));
  background: color-mix(in oklch, var(--surface) 78%, var(--accent-surface));
  box-shadow: none;
}
.requirement-icon { flex: 0 0 auto; width: 20px; height: 20px; color: var(--accent); }
.requirement-card h3 { margin: 0; color: var(--accent); font-size: .82rem; font-weight: 720; line-height: 1.3; }
.requirement-card p { margin: 1px 0 0; color: var(--muted); font-size: .76rem; line-height: 1.3; }
.tip { margin-top: 12px; }
@media (prefers-reduced-transparency: reduce) {
  .requirement-card { background: var(--surface-raised); }
}
</style>
