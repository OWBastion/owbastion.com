<!-- Loading stand-in for EventDirectory: search field plus compact rows; keep the sizes in step with it. -->
<template>
  <div class="event-skeleton" aria-hidden="true">
    <USkeleton class="event-skeleton__search" />
    <ul class="event-skeleton__list">
      <li v-for="index in 8" :key="index" class="event-skeleton__row">
        <USkeleton class="event-skeleton__rarity" />
        <span class="event-skeleton__main">
          <USkeleton class="event-skeleton__title" />
          <USkeleton class="event-skeleton__desc" />
        </span>
        <USkeleton class="event-skeleton__prob" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.event-skeleton { display: grid; gap: var(--space-5); }
.event-skeleton__search { width: min(100%, 13rem); height: 2.25rem; border-radius: var(--radius-control); }
.event-skeleton__list { display: grid; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); list-style: none; overflow: hidden; }
.event-skeleton__list > li + li { border-top: 1px solid var(--line); }
.event-skeleton__row { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) minmax(7rem, 10rem); align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-4); }
.event-skeleton__rarity { height: 2.75rem; border-radius: var(--radius-control); }
.event-skeleton__main { display: grid; gap: var(--space-2); }
.event-skeleton__title { width: min(100%, 9rem); height: 1rem; }
.event-skeleton__desc { width: min(100%, 28rem); height: .75rem; }
.event-skeleton__prob { height: .5rem; border-radius: var(--radius-pill); }
@media (max-width: 47.99rem) {
  .event-skeleton__row { grid-template-columns: 2.5rem minmax(0, 1fr); padding: var(--space-3); }
  .event-skeleton__rarity { height: 2.5rem; }
  .event-skeleton__prob { grid-column: 2; }
}
</style>
