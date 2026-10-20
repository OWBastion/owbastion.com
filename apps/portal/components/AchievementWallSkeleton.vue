<!-- Loading stand-in for AchievementWall + AchievementShelf + AchievementTile; keep the sizes in step with them. -->
<template>
  <AchievementWall aria-hidden="true">
    <section v-for="(medals, shelf) in [3, 3, 2]" :key="shelf" class="shelf">
      <USkeleton class="shelf__title" />
      <ul class="shelf__row">
        <li v-for="medal in medals" :key="medal" class="medal">
          <USkeleton class="medal__icon" />
          <USkeleton class="medal__name" />
        </li>
      </ul>
    </section>
  </AchievementWall>
</template>

<style scoped>
.shelf { display: grid; gap: var(--space-2); padding-block: var(--space-6) 0; }
.shelf__title { width: 6rem; height: 1rem; }
.shelf__row { display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); margin: 0; padding: 0 0 var(--space-3); border-bottom: 2px solid var(--line); list-style: none; }
.medal { --achievement-icon-size: clamp(5.5rem, 24vw, 7rem); display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-1) var(--space-2); }
.medal__icon { width: var(--achievement-icon-size); height: var(--achievement-icon-size); border-radius: 30%; }
.medal__name { width: 3.5rem; height: .75rem; }
</style>
