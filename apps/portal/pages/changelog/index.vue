<script setup lang="ts">
const { data: entries, status, error, refresh } = await useAsyncData(
  "public-changelog-list",
  () => queryCollection("changelog").order("releasedAt", "DESC").all(),
  { default: () => [] },
);

useSeoMeta({
  title: "版本更新 · 躲避堡垒 3",
  description: "查看已发布的平台内容与规则变化。",
});

const changelogVersions = computed(() => entries.value.map((entry) => ({
  title: entry.title,
  description: entry.description,
  date: entry.releasedAt,
  badge: `版本 ${entry.version}`,
  to: entry.path,
  class: "pressable-soft",
})));
</script>

<template>
  <main class="editorial-page page-shell">
    <section class="page-intro" aria-labelledby="changelog-title">
      <h1 id="changelog-title" class="page-title">版本更新</h1>
    </section>

    <section class="editorial-directory surface-card" aria-label="版本更新列表">
      <div v-if="status === 'pending'" class="editorial-loading" role="status">读取中…</div>
      <UAlert v-else-if="error" color="error" variant="subtle" role="alert" title="无法读取版本更新" description="内容暂时不可用，请稍后重试。">
        <template #actions>
          <UButton label="重试" color="neutral" variant="outline" @click="refresh()" />
        </template>
      </UAlert>
      <UEmpty v-else-if="!changelogVersions.length" title="暂无版本更新" variant="naked" />
      <UChangelogVersions v-else :versions="changelogVersions" :indicator-motion="false" class="editorial-changelog-list" />
    </section>
  </main>
</template>

<style scoped>
.editorial-page { padding-block: clamp(64px, 9vh, 104px) 4.5rem; }
.page-intro { max-width: 690px; margin-bottom: 2rem; }
.editorial-directory { min-width: 0; padding: clamp(20px, 4vw, 36px); }
.editorial-loading { min-height: 170px; display: grid; place-items: center; color: var(--muted); }
.editorial-changelog-list :deep(article) { min-width: 0; }
@media (max-width: 620px) { .editorial-page { padding-block: 3rem; }.page-intro { margin-bottom: 1.25rem; }.editorial-directory { padding: 1rem; } }
</style>
