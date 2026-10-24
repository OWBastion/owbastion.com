<script setup lang="ts">
import { useObjectUrl } from "@vueuse/core";
import type { AdminTitleColor, AdminTitleSummary } from "./admin-title-types";
import { TITLE_PALETTE_NAMES, titleColorBackground, titleColorLabel } from "./admin-title-types";

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

const ICON_CHOICES = [
  "trophy", "award", "medal", "crown", "star", "sparkles", "flame", "zap", "shield", "swords", "sword", "target",
  "crosshair", "skull", "ghost", "heart", "gem", "rocket", "flag", "map", "compass", "mountain", "timer", "clock",
  "bomb", "wrench", "hammer", "key", "eye", "feather", "anchor", "bird", "cat", "dog", "fish", "leaf",
  "moon", "sun", "snowflake", "gamepad-2", "puzzle", "flask-conical", "users", "user-round",
];

const iconFile = shallowRef<File | null>(null);
const iconPreviewUrl = useObjectUrl(iconFile);
const api = useAdminApi();
type CdnImage = { name: string; url: string };
const cdnPickerOpen = shallowRef(false);
const cdnImages = shallowRef<CdnImage[] | null>(null);
const cdnLoading = shallowRef(false);
const cdnError = shallowRef("");
const cdnQuery = shallowRef("");
// A same-named .png/.webp pair is one image; keep the WebP, which is what the CDN serves smaller.
const cdnChoices = computed(() => {
  const query = cdnQuery.value.trim().toLowerCase();
  const byStem = new Map<string, CdnImage>();
  for (const image of cdnImages.value ?? []) {
    if (!image.name.toLowerCase().includes(query)) continue;
    const stem = image.name.replace(/\.[^.]+$/, "");
    if (!byStem.has(stem) || image.name.endsWith(".webp")) byStem.set(stem, image);
  }
  return [...byStem.values()];
});
async function loadCdnImages() {
  cdnLoading.value = true;
  cdnError.value = "";
  try {
    cdnImages.value = (await api<{ items: CdnImage[] }>("/v1/title-images")).items;
  } catch {
    cdnError.value = "无法读取 CDN 图片，请稍后重试。";
  } finally {
    cdnLoading.value = false;
  }
}
watch(cdnPickerOpen, (open) => {
  if (!open) return;
  cdnQuery.value = "";
  if (cdnImages.value === null && !cdnLoading.value) void loadCdnImages();
});
function pickCdnImage(url: string) {
  iconFile.value = null;
  form.iconUrl = url;
  cdnPickerOpen.value = false;
}
const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const iconPickerOpen = shallowRef(false);
const form = reactive({
  label: "",
  category: "",
  scope: "global" as "global" | "map",
  displayKind: "fixed" as AdminTitleSummary["displayKind"],
  color: null as AdminTitleColor,
  icon: "trophy",
  iconUrl: "",
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
    color: title.color,
    icon: title.icon,
    iconUrl: title.iconUrl ?? "",
    publicVisibility: title.publicVisibility,
    titleKey: title.titleKey,
    gameVersion: title.gameVersion ?? "",
  } : {
    label: "", category: "", scope: "global", displayKind: "fixed",
    color: null, icon: "trophy", iconUrl: "", publicVisibility: true, titleKey: "", gameVersion: "",
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

// A title colored in-game by hero color or RGB cannot be built from the swatches; keep it selectable so saving does not erase it.
const legacyColor = computed(() => props.title?.color && props.title.color.kind !== "palette" ? props.title.color : null);
const iconChoices = computed(() => ICON_CHOICES.includes(form.icon) ? ICON_CHOICES : [form.icon, ...ICON_CHOICES]);
const trimmedIconUrl = computed(() => form.iconUrl.trim());
const iconItems = computed(() => iconChoices.value.map((name) => ({ value: name, label: name })));
const cdnItems = computed(() => cdnChoices.value.map((image) => ({ value: image.url, title: image.name, label: image.name.replace(/\.[^.]+$/, "").replace(/^achievement-/, "") })));
const colorItems = computed(() => [
  { value: "none", label: "未设置", background: null },
  ...TITLE_PALETTE_NAMES.map((name) => ({ value: `palette:${name}`, label: titleColorLabel({ kind: "palette", name }), background: titleColorBackground({ kind: "palette", name }) })),
  ...(legacyColor.value ? [{ value: "legacy", label: titleColorLabel(legacyColor.value), background: titleColorBackground(legacyColor.value) ?? "var(--surface-sunken)" }] : []),
]);
const colorKey = computed(() => form.color === null ? "none" : form.color.kind === "palette" ? `palette:${form.color.name}` : "legacy");
function setColorKey(key: string) {
  form.color = key === "none" ? null : key === "legacy" ? legacyColor.value : { kind: "palette", name: key.slice("palette:".length) } as AdminTitleColor;
}
const customImage = computed(() => iconPreviewUrl.value || trimmedIconUrl.value);
const previewColor = computed(() => titleColorBackground(form.color));

function pickIcon(name: string) {
  form.icon = name;
  iconPickerOpen.value = false;
}
function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement;
  iconFile.value = input.files?.[0] ?? null;
  if (iconFile.value) form.iconUrl = "";
  input.value = "";
}
function onIconUrlInput() {
  if (form.iconUrl) iconFile.value = null;
}
function clearCustomImage() {
  iconFile.value = null;
  form.iconUrl = "";
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
    color: form.color,
    icon: form.icon,
    ...(trimmedIconUrl.value ? { iconUrl: trimmedIconUrl.value } : {}),
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
    color: form.color,
    icon: form.icon,
    // An uploaded file sets iconUrl itself after saving; otherwise the field is the source of truth.
    ...(iconFile.value || trimmedIconUrl.value === (props.title?.iconUrl ?? "") ? {} : { iconUrl: trimmedIconUrl.value || null }),
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
          <UInput v-model="form.label" class="w-full" required maxlength="256" :disabled="saving" />
        </UFormField>
        <UFormField label="系列" required help="选择已有系列，或输入新的。">
          <UInput v-model="form.category" class="w-full" list="admin-title-category-options" placeholder="选择或输入" :disabled="saving" />
          <datalist id="admin-title-category-options"><option v-for="category in categories" :key="category" :value="category" /></datalist>
        </UFormField>
        <UFormField label="称号范围" :help="scopeHint">
          <USelect v-model="form.scope" class="w-full" :items="[{ label: '全局称号', value: 'global' }, { label: '地图称号', value: 'map' }]" :disabled="saving" />
        </UFormField>
        <UFormField label="展示方式">
          <USelect v-model="form.displayKind" class="w-full" :items="[{ label: '固定称号', value: 'fixed' }, { label: '地图名 + 开拓者', value: 'map_pioneer' }, { label: '地图名 + 后缀称号', value: 'map_name_suffix' }]" :disabled="saving" />
        </UFormField>
        <fieldset class="title-dialog-form__wide appearance">
          <legend>外观</legend>
          <div class="appearance-preview" aria-label="称号预览">
            <span class="appearance-preview__mark">
              <img v-if="customImage" :src="customImage" alt="" />
              <UIcon v-else :name="`i-lucide-${form.icon}`" />
            </span>
            <strong class="appearance-preview__label" :class="{ 'is-colored': previewColor }" :style="previewColor ? { backgroundImage: previewColor } : undefined">{{ form.label.trim() || "称号名称" }}</strong>
          </div>

          <div class="appearance-row">
            <span class="appearance-row__label" id="title-color-label">颜色</span>
            <URadioGroup
              :model-value="colorKey" :items="colorItems" variant="card" indicator="hidden" orientation="horizontal" aria-labelledby="title-color-label" :disabled="saving"
              :ui="{ fieldset: 'flex flex-wrap gap-2', item: 'w-auto p-1 pe-3 rounded-full' }"
              @update:model-value="setColorKey(String($event))"
            >
              <template #label="{ item }">
                <span class="swatch"><span class="swatch__chip" :class="{ 'swatch__chip--none': item.value === 'none' }" :style="item.background ? { background: item.background } : undefined" /><span>{{ item.label }}</span></span>
              </template>
            </URadioGroup>
          </div>

          <div class="appearance-row">
            <span class="appearance-row__label">图标</span>
            <UPopover v-model:open="iconPickerOpen">
              <UButton type="button" color="neutral" variant="outline" :disabled="saving" :icon="`i-lucide-${form.icon}`" :label="form.icon" trailing-icon="i-lucide-chevron-down" />
              <template #content>
                <URadioGroup
                  :model-value="form.icon" :items="iconItems" variant="card" indicator="hidden" orientation="horizontal" aria-label="选择图标"
                  :ui="{ fieldset: 'grid grid-cols-6 gap-1 p-2', item: 'size-10 p-0 items-center justify-center' }"
                  @update:model-value="pickIcon(String($event))"
                >
                  <template #label="{ item }"><UIcon :name="`i-lucide-${item.value}`" class="size-5" :title="item.value" /></template>
                </URadioGroup>
              </template>
            </UPopover>
          </div>

          <div class="appearance-row">
            <span class="appearance-row__label">自定义图片</span>
            <div class="image-source">
              <div class="image-source__actions">
                <input ref="fileInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" tabindex="-1" @change="onFileChosen">
                <UButton type="button" color="neutral" variant="outline" icon="i-lucide-upload" label="上传图片" :disabled="saving" @click="fileInput?.click()" />
                <UPopover v-model:open="cdnPickerOpen">
                  <UButton type="button" color="neutral" variant="outline" icon="i-lucide-images" label="从 CDN 选择" :disabled="saving" />
                  <template #content>
                    <div class="cdn-picker">
                      <UInput v-model="cdnQuery" class="w-full" icon="i-lucide-search" placeholder="搜索文件名" aria-label="搜索 CDN 图片" />
                      <p v-if="cdnLoading" class="cdn-picker__status">正在读取…</p>
                      <p v-else-if="cdnError" class="cdn-picker__status">{{ cdnError }}</p>
                      <p v-else-if="!cdnChoices.length" class="cdn-picker__status">没有匹配的图片。</p>
                      <URadioGroup
                        v-else :model-value="trimmedIconUrl" :items="cdnItems" variant="card" indicator="hidden" orientation="horizontal" aria-label="选择 CDN 图片"
                        :ui="{ fieldset: 'grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2 max-h-80 overflow-y-auto', item: 'p-2 justify-center' }"
                        @update:model-value="pickCdnImage(String($event))"
                      >
                        <template #label="{ item }"><span class="cdn-picker__item" :title="item.title"><img :src="item.value" alt="" loading="lazy" /><span>{{ item.label }}</span></span></template>
                      </URadioGroup>
                    </div>
                  </template>
                </UPopover>
                <UButton v-if="customImage" type="button" color="neutral" variant="ghost" icon="i-lucide-x" label="移除" :disabled="saving" @click="clearCustomImage" />
                <span v-if="iconFile" class="image-source__file">{{ iconFile.name }}</span>
              </div>
              <UInput v-model="form.iconUrl" class="w-full" type="url" placeholder="已选图片的 CDN 链接，也可直接粘贴" maxlength="2048" :disabled="saving" @update:model-value="onIconUrlInput" />
              <p class="image-source__hint">PNG、JPEG 或 WebP。设置后优先于上方图标。</p>
            </div>
          </div>
        </fieldset>
        <UFormField class="title-dialog-form__wide">
          <UCheckbox v-model="form.publicVisibility" label="公开显示" :disabled="saving" />
          <template #help>关闭后不出现在公开成就页，不影响获取。</template>
        </UFormField>
        <details ref="moreSettings" class="title-dialog-form__wide more-settings">
          <summary>更多设置</summary>
          <div class="more-settings-body">
            <UFormField v-if="mode === 'create'" label="唯一 key" help="留空自动生成，创建后不能修改。" :error="keyConflict !== null ? `已被「${conflictingLabel}」使用` : undefined">
              <UInput v-model="form.titleKey" class="w-full" placeholder="例如 LIGHT_LOADOUT" :disabled="saving" :aria-invalid="keyConflict !== null || undefined" />
            </UFormField>
            <UFormField label="游戏版本" help="留空使用最新版本。">
              <UInput v-model="form.gameVersion" class="w-full" placeholder="例如 26.1003.1" :disabled="saving" />
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
.appearance { display: grid; gap: var(--space-4); margin: 0; padding: var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-control); min-width: 0; }
.appearance legend { padding: 0 var(--space-2); color: var(--muted); font-size: var(--type-caption-size); }
.appearance-preview { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-control); background: var(--surface-sunken, var(--surface-raised)); }
.appearance-preview__mark { display: grid; place-items: center; flex: none; width: 4rem; height: 4rem; font-size: 2rem; border-radius: var(--radius-control); background: var(--surface-raised); overflow: hidden; }
.appearance-preview__mark img { width: 100%; height: 100%; object-fit: contain; }
.appearance-preview__label { font-size: 1.25rem; }
.appearance-preview__label.is-colored { color: transparent; background-clip: text; -webkit-background-clip: text; }
.appearance-row { display: grid; grid-template-columns: 6rem minmax(0, 1fr); align-items: start; gap: var(--space-3); }
.appearance-row__label { padding-top: var(--space-2); font-size: var(--type-caption-size); color: var(--muted); }
.swatch { display: inline-flex; align-items: center; gap: var(--space-2); }
.swatch__chip { width: 1.5rem; height: 1.5rem; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.25); }
.swatch__chip--none { background: repeating-linear-gradient(45deg, transparent 0 3px, var(--line-strong) 3px 4px); }
.cdn-picker { display: grid; gap: var(--space-2); width: min(28rem, 90vw); padding: var(--space-3); }
.cdn-picker__status { margin: 0; padding: var(--space-4) 0; text-align: center; color: var(--muted); font-size: var(--type-caption-size); }
.cdn-picker__item { display: grid; justify-items: center; gap: var(--space-1); min-width: 0; }
.cdn-picker__item img { width: 3.5rem; height: 3.5rem; object-fit: contain; }
.cdn-picker__item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--type-caption-size); color: var(--muted); }
.image-source { display: grid; gap: var(--space-2); min-width: 0; }
.image-source__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.image-source__file { color: var(--muted); font-size: var(--type-caption-size); overflow-wrap: anywhere; }
.image-source__hint { margin: 0; color: var(--muted); font-size: var(--type-caption-size); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@container (max-width: 36rem) {
  .title-dialog-form { grid-template-columns: 1fr; }
  .more-settings-body { grid-template-columns: 1fr; }
  .appearance-row { grid-template-columns: 1fr; }
  .appearance-row__label { padding-top: 0; }
}
</style>
