<script setup lang="ts">
import type { PublicAchievement } from "~/components/AchievementCatalog.vue";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({ title: "成就 · 躲避堡垒 3", description: "查看已发布的成就挑战与完成条件。" });

const { data: catalog, pending: loading, error: catalogError } = await useAsyncData("public-achievement-directory", () => usePublicCatalog<{ items: PublicAchievement[] }>("achievements"));
const challenges = computed(() => catalog.value?.items ?? []);
const error = computed(() => catalogError.value ? portalErrorDetails(catalogError.value, "无法读取成就，请稍后重试。").description : "");
</script>

<template>
  <main class="achievements-page directory-page page-shell">
    <section class="page-intro" aria-labelledby="achievements-title"><h1 id="achievements-title" class="page-title">成就</h1></section>
    <section v-if="loading" class="achievement-directory surface-card" aria-label="读取中…" role="status">
      <div class="achievement-skeleton-groups" aria-hidden="true">
        <section v-for="group in 2" :key="group" class="achievement-skeleton-section">
          <div class="achievement-skeleton-heading"><USkeleton class="achievement-skeleton-heading-title" /><USkeleton class="achievement-skeleton-heading-count" /></div>
          <div class="achievement-skeleton-grid directory-grid">
            <article v-for="card in 4" :key="card" class="achievement-skeleton-card">
              <div class="achievement-skeleton-card-inner">
                <USkeleton class="achievement-skeleton-icon" />
                <div class="achievement-skeleton-copy"><USkeleton class="achievement-skeleton-title" /><USkeleton class="achievement-skeleton-condition" /><USkeleton class="achievement-skeleton-condition achievement-skeleton-condition-short" /></div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>
    <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取成就" :description="error" />
    <section v-else class="achievement-directory surface-card" aria-label="成就列表">
      <AchievementCatalog :challenges="challenges" />
    </section>
  </main>
</template>

<style scoped>
.page-intro { margin-bottom: var(--space-8); }
.achievement-directory { padding: clamp(var(--space-5), 4vw, var(--space-8)); }
.achievement-skeleton-groups, .achievement-skeleton-section { display: grid; gap: var(--space-4); }
.achievement-skeleton-section + .achievement-skeleton-section { margin-top: var(--space-8); }
.achievement-skeleton-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-4); }
.achievement-skeleton-heading-title { width: 28%; height: 30px; }
.achievement-skeleton-heading-count { width: 48px; height: 13px; }
/* container-type lives on each card (a grid cell) rather than the grid
   itself, since a fluid multi-column grid is much wider than any one card. */
.achievement-skeleton-card { container-type: inline-size; }
.achievement-skeleton-card-inner { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-content: start; gap: var(--space-4); min-height: 124px; padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.achievement-skeleton-icon { width: 58px; height: 58px; border-radius: var(--radius-card); }
.achievement-skeleton-copy { display: grid; align-content: start; gap: var(--space-2); min-width: 0; }
.achievement-skeleton-title { width: 72%; height: 20px; }
.achievement-skeleton-condition { width: 100%; height: 13px; }
.achievement-skeleton-condition-short { width: 76%; }
@media (max-width: 47.99rem) {
  .page-intro { margin-bottom: var(--space-5); }
  .achievement-directory { padding: var(--space-4); }
  .achievement-skeleton-heading { align-items: flex-start; flex-direction: column; gap: var(--space-2); }
  .achievement-skeleton-heading-title { width: 46%; }
}
@container (max-width: 23.99rem) {
  .achievement-skeleton-card-inner { min-height: 0; padding: var(--space-4); }
}
</style>
