<script setup lang="ts">
import { editorialToc } from "~/utils/editorial";

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));
const contentPath = computed(() => `/changelog/${slug.value}`);
const requestUrl = useRequestURL();

const { data: entry, status, error } = await useAsyncData(
  "public-changelog-entry",
  () => queryCollection("changelog").path(contentPath.value).first(),
  { default: () => null, watch: [contentPath] },
);
const { data: all } = await useAsyncData(
  "public-changelog-neighbours",
  () => queryCollection("changelog").select("title", "path", "version", "releasedAt").order("releasedAt", "DESC").all(),
  { default: () => [] },
);

const title = computed(() => {
  if (!entry.value) return "版本更新 · 躲避堡垒 3";
  return `${entry.value.version} ${entry.value.title} · 版本更新 · 躲避堡垒 3`;
});
const description = computed(() => entry.value?.description ?? "查看已发布的平台内容与规则变化。");
const canonical = computed(() => new URL(contentPath.value, requestUrl.origin).toString());
const shareTitle = computed(() => entry.value ? `${entry.value.version} ${entry.value.title}` : "版本更新");
const index = computed(() => all.value.findIndex((item) => item.path === contentPath.value));
const neighbour = (offset: number, label: string) => { const item = index.value >= 0 ? all.value[index.value + offset] : undefined; return item ? { path: item.path, title: `${item.version} ${item.title}`, label } : null; };
const older = computed(() => neighbour(1, "上一版"));
const newer = computed(() => index.value > 0 ? neighbour(-1, "下一版") : null);

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogUrl: () => canonical.value,
  ogType: "article",
  ogSiteName: "躲避堡垒 3",
  ogLocale: "zh_CN",
  articlePublishedTime: () => entry.value?.releasedAt ? String(entry.value.releasedAt) : undefined,
  twitterCard: "summary",
  twitterTitle: () => title.value,
  twitterDescription: () => description.value,
});
useHead(() => ({ link: [{ rel: "canonical", href: canonical.value }] }));
</script>

<template>
  <EditorialDetail kind="changelog" :entry="entry" :status="status" :failed="Boolean(error)" :canonical="canonical" :share-title="shareTitle" :toc="editorialToc(entry?.body)" :older="older" :newer="newer" />
</template>
