<script setup lang="ts">
const props = defineProps<{ url: string; title: string }>();
const { copied, canNativeShare, copyLink, share } = useEditorialShare(() => props.url, () => props.title);
</script>

<template>
  <div class="editorial-share">
    <UButton class="hit-target-lg" :label="copied ? '已复制' : '复制链接'" :icon="copied ? 'i-lucide-check' : 'i-lucide-link'" color="neutral" variant="outline" @click="copyLink" />
    <UButton v-if="canNativeShare" class="hit-target-lg" label="分享" icon="i-lucide-share" color="neutral" variant="outline" @click="share" />
  </div>
</template>

<style scoped>
.editorial-share { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
</style>
