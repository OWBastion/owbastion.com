<script setup lang="ts">
import { formatProbability } from "~/utils/event-probabilities";
import type { EventPatch } from "~/utils/event-draft";
import type { EventFieldValues } from "./AdminEventFields.vue";

const props = defineProps<{
  mode: "edit" | "create";
  name: string;
  values: EventFieldValues | null;
  probability: number | null;
  savedProbability: number | null;
  changed: boolean;
  groups: string[]; categories: string[]; versions: string[]; tags: string[];
  creating: boolean;
}>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ patch: [patch: EventPatch]; create: []; archive: []; navigate: [delta: -1 | 1] }>();
const confirmArchive = shallowRef(false);
watch(open, (value) => { if (!value) confirmArchive.value = false; });
const drawsPerAppearance = computed(() => props.probability ? Math.max(1, Math.round(1 / props.probability)) : null);
</script>

<template>
  <USlideover v-model:open="open" side="right" :title="mode === 'create' ? '新建事件' : name" description="事件详情" :ui="{ content: 'max-w-md' }">
    <template #body>
      <div v-if="values" class="event-sheet">
        <section v-if="mode === 'edit'" class="event-sheet__probability" aria-live="polite">
          <span class="event-sheet__value num">{{ formatProbability(probability) }}</span>
          <span v-if="changed && savedProbability !== probability" class="event-sheet__saved num">已保存 {{ formatProbability(savedProbability) }}</span>
          <p class="text-sm text-muted">{{ drawsPerAppearance ? `平均每 ${drawsPerAppearance} 次事件抽取出现 1 次` : "不在候选池：只有已实装且版本未挂起的事件参与抽取" }}</p>
        </section>
        <AdminEventFields :values="values" :groups="groups" :categories="categories" :versions="versions" :tags="tags" @patch="emit('patch', $event)" />
      </div>
    </template>
    <template #footer>
      <div class="event-sheet__footer">
        <template v-if="mode === 'create'">
          <UButton label="创建事件" :loading="creating" @click="emit('create')" />
          <UButton label="取消" color="neutral" variant="ghost" @click="open = false" />
        </template>
        <template v-else>
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" square aria-label="上一条" @click="emit('navigate', -1)" />
          <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" square aria-label="下一条" @click="emit('navigate', 1)" />
          <span class="text-sm text-muted">{{ changed ? "改动已进入页面顶部的草稿，统一保存" : "没有修改" }}</span>
          <span class="event-sheet__spacer" />
          <UButton v-if="!confirmArchive" label="归档" color="error" variant="ghost" size="sm" @click="confirmArchive = true" />
          <UButton v-else label="确认归档" color="error" variant="soft" size="sm" @click="emit('archive')" />
          <UButton label="完成" color="neutral" variant="outline" size="sm" @click="open = false" />
        </template>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
.event-sheet { display: grid; gap: var(--space-4); min-width: 0; }
.event-sheet__probability { display: grid; gap: var(--space-1); padding: var(--space-3); border-radius: var(--radius-card); background: var(--accent-surface); }
.event-sheet__probability p { margin: 0; }
.event-sheet__value { color: var(--accent); font-size: var(--type-headline-size); font-weight: 700; line-height: 1.1; }
.event-sheet__saved { color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 600; }
.event-sheet__footer { display: flex; flex: 1; align-items: center; gap: var(--space-2); min-width: 0; }
.event-sheet__spacer { flex: 1; }
</style>
