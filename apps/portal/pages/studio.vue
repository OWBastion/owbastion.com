<script setup lang="ts">
const { state } = useStudioLoading();

definePageMeta({
  layout: "studio",
  middleware: ["auth", "studio-admin"],
});

useSeoMeta({ title: "内容编辑 · 躲避堡垒 3", robots: "noindex, nofollow" });
</script>

<template>
  <main
    class="studio-workspace"
    aria-label="内容编辑器"
    :aria-busy="state === 'loading'"
  >
    <section
      v-if="state === 'loading'"
      class="studio-loading"
      role="status"
      aria-live="polite"
      data-testid="studio-loading-status"
    >
      <div class="studio-loading__content">
        <span class="studio-loading__spinner" aria-hidden="true" />
        <p>内容编辑器加载中…</p>
      </div>
    </section>

    <section
      v-else-if="state === 'unavailable'"
      class="studio-loading studio-loading--unavailable"
      role="alert"
      data-testid="studio-unavailable-status"
    >
      <div class="studio-loading__content">
        <p>内容编辑器暂时无法载入。</p>
        <NuxtLink class="secondary-button hit-44 pressable" to="/admin">
          返回管理概览
        </NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.studio-workspace {
  min-height: 100dvh;
}

.studio-loading {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 2rem;
  color: var(--text);
  background: var(--surface);
}

.studio-loading__content {
  display: grid;
  max-width: 20rem;
  justify-items: center;
  gap: 1rem;
  text-align: center;
}

.studio-loading__content p {
  margin: 0;
  color: var(--muted);
  font-size: var(--type-body-size);
  line-height: var(--type-body-leading);
}

.studio-loading__spinner {
  width: 2.25rem;
  aspect-ratio: 1;
  border: 0.18rem solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: studio-loading-spin 0.85s linear infinite;
}

@keyframes studio-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .studio-loading__spinner {
    animation: none;
  }
}

@media (prefers-contrast: more) {
  .studio-loading__spinner {
    border-color: var(--text);
    border-top-color: var(--text);
  }
}
</style>
