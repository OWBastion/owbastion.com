<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";
import { titleTier, titleTierLabel } from "~/utils/title-tier";

const props = defineProps<{ title: OwnedTitle | null }>();
const open = defineModel<boolean>("open", { required: true });
const sweeping = ref(false);
watch(() => [open.value, props.title], () => { sweeping.value = open.value && props.title !== null; }, { immediate: true });
const markImage = computed(() => (props.title?.iconUrl ? { "--mark-image": `url("${props.title.iconUrl}")` } : undefined));
const formatDate = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
const facts = computed(() => {
  const title = props.title;
  if (!title) return [];
  return [
    title.mapName ? { label: "地图", value: title.mapName } : null,
    title.category ? { label: "系列", value: title.category } : null,
    titleTierLabel[titleTier(title)] ? { label: "槽位", value: titleTierLabel[titleTier(title)] } : null,
    { label: "获得时间", value: formatDate(title.grantedAt) },
    title.condition ? { label: "获得条件", value: title.condition } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);
});
</script>

<template>
  <UModal v-model:open="open" :title="title?.label ?? '称号'" :description="title?.equipped ? '已佩戴' : '未佩戴'">
    <template #body>
      <div v-if="title" class="inspect">
        <span class="inspect__stage" :class="{ 'is-opening': sweeping }" :style="markImage" @animationend="sweeping = false"><PlayerTitleMark :title="title" /></span>
        <dl class="detail-grid inspect__facts">
          <div v-for="fact in facts" :key="fact.label" class="detail-grid__row"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
        </dl>
      </div>
    </template>
    <template #footer>
      <UButton to="/achievements" label="管理佩戴称号" color="neutral" variant="outline" />
      <UButton label="关闭" color="neutral" variant="ghost" @click="open = false" />
    </template>
  </UModal>
</template>

<style scoped>
.inspect { display: grid; gap: var(--space-5); justify-items: center; }
.inspect__stage { --mark-size: 10rem; --sweep: linear-gradient(135deg, transparent 38%, rgb(255 255 255 / .85) 50%, transparent 62%); position: relative; display: grid; max-width: 100%; }
.inspect__stage :deep(.title-mark) { border: 0; border-radius: 0; background: transparent; box-shadow: none; overflow: visible; }
.inspect__stage :deep(.title-mark__icon) { background-image: var(--sweep); background-size: 300% 300%; background-position: 100% 100%; }
.inspect__stage[style]::after { content: ""; position: absolute; inset: 0; pointer-events: none; background-image: var(--sweep); background-size: 300% 300%; background-position: 100% 100%; mask: var(--mark-image) center / contain no-repeat; }
.inspect__facts { width: 100%; }
@media (prefers-reduced-motion: no-preference) {
  .inspect__stage.is-opening :deep(.title-mark__icon), .inspect__stage.is-opening[style]::after { animation: inspect-sweep 1.2s ease-out; }
  .inspect__stage:hover :deep(.title-mark__icon), .inspect__stage[style]:hover::after { animation: inspect-sweep-hover 1.2s ease-out; }
}
/* Two identical keyframes: switching animation-name on hover is what restarts the sweep. */
@keyframes inspect-sweep { from { background-position: 100% 100%; } to { background-position: 0 0; } }
@keyframes inspect-sweep-hover { from { background-position: 100% 100%; } to { background-position: 0 0; } }
</style>
