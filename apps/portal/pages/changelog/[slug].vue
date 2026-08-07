<script setup lang="ts">
import EditorialArticle from "~/components/content/EditorialArticle.vue";

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));
const contentPath = computed(() => `/changelog/${slug.value}`);
const requestUrl = useRequestURL();

const { data: entry, status, error } = await useAsyncData(
  "public-changelog-entry",
  () => queryCollection("changelog").path(contentPath.value).first(),
  { default: () => null, watch: [contentPath] },
);

const title = computed(() => entry.value ? `${entry.value.title} · 版本记录 · 躲避堡垒 3` : "版本记录 · 躲避堡垒 3");
const description = computed(() => entry.value?.description ?? "查看已发布的 Portal 内容与规则变化。");
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
  <main class="editorial-detail-page page-shell--narrow">
    <NuxtLink to="/changelog" class="editorial-back-link pressable">返回版本记录</NuxtLink>
    <div v-if="status === 'pending'" class="editorial-detail-state surface-card" role="status">正在读取版本记录…</div>
    <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取版本记录" description="内容暂时不可用，请稍后重试。" />
    <UAlert v-else-if="!entry" color="neutral" variant="subtle" title="找不到这条版本记录" description="该地址对应的内容不存在或已移除。">
      <template #actions><UButton to="/changelog" label="返回版本记录" color="neutral" variant="outline" /></template>
    </UAlert>
    <EditorialArticle v-else :entry="entry" kind="changelog" />
  </main>
</template>

<style scoped>
.editorial-detail-page { padding-block: clamp(48px, 8vh, 88px) 72px; }
.editorial-back-link { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 18px; color: var(--muted); font-size: var(--type-caption-size); font-weight: 650; text-decoration: none; }
.editorial-detail-state { min-height: 260px; display: grid; place-items: center; color: var(--muted); }
@media (max-width: 620px) { .editorial-detail-page { padding-block: 38px 48px; } }
</style>
