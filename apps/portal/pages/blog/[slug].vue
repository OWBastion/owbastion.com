<script setup lang="ts">
import EditorialArticle from "~/components/content/EditorialArticle.vue";

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));
const contentPath = computed(() => `/blog/${slug.value}`);
const requestUrl = useRequestURL();

const { data: post, status, error } = await useAsyncData(
  "public-blog-entry",
  () => queryCollection("blog").path(contentPath.value).first(),
  { default: () => null, watch: [contentPath] },
);

const title = computed(() => post.value ? `${post.value.title} · 开发日志 · 躲避堡垒 3` : "开发日志 · 躲避堡垒 3");
const description = computed(() => post.value?.description ?? "阅读 Portal 的开发日志与设计记录。");
const canonical = computed(() => new URL(contentPath.value, requestUrl.origin).toString());

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogType: "article",
});
useHead(() => ({ link: [{ rel: "canonical", href: canonical.value }] }));
</script>

<template>
  <main class="editorial-detail-page page-shell--readable">
    <NuxtLink to="/blog" class="editorial-back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />返回开发日志</NuxtLink>
    <div v-if="status === 'pending'" class="editorial-detail-state surface-card" role="status">读取中…</div>
    <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取开发日志" description="内容暂时不可用，请稍后重试。" />
    <UAlert v-else-if="!post" color="neutral" variant="subtle" role="alert" title="找不到这篇开发日志" description="该地址对应的内容不存在或已移除。">
      <template #actions><UButton to="/blog" label="返回开发日志" color="neutral" variant="outline" /></template>
    </UAlert>
    <EditorialArticle v-else :entry="post" kind="blog" />
  </main>
</template>

<style scoped>
.editorial-detail-page { padding-block: clamp(48px, 8vh, 88px) 4.5rem; }
.editorial-back-link { display: inline-flex; min-height: 44px; align-items: center; gap: 0.5rem; margin-bottom: 1.125rem; color: var(--muted); font-size: var(--type-caption-size); font-weight: 650; text-decoration: none; }
.editorial-detail-state { min-height: 260px; display: grid; place-items: center; color: var(--muted); }
@media (max-width: 620px) { .editorial-detail-page { padding-block: 2.375rem 3rem; } }
</style>
