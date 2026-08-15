<script setup lang="ts">
import SubmissionSectionHeading from "~/components/submissions/SubmissionSectionHeading.vue";

const requirements = [
  { title: "游戏 ID", description: "左下角显示的玩家名称" },
  { title: "地图名称", description: "游戏右上角显示的地图名称" },
  { title: "游戏难度", description: "游戏右上角显示的难度标识" },
  { title: "通关数据与标志", description: "左上角通关数据与通关标志" },
  { title: "相关挑战数据", description: "与挑战相关的具体数据" },
];
</script>

<template>
  <section class="requirements" aria-labelledby="requirements-title">
    <SubmissionSectionHeading title="截图要求" heading-id="requirements-title" />
    <dl class="requirement-list">
      <div v-for="item in requirements" :key="item.title" class="requirement-item">
        <dt>{{ item.title }}</dt>
        <dd>{{ item.description }}</dd>
      </div>
    </dl>
    <p class="tip-note">优先使用游戏内截图，避免裁剪或二次压缩。</p>
  </section>
</template>

<style scoped>
.requirements { min-width: 0; }
.requirement-list {
  display: grid;
  gap: 0;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-raised);
  overflow: hidden;
}
.requirement-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid var(--line);
}
.requirement-item:first-child { border-top: 0; }
.requirement-item dt {
  color: var(--text);
  font-size: .82rem;
  font-weight: 700;
  white-space: nowrap;
}
.requirement-item dd {
  margin: 0;
  color: var(--muted);
  font-size: .76rem;
  line-height: 1.4;
  text-align: right;
}
.tip-note {
  margin: 12px 0 0;
  color: var(--quiet);
  font-size: var(--type-caption-size);
  line-height: 1.5;
}
@media (max-width: 480px) {
  .requirement-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .requirement-item dd {
    text-align: left;
  }
}
@media (prefers-contrast: more) {
  .requirement-list { border-color: var(--text); }
  .requirement-item { border-color: var(--text); }
}
</style>
