<script setup lang="ts">
const { data: posts, status, error, refresh } = await useAsyncData(
  "public-blog-list",
  () => queryCollection("blog").order("publishedAt", "DESC").all(),
  { default: () => [] },
);

useSeoMeta({
  title: "开发日志 · 躲避堡垒 3",
  description: "阅读 Portal 的开发日志与设计记录。",
});

const blogPosts = computed(() => posts.value.map((post) => ({
  title: post.title,
  description: post.description,
  date: post.publishedAt,
  badge: "开发日志",
  to: post.path,
})));
</script>

<template>
  <main class="editorial-page page-shell">
    <section class="page-intro" aria-labelledby="blog-title">
      <h1 id="blog-title" class="page-title">开发日志</h1>
      <p class="body-copy">记录 Portal 的实现、设计与公开内容变化。</p>
    </section>

    <section class="editorial-directory surface-card" aria-label="开发日志列表">
      <div v-if="status === 'pending'" class="editorial-loading" role="status">正在读取开发日志…</div>
      <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取开发日志" description="内容暂时不可用，请稍后重试。">
        <template #actions>
          <UButton label="重试" color="neutral" variant="outline" @click="refresh()" />
        </template>
      </UAlert>
      <UEmpty v-else-if="!blogPosts.length" title="暂无开发日志" variant="naked" />
      <UBlogPosts v-else :posts="blogPosts" orientation="horizontal" class="editorial-blog-list" />
    </section>
  </main>
</template>

<style scoped>
.editorial-page { padding-block: clamp(64px, 9vh, 104px) 72px; }
.page-intro { max-width: 690px; margin-bottom: 32px; }
.editorial-directory { min-width: 0; padding: clamp(20px, 4vw, 36px); }
.editorial-loading { min-height: 170px; display: grid; place-items: center; color: var(--muted); }
.editorial-blog-list :deep(article) { min-width: 0; }
@media (max-width: 620px) { .editorial-page { padding-block: 48px; }.page-intro { margin-bottom: 20px; }.editorial-directory { padding: 16px; } }
@media (max-width: 360px) { .editorial-directory { padding: 10px; } }
</style>
