<script setup lang="ts">
const { data: posts, status, error, refresh } = await useAsyncData(
  "public-blog-list",
  () => queryCollection("blog").select("title", "description", "path", "publishedAt", "tags").order("publishedAt", "DESC").all(),
  { default: () => [] },
);

useSeoMeta({
  title: "开发日志 · 躲避堡垒 3",
  description: "阅读平台的开发日志与设计记录。",
});

const entries = computed(() => posts.value.map((post) => ({ path: post.path, title: post.title, description: post.description, date: post.publishedAt, tags: post.tags })));
</script>

<template>
  <main class="editorial-page page-shell--readable">
    <div class="editorial-list-frame">
      <section class="page-intro" aria-labelledby="blog-title">
        <h1 id="blog-title" class="page-title">开发日志</h1>
        <p class="editorial-list-lead">玩法、系统和平台的开发记录，写给想知道“为什么这样改”的人。</p>
      </section>

      <section aria-label="开发日志列表">
        <div v-if="status === 'pending'" class="editorial-loading" role="status">读取中…</div>
        <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取开发日志" description="内容暂时不可用，请稍后重试。">
          <template #actions>
            <UButton label="重试" color="neutral" variant="outline" @click="refresh()" />
          </template>
        </UAlert>
        <UEmpty v-else-if="!entries.length" title="暂无开发日志" variant="naked" />
        <EditorialEntryList v-else :entries="entries" kind="blog" />
      </section>
    </div>
  </main>
</template>

<style scoped>
.editorial-page { padding-block: clamp(3rem, 8vh, 5.5rem) 4.5rem; }
.editorial-list-frame { max-width: 48rem; margin-inline: auto; }
.page-intro { display: grid; gap: var(--space-3); margin-bottom: var(--space-8); }
.editorial-list-lead { margin: 0; color: var(--muted); font-size: 1.0625rem; line-height: 1.7; }
.editorial-loading { min-height: 170px; display: grid; place-items: center; color: var(--muted); }
</style>
