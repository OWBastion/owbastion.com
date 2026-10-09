<script setup lang="ts">
import { editorialText, editorialToc, readingMinutes } from "~/utils/editorial";

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));
const contentPath = computed(() => `/blog/${slug.value}`);
const requestUrl = useRequestURL();

const { data: post, status, error } = await useAsyncData(
  "public-blog-entry",
  () => queryCollection("blog").path(contentPath.value).first(),
  { default: () => null, watch: [contentPath] },
);
// Neighbours come from a light projection of the whole list, newest first.
const { data: all } = await useAsyncData(
  "public-blog-neighbours",
  () => queryCollection("blog").select("title", "path", "publishedAt").order("publishedAt", "DESC").all(),
  { default: () => [] },
);

const title = computed(() => post.value ? `${post.value.title} · 开发日志 · 躲避堡垒 3` : "开发日志 · 躲避堡垒 3");
const description = computed(() => post.value?.description ?? "阅读 Portal 的开发日志与设计记录。");
const canonical = computed(() => new URL(contentPath.value, requestUrl.origin).toString());
const index = computed(() => all.value.findIndex((item) => item.path === contentPath.value));
const older = computed(() => index.value >= 0 && all.value[index.value + 1] ? { path: all.value[index.value + 1]!.path, title: all.value[index.value + 1]!.title, label: "上一篇" } : null);
const newer = computed(() => index.value > 0 ? { path: all.value[index.value - 1]!.path, title: all.value[index.value - 1]!.title, label: "下一篇" } : null);
const minutes = computed(() => post.value ? readingMinutes(editorialText(post.value.body)) : undefined);

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogUrl: () => canonical.value,
  ogType: "article",
  ogSiteName: "躲避堡垒 3",
  ogLocale: "zh_CN",
  articlePublishedTime: () => post.value?.publishedAt ? String(post.value.publishedAt) : undefined,
  articleTag: () => post.value?.tags,
  twitterCard: "summary",
  twitterTitle: () => title.value,
  twitterDescription: () => description.value,
});
useHead(() => ({ link: [{ rel: "canonical", href: canonical.value }] }));
</script>

<template>
  <EditorialDetail kind="blog" :entry="post" :status="status" :failed="Boolean(error)" :canonical="canonical" :share-title="post?.title ?? '开发日志'" :toc="editorialToc(post?.body)" :minutes="minutes" :older="older" :newer="newer" />
</template>
