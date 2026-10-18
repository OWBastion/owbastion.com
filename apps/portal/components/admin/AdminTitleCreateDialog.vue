<script setup lang="ts">
import type { AdminTitleSummary } from "./admin-title-types";

const props = defineProps<{
  open: boolean;
  mode: "create" | "edit";
  title: AdminTitleSummary | null;
  categories: string[];
  existingTitles: Array<{ titleKey: string; label: string }>;
  saving: boolean;
  errorMessage: string;
  keyConflict: string | null;
}>();
const emit = defineEmits<{
  "update:open": [open: boolean];
  create: [payload: Record<string, unknown>, iconFile: File | null, intent: "only" | "with_challenge"];
  save: [payload: Record<string, unknown>, iconFile: File | null];
}>();

const dialogOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open),
});

const iconFile = shallowRef<File | null>(null);
const form = reactive({
  label: "",
  category: "",
  scope: "global" as "global" | "map",
  displayKind: "fixed" as AdminTitleSummary["displayKind"],
  colorChoice: "none" as string,
  icon: "trophy",
  publicVisibility: true,
  titleKey: "",
  gameVersion: "",
});
const moreSettings = useTemplateRef<HTMLDetailsElement>("moreSettings");

watch(() => props.open, (open) => {
  if (!open) return;
  iconFile.value = null;
  const title = props.title;
  Object.assign(form, title ? {
    label: title.label,
    category: title.category,
    scope: title.scope,
    displayKind: title.displayKind,
    colorChoice: title.color?.kind === "palette" ? title.color.name : "none",
    icon: title.icon,
    publicVisibility: title.publicVisibility,
    titleKey: title.titleKey,
    gameVersion: title.gameVersion ?? "",
  } : {
    label: "", category: "", scope: "global", displayKind: "fixed",
    colorChoice: "none", icon: "trophy", publicVisibility: true, titleKey: "", gameVersion: "",
  });
});

// The key-conflict error field lives inside 更多设置; reveal it automatically.
watch(() => props.keyConflict, (conflict) => {
  if (conflict !== null && moreSettings.value) moreSettings.value.open = true;
});

const conflictingLabel = computed(() => props.keyConflict ? props.existingTitles.find((title) => title.titleKey === props.keyConflict)?.label ?? props.keyConflict : null);
const canSubmit = computed(() => Boolean(form.label.trim() && form.category.trim()));
const scopeHint = computed(() => form.scope === "map" ? "只在指定地图获得和佩戴。" : "玩家在任意地图都能获得和佩戴。");
const dialogTitle = computed(() => props.mode === "edit" ? "编辑称号" : "新建称号");

function colorPayload() {
  return form.colorChoice === "none" ? null : { kind: "palette" as const, name: form.colorChoice as "orange" | "red" | "purple" | "gold" | "blue" };
}

function submitCreate(intent: "only" | "with_challenge") {
  if (!canSubmit.value) return;
  emit("create", {
    contractVersion: "1",
    ...(form.titleKey.trim() ? { titleKey: form.titleKey.trim() } : {}),
    label: form.label.trim(),
    category: form.category.trim(),
    scope: form.scope,
    displayKind: form.displayKind,
    color: colorPayload(),
    icon: form.icon.trim() || "trophy",
    publicVisibility: form.publicVisibility,
    ...(form.gameVersion.trim() ? { gameVersion: form.gameVersion.trim() } : {}),
  }, iconFile.value, intent);
}

