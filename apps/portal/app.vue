<script setup lang="ts">
const colorMode = useColorMode();

useHead({
  meta: [
    {
      name: "theme-color",
      content: computed(() => colorMode.value === "dark" ? "#151a1b" : "#f5f4ef"),
    },
  ],
});
</script>

<template>
  <UApp>
    <div class="app-root" data-vaul-drawer-wrapper>
      <NuxtLayout>
        <NuxtPage :page-key="(route) => route.fullPath" />
      </NuxtLayout>
    </div>
  </UApp>
</template>

<style scoped>
.app-root {
  min-height: 100svh;
}
</style>
