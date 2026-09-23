<script setup lang="ts">
withDefaults(defineProps<{ active: "annotations" | "datasets" }>(), { active: "annotations" });
</script>

<template>
  <div class="ocr-quality-stages">
    <nav class="ocr-quality-stages__nav" aria-label="OCR 数据质量流程">
      <NuxtLink to="/admin/annotations" :aria-current="active === 'annotations' ? 'page' : undefined">标注提案与审定</NuxtLink>
      <UIcon name="i-lucide-arrow-right" aria-hidden="true" />
      <NuxtLink to="/admin/datasets" :aria-current="active === 'datasets' ? 'page' : undefined">数据集快照</NuxtLink>
    </nav>
    <p>平台负责标注审定与快照成员；OCRKit 负责训练、评估和模型发布。</p>
  </div>
</template>

<style scoped>
.ocr-quality-stages { display: grid; gap: 0.375rem; }
.ocr-quality-stages__nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem; }
.ocr-quality-stages__nav a { color: var(--muted); font-size: var(--type-caption-size); text-decoration: none; }
.ocr-quality-stages__nav a[aria-current="page"] { color: var(--text); font-weight: 680; }
.ocr-quality-stages__nav :deep(svg) { color: var(--quiet); }
.ocr-quality-stages p { margin: 0; color: var(--quiet); font-size: var(--type-caption-size); }
</style>
