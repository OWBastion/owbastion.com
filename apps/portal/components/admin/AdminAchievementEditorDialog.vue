<script setup lang="ts">
import type { MapAchievement } from "./admin-achievement-types";

const props = defineProps<{
  open: boolean;
  item: MapAchievement | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  save: [];
  cancel: [];
}>();

const dialogOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open),
});

const statusItems = [{ label: "草稿", value: "draft" }, { label: "已开放", value: "active" }, { label: "已下线", value: "archived" }];

function setRetiredVersion(value: string) {
  if (props.item) props.item.retiredVersion = value || null;
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="dialogOpen" title="编辑规则" :description="item?.name" size="lg">
    <template #body>
      <form v-if="item" id="achievement-editor" class="admin-achievement-editor admin-achievement-editor--edit" @submit.prevent="emit('save')">
        <UFormField class="editor-field" label="挑战名称" required>
          <UInput class="editor-control" v-model="item.name" required maxlength="256" :disabled="saving" />
        </UFormField>
        <UFormField class="editor-field" label="难度">
          <UInput class="editor-control" v-model="item.difficulty" maxlength="64" :disabled="saving" />
        </UFormField>
        <UFormField class="editor-field editor-field--wide" label="完成条件" required>
          <UTextarea class="editor-control" v-model="item.condition" required maxlength="1024" :disabled="saving" />
        </UFormField>
        <UFormField class="editor-field editor-field--wide" label="截图规则" required>
          <UTextarea class="editor-control" v-model="item.evidenceRule" required maxlength="2048" :disabled="saving" />
        </UFormField>
        <UFormField class="editor-field" label="提交方式">
          <USelect class="editor-control" v-model="item.submissionMode" :disabled="saving" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :ui="{ base: 'w-full' }" />
        </UFormField>
        <UFormField class="editor-field" label="状态">
          <USelect class="editor-control" v-model="item.status" :disabled="saving" :items="statusItems" :ui="{ base: 'w-full' }" />
        </UFormField>
        <UFormField v-if="item.status === 'active'" class="editor-field" label="计划下线版本" help="已开放挑战宣布下线版本后展示为即将结束。">
          <UInput class="editor-control" :model-value="item.retiredVersion ?? ''" placeholder="例如 26.0713.1" :disabled="saving" @update:model-value="setRetiredVersion" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <UButton label="保存规则" form="achievement-editor" :loading="saving" type="submit" />
      <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="emit('cancel')" />
    </template>
  </AdminResponsiveDialog>
</template>
