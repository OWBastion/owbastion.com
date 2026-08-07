<script setup lang="ts">
import type { AdminAchievement, AdminMap, CatalogTitle, MapAchievement, TitleAchievement } from "./admin-achievement-types";
import { DEFAULT_EVIDENCE_RULE, isCatalog, isChallengeTitle, isDeveloperOnly, isMap, isTitle } from "./admin-achievement-types";

const props = defineProps<{
  open: boolean;
  item: AdminAchievement | null;
  maps: AdminMap[];
  saving: boolean;
  iconFile: File | null;
  iconUploading: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "update:iconFile": [file: File | null];
  save: [];
  cancel: [];
  "upload-icon": [];
}>();

const dialogOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open),
});

const title = computed(() => props.item && isCatalog(props.item) ? "编辑称号目录" : "编辑规则");
const description = computed(() => props.item ? (isTitle(props.item) ? props.item.titleName : props.item.name) : undefined);
const submitLabel = computed(() => props.item && isCatalog(props.item) ? "保存目录" : "保存规则");

const catalogStatusItems = (item: CatalogTitle) => isDeveloperOnly(item)
  ? [{ label: "开发保留", value: "active" }, { label: "已下线", value: "retired" }]
  : [{ label: "未开放", value: "scheduled" }, { label: "已开放", value: "active" }, { label: "即将结束", value: "sunsetting" }, { label: "已下线", value: "retired" }];

const statusItems = computed(() => {
  const item = props.item;
  if (!item) return [];
  if (isCatalog(item)) {
    return isDeveloperOnly(item)
      ? catalogStatusItems(item)
      : [{ label: "已开放", value: "active" }, { label: "已下线", value: "retired" }];
  }
  if (isMap(item)) return [{ label: "已开放", value: "active" }, { label: "即将结束", value: "sunsetting" }, { label: "已下线", value: "retired" }];
  return [{ label: "未开放", value: "scheduled" }, { label: "已开放", value: "active" }, { label: "即将结束", value: "sunsetting" }, { label: "已下线", value: "retired" }];
});

const catalogColorValue = (color: CatalogTitle["color"]) => color?.kind === "palette" ? color.name : "none";

function asTitle(item: AdminAchievement): TitleAchievement | CatalogTitle | null {
  return isTitle(item) ? item : null;
}
function asChallenge(item: AdminAchievement): TitleAchievement | null {
  return isChallengeTitle(item) ? item : null;
}
function asMap(item: AdminAchievement): MapAchievement | null {
  return isMap(item) ? item : null;
}
function asCatalog(item: AdminAchievement): CatalogTitle | null {
  return isCatalog(item) ? item : null;
}

