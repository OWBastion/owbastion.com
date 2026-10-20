<!-- Loading stand-in for MapDirectory: toolbar, one rating group, 16:9 map tiles; keep the sizes in step with it and MapCard. -->
<template>
  <div class="map-skeleton" aria-hidden="true">
    <div class="map-skeleton__toolbar">
      <USkeleton class="map-skeleton__search" />
      <USkeleton class="map-skeleton__filter" />
    </div>
    <div class="map-skeleton__group">
      <USkeleton class="map-skeleton__heading" />
      <div class="map-skeleton__grid">
        <div v-for="index in 8" :key="index" class="map-skeleton__tile">
          <USkeleton class="map-skeleton__tier" />
          <USkeleton class="map-skeleton__name" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-skeleton { display: grid; gap: var(--space-6); }
.map-skeleton__toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.map-skeleton__search { width: min(100%, 24rem); height: 2.25rem; border-radius: var(--radius-control); }
.map-skeleton__filter { width: min(100%, 18rem); height: 2.625rem; border-radius: var(--radius-control); }
.map-skeleton__group { display: grid; gap: var(--space-3); }
.map-skeleton__heading { width: 8rem; height: .875rem; margin-bottom: var(--space-2); }
.map-skeleton__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, max(17rem, calc((100% - 3 * var(--space-4)) / 4))), 1fr)); gap: var(--space-4); }
.map-skeleton__tile { position: relative; aspect-ratio: 16 / 9; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.map-skeleton__tier { position: absolute; top: var(--space-3); right: var(--space-3); width: 2.5rem; height: 1.375rem; }
.map-skeleton__name { position: absolute; bottom: var(--space-3); left: var(--space-4); width: 40%; height: 1.25rem; }
</style>
