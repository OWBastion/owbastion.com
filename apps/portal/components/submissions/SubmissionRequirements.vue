<script setup lang="ts">
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
    <div class="section-heading">
      <p class="section-number">2.</p>
      <div>
        <h2 id="requirements-title">截图要求</h2>
        <p>请确保您的截图包含以下内容</p>
      </div>
    </div>
    <div class="requirement-list">
      <UCard v-for="item in requirements" :key="item.title" class="requirement-card" variant="subtle">
        <UIcon :name="item.icon" class="requirement-icon" aria-hidden="true" />
        <div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </div>
      </UCard>
    </div>
    <UAlert class="tip" icon="i-lucide-lightbulb" color="warning" variant="subtle" title="小贴士" description="使用游戏内截图功能（默认 F9）可以获得最佳效果。" />
  </section>
</template>

<style scoped>
.requirements { min-width: 0; }
.section-heading { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 18px; }
.section-number { margin: 0; color: var(--text); font-size: 1.1rem; font-weight: 760; }
.section-heading h2 { margin: 0; color: var(--text); font-size: 1.1rem; letter-spacing: -.03em; }
.section-heading p:last-child { margin: 5px 0 0; color: var(--muted); font-size: .84rem; }
.requirement-list { display: grid; gap: 10px; }
.requirement-card { display: flex; align-items: center; gap: 14px; min-height: 65px; padding: 12px 14px; border-color: color-mix(in oklch, var(--accent) 10%, var(--line)); background: color-mix(in oklch, var(--surface) 78%, var(--accent-surface)); box-shadow: none; }
.requirement-icon { flex: 0 0 auto; width: 22px; height: 22px; color: var(--accent); }
.requirement-card h3 { margin: 0; color: var(--accent); font-size: .82rem; font-weight: 720; }
.requirement-card p { margin: 3px 0 0; color: var(--muted); font-size: .76rem; }
.tip { margin-top: 14px; }
</style>
