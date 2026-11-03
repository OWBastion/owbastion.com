<script setup lang="ts">
import type { FeaturedReviewCommentsResponse } from "@owbastion/contracts";

const api = usePortalApi();
// The section is decoration: a failed read hides it instead of breaking the home page.
const { data } = await useAsyncData("home-featured-reviews", () => api<FeaturedReviewCommentsResponse>("/v1/public/reviews/featured").catch(() => null), { default: () => null });
</script>

<template>
  <section v-if="data?.items.length" class="home-reviews" aria-label="玩家评价">
    <article v-for="item in data.items" :key="item.targetName + item.comment" class="home-review">
      <span class="home-review__stars num" :aria-label="`${item.rating} 分`">{{ "★".repeat(item.rating) }}<span aria-hidden="true">{{ "☆".repeat(5 - item.rating) }}</span></span>
      <p class="home-review__text">{{ item.comment }}</p>
      <h2 class="home-review__event">{{ item.targetName }}</h2>
    </article>
  </section>
</template>

<style scoped>
.home-reviews { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: var(--space-4); width: 100%; }
.home-review { display: grid; grid-template-rows: auto 1fr auto; gap: var(--space-3); padding: var(--space-4); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-card); }
.home-review__stars { color: var(--warning); letter-spacing: .1em; }
.home-review__text { display: -webkit-box; margin: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; font-size: .9375rem; }
.home-review__event { margin: 0; font-size: .9375rem; }
</style>
