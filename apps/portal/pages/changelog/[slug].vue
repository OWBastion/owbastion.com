<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from "vue";
import EditorialArticle from "~/components/content/EditorialArticle.vue";

const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));
const contentPath = computed(() => `/changelog/${slug.value}`);
const requestUrl = useRequestURL();
const copied = shallowRef(false);
const canNativeShare = shallowRef(false);
let copiedTimer = 0;

const { data: entry, status, error } = await useAsyncData(
  "public-changelog-entry",
  () => queryCollection("changelog").path(contentPath.value).first(),
  { default: () => null, watch: [contentPath] },
);

const title = computed(() => {
  if (!entry.value) return "版本更新 · 躲避堡垒 3";
  return `${entry.value.version} ${entry.value.title} · 版本更新 · 躲避堡垒 3`;
});
const description = computed(() => entry.value?.description ?? "查看已发布的平台内容与规则变化。");
const canonical = computed(() => new URL(contentPath.value, requestUrl.origin).toString());
const shareTitle = computed(() => entry.value ? `${entry.value.version} ${entry.value.title}` : "版本更新");

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogType: "article",
});
useHead(() => ({ link: [{ rel: "canonical", href: canonical.value }] }));

onMounted(() => {
  canNativeShare.value = typeof navigator.share === "function";
});

onUnmounted(() => {
  window.clearTimeout(copiedTimer);
});

async function copyLink() {
  if (!navigator.clipboard) return;

  try {
    await navigator.clipboard.writeText(canonical.value);
    copied.value = true;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    copied.value = false;
  }
}

async function sharePage() {
  try {
    await navigator.share({ title: shareTitle.value, url: canonical.value });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    await copyLink();
  }
}
</script>

<template>
  <main class="editorial-detail-page page-shell--readable">
    <div class="editorial-detail-nav">
      <NuxtLink to="/changelog" class="editorial-back-link pressable"><UIcon name="i-lucide-arrow-left" aria-hidden="true" />返回版本更新</NuxtLink>
      <div v-if="entry" class="editorial-share-actions">
        <UButton
          class="hit-44"
          :label="copied ? '已复制' : '复制链接'"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          @click="copyLink"
        />
        <UButton
          v-if="canNativeShare"
          class="hit-44"
          label="分享"
          icon="i-lucide-share"
          color="neutral"
          variant="ghost"
          @click="sharePage"
        />
      </div>
    </div>
    <div v-if="status === 'pending'" class="editorial-detail-state surface-card" role="status">读取中…</div>
    <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取版本更新" description="内容暂时不可用，请稍后重试。" />
    <UAlert v-else-if="!entry" color="neutral" variant="subtle" role="alert" title="找不到这条版本更新" description="该地址对应的内容不存在或已移除。">
      <template #actions><UButton to="/changelog" label="返回版本更新" color="neutral" variant="outline" /></template>
    </UAlert>
    <EditorialArticle v-else :entry="entry" kind="changelog" />
  </main>
</template>

<style scoped>
.editorial-detail-page { padding-block: clamp(2.5rem, 6vh, 4.5rem) 4.5rem; }
.editorial-detail-nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; margin-bottom: 0.85rem; }
.editorial-back-link { display: inline-flex; min-height: 44px; align-items: center; gap: 0.5rem; color: var(--muted); font-size: var(--type-caption-size); font-weight: 650; text-decoration: none; }
.editorial-share-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.15rem; }
.editorial-detail-state { min-height: 260px; display: grid; place-items: center; color: var(--muted); }
@media (max-width: 620px) {
  .editorial-detail-page { padding-block: 1.75rem 3rem; }
  .editorial-detail-nav { margin-bottom: 0.65rem; }
}
</style>
