<script setup lang="ts">
type TargetMap = { mapId: string; mapName: string };
type CreatePayload = {
  contractVersion: "1";
  titleKey: string;
  titleName: string;
  icon: string;
  category: string;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  scope: "global" | "map";
  mapIds: string[];
  mapVariant?: "classic";
  status: "scheduled" | "active" | "sunsetting" | "retired";
  gameVersion: string;
  categoryOverride: string | null;
  iconUrl: string | null;
  startsAt?: number;
  endsAt?: number;
  retiredVersion?: string;
};

const props = defineProps<{ open: boolean; maps: TargetMap[]; saving: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean]; submit: [payload: CreatePayload, iconFile: File | null] }>();
const dialogOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open),
});
const iconFile = shallowRef<File | null>(null);
const form = reactive({
  titleKey: "",
  titleName: "",
  icon: "trophy",
  category: "",
  condition: "",
  evidenceRule: "上传包含结算画面、称号条件与玩家信息的完整截图。",
  submissionMode: "manual" as "manual" | "automatic",
  scope: "global" as "global" | "map",
  mapIds: [] as string[],
  mapVariant: undefined as "classic" | undefined,
  status: "active" as "scheduled" | "active" | "sunsetting" | "retired",
  gameVersion: "",
  categoryOverride: "",
  iconUrl: "",
  startsAt: null as number | null,
  endsAt: null as number | null,
  retiredVersion: "",
});

const mapItems = computed(() => props.maps.map((map) => ({ label: map.mapName, value: map.mapId })));
const canSubmit = computed(() => Boolean(form.titleKey.trim() && form.titleName.trim() && form.category.trim() && form.condition.trim() && form.evidenceRule.trim() && form.gameVersion.trim() && (form.status !== "scheduled" || (form.startsAt && form.endsAt)) && (form.status !== "sunsetting" || form.retiredVersion.trim())));
const setScheduleTime = (field: "startsAt" | "endsAt", value: number | null) => { form[field] = value; };