function setEvidenceRule(value: string) {
  if (props.item && (isTitle(props.item) || isMap(props.item))) props.item.evidenceRule = value;
}
function setSubmissionMode(value: "manual" | "automatic") {
  if (props.item && (isTitle(props.item) || isMap(props.item))) props.item.submissionMode = value;
}
function setScope(value: "global" | "map") {
  if (props.item && isChallengeTitle(props.item)) props.item.scope = value;
}
function setMapIds(value: string[]) {
  if (props.item && isChallengeTitle(props.item)) props.item.mapIds = value;
}
function setMapVariant(value: "classic" | undefined) {
  if (props.item && isChallengeTitle(props.item)) props.item.mapVariant = value;
}
function setCatalogColor(value: string) {
  if (!props.item || !isCatalog(props.item)) return;
  props.item.color = value === "none" ? null : { kind: "palette", name: value as "orange" | "red" | "purple" | "gold" | "blue" };
}
function setIconUrl(value: string) {
  if (props.item && isTitle(props.item)) props.item.iconUrl = value || null;
}
function setCategoryOverride(value: string) {
  if (props.item && isTitle(props.item)) props.item.categoryOverride = value || null;
}
function setRetiredVersion(value: string) {
  if (props.item && (isTitle(props.item) || isMap(props.item))) props.item.retiredVersion = value || null;
}
function setScheduleTime(field: "startsAt" | "endsAt", value: number | null) {
  if (props.item && isTitle(props.item)) props.item[field] = value;
}
function onIconFile(value: File | null | undefined) {
  emit("update:iconFile", value ?? null);
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="dialogOpen" :title="title" :description="description" size="lg">
    <template #body>
      <form v-if="item" id="achievement-editor" class="editor" @submit.prevent="emit('save')">
        <template v-if="asCatalog(item)">
          <UFormField class="editor-field" label="称号标签" required>
            <UInput class="editor-control" v-model="asCatalog(item)!.titleName" required maxlength="256" :disabled="saving" />
          </UFormField>
          <UFormField class="editor-field" label="图标键" required>
            <UInput class="editor-control" v-model="asCatalog(item)!.icon" required maxlength="64" :disabled="saving" />
          </UFormField>
          <UFormField class="editor-field" label="称号系列" required>
            <UInput class="editor-control" v-model="asCatalog(item)!.category" required maxlength="128" :disabled="saving" />
          </UFormField>
          <UFormField class="editor-field" label="称号范围">
            <USelect class="editor-control" v-model="asCatalog(item)!.scope" :items="[{ label: '全局称号', value: 'global' }, { label: '地图称号', value: 'map' }]" :disabled="saving" />
          </UFormField>
          <UFormField class="editor-field" label="展示方式">
            <USelect class="editor-control" v-model="asCatalog(item)!.displayKind" :items="[{ label: '固定称号', value: 'fixed' }, { label: '地图名 + 开拓者', value: 'map_pioneer' }, { label: '地图名 + 后缀称号', value: 'map_name_suffix' }]" :disabled="saving" />
          </UFormField>
          <UFormField class="editor-field" label="颜色">
            <USelect class="editor-control" :model-value="catalogColorValue(asCatalog(item)!.color)" :items="[{ label: '未设置', value: 'none' }, { label: '橙色', value: 'orange' }, { label: '红色', value: 'red' }, { label: '紫色', value: 'purple' }, { label: '金色', value: 'gold' }, { label: '蓝色', value: 'blue' }]" :disabled="saving" @update:model-value="setCatalogColor" />
          </UFormField>
        </template>

        <UFormField v-if="asMap(item)" class="editor-field" label="挑战名称" required>
          <UInput class="editor-control" v-model="asMap(item)!.name" required maxlength="256" :disabled="saving" />
        </UFormField>
        <UFormField v-if="asMap(item)" class="editor-field" label="难度">
          <UInput class="editor-control" v-model="asMap(item)!.difficulty" maxlength="64" :disabled="saving" />
        </UFormField>

        <template v-if="!asCatalog(item)">
          <UFormField class="editor-field editor-field--wide" label="完成条件" required>
            <UTextarea class="editor-control" v-model="(item as TitleAchievement | MapAchievement).condition" required maxlength="1024" :disabled="saving" />
          </UFormField>
          <UFormField class="editor-field editor-field--wide" label="截图规则" required>
            <UTextarea class="editor-control" :model-value="(item as TitleAchievement | MapAchievement).evidenceRule ?? DEFAULT_EVIDENCE_RULE" required maxlength="2048" :disabled="saving" @update:model-value="setEvidenceRule" />
          </UFormField>
          <UFormField class="editor-field" label="提交方式">
            <USelect class="editor-control" :model-value="(item as TitleAchievement | MapAchievement).submissionMode ?? 'manual'" :disabled="saving" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :ui="{ base: 'w-full' }" @update:model-value="setSubmissionMode($event as 'manual' | 'automatic')" />
          </UFormField>
        </template>

        <UFormField class="editor-field" label="状态">
          <USelect class="editor-control" v-model="item.status" :disabled="saving" :items="statusItems" :ui="{ base: 'w-full' }" />
        </UFormField>

        <template v-if="asChallenge(item)">
          <UFormField class="editor-field" label="称号适用范围">
            <USelect class="editor-control" :model-value="asChallenge(item)!.scope ?? 'global'" :disabled="saving" :items="[{ label: '全部地图', value: 'global' }, { label: '指定地图', value: 'map' }]" @update:model-value="setScope($event as 'global' | 'map')" />
          </UFormField>
          <UFormField v-if="asChallenge(item)!.scope === 'map'" class="editor-field editor-field--wide" label="指定地图">
            <USelect class="editor-control" :model-value="asChallenge(item)!.mapIds ?? []" multiple :items="[{ label: '全部有效地图', value: '' }, ...maps.map((map) => ({ label: map.mapName, value: map.mapId }))]" :disabled="saving" @update:model-value="setMapIds(($event as string[]).filter(Boolean))" />
          </UFormField>
          <UFormField v-if="asChallenge(item)!.scope === 'map'" class="editor-field" label="地图版本">
            <USelect class="editor-control" :model-value="asChallenge(item)!.mapVariant" :items="[{ label: '正式版', value: undefined }, { label: '经典版', value: 'classic' }]" :disabled="saving" @update:model-value="setMapVariant($event as 'classic' | undefined)" />
          </UFormField>
        </template>

        <template v-if="asTitle(item) && !asCatalog(item)">
          <UFormField class="editor-field" label="开始时间">
            <AdminDateTimePicker class="editor-control" :model-value="asTitle(item)!.startsAt" :disabled="saving" placeholder="选择开始时间" @update:model-value="setScheduleTime('startsAt', $event)" />
          </UFormField>
          <UFormField class="editor-field" label="结束时间">
            <AdminDateTimePicker class="editor-control" :model-value="asTitle(item)!.endsAt" :disabled="saving" placeholder="选择结束时间" @update:model-value="setScheduleTime('endsAt', $event)" />
          </UFormField>
        </template>

        <UFormField v-if="!asCatalog(item)" class="editor-field" label="计划下线版本">
          <UInput class="editor-control" :model-value="(item as TitleAchievement | MapAchievement).retiredVersion ?? ''" placeholder="例如 26.0713.1" :disabled="saving" @update:model-value="setRetiredVersion" />
        </UFormField>

        <template v-if="asTitle(item) && !asCatalog(item)">
          <UFormField class="editor-field editor-field--wide" label="自定义图标" hint="留空使用默认图标。">
            <div class="icon-upload">
              <div v-if="asTitle(item)!.iconUrl" class="icon-preview">
                <img :src="asTitle(item)!.iconUrl!" alt="当前成就图标" />
              </div>
              <UInput class="editor-control" type="url" :model-value="asTitle(item)!.iconUrl ?? ''" placeholder="https://cdn.example.com/icon.webp" maxlength="2048" :disabled="saving" @update:model-value="setIconUrl" />
              <details class="icon-upload-option">
                <summary>上传图标</summary>
                <div class="icon-upload-content">
                  <p>PNG、JPG 或 WebP，最大 512 KB。</p>
                  <UFileUpload :model-value="iconFile" accept="image/png,image/jpeg,image/webp" :multiple="false" label="选择图标文件" :disabled="iconUploading || saving" @update:model-value="onIconFile" />
                  <UButton type="button" label="上传图标" color="neutral" variant="outline" :loading="iconUploading" :disabled="!iconFile || saving" @click="emit('upload-icon')" />
                </div>
              </details>
            </div>
          </UFormField>
          <UFormField class="editor-field" label="展示分类" :hint="`留空则使用 Bastion 系列“${asTitle(item)!.category}”`">
            <UInput class="editor-control" :model-value="asTitle(item)!.categoryOverride ?? ''" :disabled="saving" :placeholder="asTitle(item)!.category" maxlength="128" @update:model-value="setCategoryOverride" />
          </UFormField>
        </template>
      </form>
    </template>
    <template #footer>
      <UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="emit('cancel')" />
      <UButton :label="submitLabel" form="achievement-editor" :loading="saving" type="submit" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  padding: 8px 0 4px;
}
.editor-field, .editor-control { width: 100%; min-width: 0; }
.editor :deep(textarea) { min-height: 104px; }
.editor-field--wide { grid-column: 1 / -1; }
.icon-upload { display: grid; gap: 10px; }
.icon-upload-option { border-top: 1px solid var(--line); color: var(--muted); font-size: var(--type-caption-size); }
.icon-upload-option summary { padding-top: 10px; cursor: pointer; }
.icon-upload-content { display: grid; gap: 10px; padding-top: 10px; }
.icon-upload-content p { margin: 0; color: var(--quiet); font-size: var(--type-caption-size); }
.icon-preview {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-raised);
}
.icon-preview img { width: 42px; height: 42px; object-fit: contain; }
@media (max-width: 560px) {
  .editor { grid-template-columns: minmax(0, 1fr); }
  .editor-field--wide { grid-column: auto; }
}
</style>
