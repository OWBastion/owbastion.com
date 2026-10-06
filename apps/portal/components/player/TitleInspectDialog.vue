<script setup lang="ts">
import type { OwnedTitle } from "~/types/title";
import { titleTier, titleTierLabel } from "~/utils/title-tier";

const props = defineProps<{ title: OwnedTitle | null }>();
const open = defineModel<boolean>("open", { required: true });
const { style, active, handlers } = useIconTilt(14);
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
        <span class="inspect__stage" :class="{ 'is-tilting': active }" :style="style" v-on="handlers"><PlayerTitleMark :title="title" /></span>
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
.inspect__stage { --mark-size: 7.5rem; position: relative; display: grid; border-radius: var(--radius-card); transform: perspective(40rem) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)); transition: transform .45s ease-out; }
.inspect__stage.is-tilting { transition: transform .08s linear; }
.inspect__stage::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 30%), color-mix(in oklch, var(--text) 24%, transparent), transparent 58%); opacity: 0; transition: opacity .2s ease-out; }
.inspect__stage.is-tilting::after { opacity: 1; }
.inspect__facts { width: 100%; }
</style>
