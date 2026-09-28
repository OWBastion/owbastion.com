<script setup lang="ts">
const { data: posts, status, error, refresh } = await useAsyncData(
  "public-blog-list",
  () => queryCollection("blog").order("publishedAt", "DESC").all(),
  { default: () => [] },
);

useSeoMeta({
  title: "开发日志 · 躲避堡垒 3",
  description: "阅读平台的开发日志与设计记录。",
});

const blogPosts = computed(() => posts.value.map((post) => ({
  title: post.title,
  description: post.description,
  date: post.publishedAt,
  to: post.path,
  class: "pressable-soft",
})));
</script>

<template>
  <main class="editorial-page page-shell">
    <section class="editorial-page-intro" aria-labelledby="blog-title">
      <h1 id="blog-title" class="page-title">开发日志</h1>
    </section>

    <section class="editorial-directory surface-card" aria-label="开发日志列表">
      <div v-if="status === 'pending'" class="editorial-loading" role="status">读取中…</div>
      <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取开发日志" description="内容暂时不可用，请稍后重试。">
        <template #actions>
          <UButton label="重试" color="neutral" variant="outline" @click="refresh()" />
        </template>
      </UAlert>
      <UEmpty v-else-if="!blogPosts.length" title="暂无开发日志" variant="naked" />
      <UBlogPosts v-else :posts="blogPosts" orientation="horizontal" class="editorial-blog-list" />
    </section>
  </main>
</template>
