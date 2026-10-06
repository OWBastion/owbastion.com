<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";
import { titleTier } from "~/utils/title-tier";

const props = defineProps<{ title: Pick<OwnedTitle, "icon" | "iconUrl" | "slot"> }>();
const tier = computed(() => titleTier(props.title));
</script>

<template>
  <span class="title-mark" :class="`tier-${tier}`" :data-has-image="title.iconUrl ? 'true' : undefined" aria-hidden="true">
    <img v-if="title.iconUrl" :src="title.iconUrl" alt="" loading="lazy" />
    <UIcon v-else :name="`i-lucide-${title.icon}`" class="title-mark__icon" />
  </span>
</template>

<style scoped>
.title-mark { display: grid; flex: 0 0 auto; width: var(--mark-size, 2.75rem); height: var(--mark-size, 2.75rem); place-items: center; overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-control); color: var(--muted); background: var(--surface-raised); }
.title-mark img { width: 100%; height: 100%; object-fit: contain; }
.title-mark__icon { width: 52%; height: 52%; }
.tier-pioneer { border-color: color-mix(in oklch, var(--accent) 32%, var(--line-strong)); color: var(--accent); background: color-mix(in oklch, var(--accent) 7%, var(--surface-raised)); }
.tier-conqueror { border-color: color-mix(in oklch, var(--accent) 58%, var(--line-strong)); color: var(--accent); background: color-mix(in oklch, var(--accent) 14%, var(--surface-raised)); }
.tier-dominator { border-color: var(--accent); color: var(--accent); background: color-mix(in oklch, var(--accent) 24%, var(--surface-raised)); box-shadow: 0 0 1.25rem color-mix(in oklch, var(--accent) 34%, transparent); }
.title-mark[data-has-image="true"] { background: transparent; }
@media (prefers-contrast: more) { .title-mark { border-color: var(--text); } }
</style>
