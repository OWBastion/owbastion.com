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