function submitEdit() {
  if (!canSubmit.value) return;
  emit("save", {
    contractVersion: "1",
    label: form.label.trim(),
    category: form.category.trim(),
    scope: form.scope,
    displayKind: form.displayKind,
    color: colorPayload(),
    icon: form.icon.trim() || "trophy",
    publicVisibility: form.publicVisibility,
    gameVersion: form.gameVersion.trim() || null,
  }, iconFile.value);
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="dialogOpen" :title="dialogTitle" :description="mode === 'create' ? '新称号先存为草稿，添加并开放挑战时一起启用。' : undefined" size="lg">
    <template #body>
      <form id="admin-title-form" class="title-dialog-form" @submit.prevent="mode === 'edit' ? submitEdit() : submitCreate('only')">
        <UAlert v-if="errorMessage" class="title-dialog-form__wide" color="error" variant="subtle" :title="mode === 'create' ? '无法创建称号' : '无法保存称号'" :description="errorMessage" />
        <UFormField class="title-dialog-form__wide" label="称号名称" required>
          <UInput v-model="form.label" required maxlength="256" :disabled="saving" />
        </UFormField>
        <UFormField label="系列" required help="选择已有系列，或输入新的。">
          <UInput v-model="form.category" list="admin-title-category-options" placeholder="选择或输入" :disabled="saving" />
          <datalist id="admin-title-category-options"><option v-for="category in categories" :key="category" :value="category" /></datalist>
        </UFormField>
        <UFormField label="称号范围" :help="scopeHint">
          <USelect v-model="form.scope" :items="[{ label: '全局称号', value: 'global' }, { label: '地图称号', value: 'map' }]" :disabled="saving" />
        </UFormField>
        <UFormField label="展示方式">
          <USelect v-model="form.displayKind" :items="[{ label: '固定称号', value: 'fixed' }, { label: '地图名 + 开拓者', value: 'map_pioneer' }, { label: '地图名 + 后缀称号', value: 'map_name_suffix' }]" :disabled="saving" />
        </UFormField>
        <UFormField label="颜色">
          <USelect v-model="form.colorChoice" :items="[{ label: '未设置', value: 'none' }, { label: '橙色', value: 'orange' }, { label: '红色', value: 'red' }, { label: '紫色', value: 'purple' }, { label: '金色', value: 'gold' }, { label: '蓝色', value: 'blue' }]" :disabled="saving" />
        </UFormField>
        <UFormField label="图标" help="也可以在下方上传自定义图标。">
          <UInput v-model="form.icon" placeholder="trophy" maxlength="64" :disabled="saving" />
        </UFormField>
        <UFormField label="自定义图标" help="PNG、JPEG 或 WebP，留空使用默认图标。">
          <div class="title-icon-upload">
            <div v-if="title?.iconUrl" class="title-icon-preview"><img :src="title.iconUrl" alt="当前称号图标" /></div>
            <UFileUpload v-model="iconFile" accept="image/png,image/jpeg,image/webp" :multiple="false" label="选择文件" :disabled="saving" />
          </div>
        </UFormField>
        <UFormField class="title-dialog-form__wide">
          <UCheckbox v-model="form.publicVisibility" label="公开显示" :disabled="saving" />
          <template #help>关闭后不出现在公开成就页，不影响获取。</template>
        </UFormField>
        <details ref="moreSettings" class="title-dialog-form__wide more-settings">
          <summary>更多设置</summary>
          <div class="more-settings-body">
            <UFormField v-if="mode === 'create'" label="唯一 key" help="留空自动生成，创建后不能修改。" :error="keyConflict !== null ? `已被「${conflictingLabel}」使用` : undefined">
              <UInput v-model="form.titleKey" placeholder="例如 LIGHT_LOADOUT" :disabled="saving" :aria-invalid="keyConflict !== null || undefined" />
            </UFormField>
            <UFormField label="游戏版本" help="留空使用最新版本。">
              <UInput v-model="form.gameVersion" placeholder="例如 26.1003.1" :disabled="saving" />
            </UFormField>
          </div>
        </details>
      </form>
    </template>
    <template #footer>
      <UButton label="取消" color="neutral" variant="ghost" :disabled="saving" @click="dialogOpen = false" />
      <template v-if="mode === 'create'">
        <UButton label="仅创建称号" color="neutral" variant="outline" :disabled="!canSubmit || saving" @click="submitCreate('only')" />
        <UButton label="创建并添加挑战" :loading="saving" :disabled="!canSubmit" @click="submitCreate('with_challenge')" />
      </template>
      <UButton v-else label="保存" type="submit" form="admin-title-form" :loading="saving" :disabled="!canSubmit" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.title-dialog-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: var(--space-5); padding: var(--space-6); }
.title-dialog-form__wide { grid-column: 1 / -1; }
.more-settings { border-top: 1px solid var(--line); color: var(--muted); }
.more-settings summary { padding: var(--space-3) 0; cursor: pointer; }
.more-settings-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: var(--space-5); padding-top: var(--space-2); }
.title-icon-upload { display: grid; gap: var(--space-2); }
.title-icon-preview img { display: block; max-height: 3rem; border-radius: var(--radius-control); }
@container (max-width: 36rem) {
  .title-dialog-form { grid-template-columns: 1fr; }
  .more-settings-body { grid-template-columns: 1fr; }
}
</style>