function submit() {
  if (!canSubmit.value) return;
  emit("submit", {
    contractVersion: "1",
    titleKey: form.titleKey.trim(),
    titleName: form.titleName.trim(),
    icon: form.icon.trim(),
    category: form.category.trim(),
    condition: form.condition.trim(),
    evidenceRule: form.evidenceRule.trim(),
    submissionMode: form.submissionMode,
    scope: form.scope,
    mapIds: form.scope === "map" ? [...form.mapIds] : [],
    ...(form.scope === "map" && form.mapVariant ? { mapVariant: form.mapVariant } : {}),
    status: form.status,
    gameVersion: form.gameVersion.trim(),
    categoryOverride: form.categoryOverride.trim() || null,
    iconUrl: form.iconUrl.trim() || null,
    ...(form.status === "scheduled" && form.startsAt ? { startsAt: form.startsAt } : {}),
    ...(form.status === "scheduled" && form.endsAt ? { endsAt: form.endsAt } : {}),
    ...(form.status === "sunsetting" && form.retiredVersion.trim() ? { retiredVersion: form.retiredVersion.trim() } : {}),
  }, iconFile.value);
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="dialogOpen" title="新建成就挑战" size="lg">
    <template #body>
      <form id="achievement-create-form" class="editor" @submit.prevent="submit">
        <UFormField class="editor-field" label="唯一 key" required><UInput v-model="form.titleKey" class="editor-control" placeholder="例如 CLASSIC_RACETRACK" :disabled="props.saving" required /></UFormField>
        <UFormField class="editor-field" label="称号名称" required><UInput v-model="form.titleName" class="editor-control" :disabled="props.saving" required /></UFormField>
        <UFormField class="editor-field" label="图标" required><UInput v-model="form.icon" class="editor-control" placeholder="trophy" :disabled="props.saving" required /></UFormField>
        <UFormField class="editor-field" label="系列" required><UInput v-model="form.category" class="editor-control" :disabled="props.saving" required /></UFormField>
        <UFormField class="editor-field editor-field--wide" label="完成条件" required><UTextarea v-model="form.condition" class="editor-control" :disabled="props.saving" required maxlength="1024" /></UFormField>
        <UFormField class="editor-field editor-field--wide" label="截图规则" required><UTextarea v-model="form.evidenceRule" class="editor-control" :disabled="props.saving" required maxlength="2048" /></UFormField>
        <UFormField class="editor-field" label="提交方式"><USelect v-model="form.submissionMode" class="editor-control" :disabled="props.saving" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" /></UFormField>
        <UFormField class="editor-field" label="称号适用范围"><USelect v-model="form.scope" class="editor-control" :disabled="props.saving" :items="[{ label: '全部地图', value: 'global' }, { label: '指定地图', value: 'map' }]" /></UFormField>
        <template v-if="form.scope === 'map'">
          <UFormField class="editor-field editor-field--wide" label="指定地图" hint="留空作用于全部有效地图。"><USelect v-model="form.mapIds" class="editor-control" multiple :items="mapItems" :disabled="props.saving" /></UFormField>
          <UFormField class="editor-field" label="地图版本"><USelect v-model="form.mapVariant" class="editor-control" :items="[{ label: '正式版', value: undefined }, { label: '经典版', value: 'classic' }]" :disabled="props.saving" /></UFormField>
        </template>
        <UFormField class="editor-field" label="状态"><USelect v-model="form.status" class="editor-control" :disabled="props.saving" :items="[{ label: '已开放', value: 'active' }, { label: '未开放', value: 'scheduled' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" /></UFormField>
        <template v-if="form.status === 'scheduled'"><UFormField class="editor-field" label="开始时间"><AdminDateTimePicker class="editor-control" :model-value="form.startsAt" :disabled="props.saving" @update:model-value="setScheduleTime('startsAt', $event)" /></UFormField><UFormField class="editor-field" label="结束时间"><AdminDateTimePicker class="editor-control" :model-value="form.endsAt" :disabled="props.saving" @update:model-value="setScheduleTime('endsAt', $event)" /></UFormField></template>
        <UFormField v-if="form.status === 'sunsetting'" class="editor-field" label="计划下线版本" required><UInput v-model="form.retiredVersion" class="editor-control" placeholder="例如 26.0801.1" :disabled="props.saving" required /></UFormField>
        <UFormField class="editor-field" label="游戏版本" required><UInput v-model="form.gameVersion" class="editor-control" placeholder="例如 26.0728.1" :disabled="props.saving" required /></UFormField>
        <UFormField class="editor-field" label="展示分类"><UInput v-model="form.categoryOverride" class="editor-control" placeholder="留空使用系列" :disabled="props.saving" /></UFormField>
        <UFormField class="editor-field editor-field--wide" label="自定义图标" hint="留空使用默认图标。">
          <div class="icon-upload">
            <div v-if="form.iconUrl" class="icon-preview"><img :src="form.iconUrl" alt="当前成就图标" /></div>
            <UInput v-model="form.iconUrl" class="editor-control" type="url" placeholder="https://cdn.example.com/icon.webp" maxlength="2048" :disabled="props.saving" />
            <details class="icon-upload-option">
              <summary>上传图标</summary>
              <div class="icon-upload-content">
                <p>PNG、JPG 或 WebP，创建挑战后上传，最大 512 KB。</p>
                <UFileUpload v-model="iconFile" accept="image/png,image/jpeg,image/webp" :multiple="false" label="选择图标文件" :disabled="props.saving" />
              </div>
            </details>
          </div>
        </UFormField>
      </form>
    </template>
    <template #footer><UButton label="取消" color="neutral" variant="outline" size="sm" :disabled="props.saving" @click="dialogOpen = false" /><UButton label="创建挑战" type="submit" form="achievement-create-form" size="sm" :loading="props.saving" :disabled="!canSubmit" /></template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  padding: 24px;
}

.editor-field,
.editor-control {
  width: 100%;
}

.editor :deep(textarea) {
  min-height: 104px;
}

.icon-upload {
  display: grid;
  gap: 10px;
}

.icon-upload-option {
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: .82rem;
}

.icon-upload-option summary {
  padding-top: 10px;
  cursor: pointer;
}

.icon-upload-content {
  display: grid;
  gap: 10px;
  padding-top: 10px;
}

.icon-upload-content p {
  margin: 0;
  color: var(--quiet);
  font-size: .78rem;
}

.icon-preview {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-raised);
}

.icon-preview img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.editor-field--wide {
  grid-column: 1 / -1;
}

@media (max-width: 560px) {
  .editor {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    padding: 20px 16px;
  }

  .editor-field--wide {
    grid-column: auto;
  }
}
</style>
