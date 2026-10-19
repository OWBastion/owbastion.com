<script setup lang="ts">
import zhCN from "@nuxt/ui/runtime/locale/zh_cn.js";

const colorMode = useColorMode();

useHead({
  meta: [
    {
      name: "theme-color",
      content: computed(() => colorMode.value === "dark" ? "#0c1310" : "#f4f6f2"),
    },
  ],
});
</script>

<template>
  <UApp :locale="zhCN">
    <div class="app-root" data-vaul-drawer-wrapper>
      <NuxtLayout>
        <NuxtPage :page-key="(route) => route.path" />
      </NuxtLayout>
    </div>
  </UApp>
</template>

<style scoped>
.app-root {
  min-height: 100svh;
}
</style>
