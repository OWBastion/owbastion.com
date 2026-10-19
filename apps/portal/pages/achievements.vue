<script setup lang="ts">
import type { PublicAchievement } from "~/components/AchievementCatalog.vue";
import type { OwnedTitle } from "~/types/title";
import { portalErrorDetails } from "~/utils/portal-error";

useSeoMeta({ title: "成就 · 躲避堡垒 3", description: "查看已发布的成就挑战与完成条件。" });

const { data: catalog, pending: loading, error: catalogError } = useAsyncData("public-achievement-directory", () => usePublicCatalog<{ items: PublicAchievement[] }>("achievements"), { lazy: true });
const challenges = computed(() => catalog.value?.items ?? []);
const { refresh: refreshPlayer } = useCurrentPlayer();
const { refresh: refreshTitles } = usePlayerTitles();
const titles = shallowRef<OwnedTitle[]>();
onMounted(async () => {
  try {
    if (await refreshPlayer()) titles.value = await refreshTitles();
  } catch { titles.value = undefined; }
});
const error = computed(() => catalogError.value ? portalErrorDetails(catalogError.value, "无法读取成就，请稍后重试。").description : "");
</script>

<template>
  <main class="achievements-page directory-page page-shell">
    <PageMasthead title="成就" />
    <LoadingReveal>
      <AchievementWallSkeleton v-if="loading" role="status" aria-label="读取中…" />
      <UAlert v-else-if="error" color="error" variant="subtle" title="无法读取成就" :description="error" />
      <section v-else class="achievement-directory" aria-label="成就列表">
        <AchievementCatalog :challenges="challenges" :titles="titles" />
      </section>
    </LoadingReveal>
  </main>
</template>

<style scoped>
.achievement-directory { container-type: inline-size; padding: 0; }
</style>
