<script setup lang="ts">
const { data: releases, status, error, refresh } = await useAsyncData(
  "public-changelog-list",
  () => queryCollection("changelog").select("title", "path", "version", "releasedAt").order("releasedAt", "DESC").all(),
  { default: () => [] },
);

useSeoMeta({
  title: "版本更新 · 躲避堡垒 3",
  description: "查看已发布的平台内容与规则变化。",
});

const entries = computed(() => releases.value.map((release) => ({ path: release.path, title: release.title, version: release.version, date: release.releasedAt })));
</script>

<template>
  <main class="editorial-page page-shell--readable">
    <div class="editorial-list-frame">
      <section class="page-intro" aria-labelledby="changelog-title">
        <h1 id="changelog-title" class="page-title">版本更新</h1>
        <p class="editorial-list-lead">每个已发布版本带来的内容与规则变化。</p>
      </section>

      <section aria-label="版本更新列表">
        <div v-if="status === 'pending'" class="editorial-loading" role="status">读取中…</div>
        <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取版本更新" description="内容暂时不可用，请稍后重试。">
          <template #actions>
            <UButton label="重试" color="neutral" variant="outline" @click="refresh()" />
          </template>
        </UAlert>
        <UEmpty v-else-if="!entries.length" title="暂无版本更新" variant="naked" />
        <EditorialEntryList v-else :entries="entries" kind="changelog" />
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
