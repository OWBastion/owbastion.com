<script setup lang="ts">
import type { AdminTitleChallenge, AdminTitleProgressRule, AdminTitleSummary } from "./admin-title-types";
import { titleScopeLabel } from "./admin-title-types";
import type { AdminMap, StandaloneModeOption } from "./admin-achievement-types";
import { DEFAULT_EVIDENCE_RULE, DIFFICULTY_OPTIONS } from "./admin-achievement-types";

const props = defineProps<{
  open: boolean;
  mode: "add" | "edit";
  title: AdminTitleSummary | null;
  challenge: AdminTitleChallenge | null;
  siblings: AdminTitleChallenge[];
  maps: AdminMap[];
  modes: StandaloneModeOption[];
  saving: boolean;
  errorMessage: string;
}>();
const emit = defineEmits<{
  "update:open": [open: boolean];
  submit: [payload: Record<string, unknown>];
}>();

const dialogOpen = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open),
});

const regularScope = "__regular__";
const form = reactive({
  progressMode: "none" as "none" | "required_maps_completed",
  condition: "",
  evidenceRule: "",
  submissionMode: "manual" as "manual" | "automatic",
  mapIds: [] as string[],
  mapVariant: undefined as "classic" | undefined,
  progressScope: regularScope as string,
  progressMapIds: [] as string[],
  progressDifficultyAtLeast: "" as string,
  status: "draft" as "draft" | "active",
  startsAt: null as number | null,
  endsAt: null as number | null,
  gameVersion: "",
  enableTitle: true,
  saveMode: "in_place" as "in_place" | "new_challenge",
  initialProgressMode: "none" as "none" | "required_maps_completed",
});

watch(() => props.open, (open) => {
  if (!open) return;
  const challenge = props.challenge;
  const rule = challenge?.progressRule;
  Object.assign(form, {
    progressMode: rule ? "required_maps_completed" : "none",
    initialProgressMode: rule ? "required_maps_completed" : "none",
    condition: challenge?.condition ?? "",
    evidenceRule: challenge?.evidenceRule ?? "",
    submissionMode: challenge?.submissionMode ?? "manual",
    mapIds: challenge ? [...(challenge.mapIds ?? [])] : [],
    mapVariant: challenge?.mapVariant,
    progressScope: rule?.mode ?? regularScope,
    progressMapIds: rule?.mapIds ? [...rule.mapIds] : [],
    progressDifficultyAtLeast: rule?.difficultyAtLeast ?? "",
    status: challenge && challenge.status !== "archived" ? challenge.status : "draft",
    startsAt: challenge?.startsAt ?? null,
    endsAt: challenge?.endsAt ?? null,
    gameVersion: challenge?.introducedVersion ?? "",
    enableTitle: true,
    saveMode: "in_place",
  });
});

const isMapTitle = computed(() => props.title?.scope === "map");
const progressMode = computed(() => form.progressMode === "required_maps_completed");
watch(progressMode, (enabled) => {
  if (!enabled) return;
  // 集齐指定地图 challenges are verified-run based: always manual submission.
  form.submissionMode = "manual";
  form.mapIds = [];
  form.mapVariant = undefined;
});

const mapItems = computed(() => props.maps.map((map) => ({ label: map.mapName, value: map.mapId })));
const progressModeItems = [
  { label: "截图条件", value: "none" },
  { label: "集齐指定地图", value: "required_maps_completed" },
];
const scopeItems = computed(() => [
  { label: "常规模式（指定地图）", value: regularScope },
  ...props.modes.map(({ mode, mapIds }) => ({ label: `${mode}（${mapIds.length} 张地图）`, value: mode })),
]);
const progressDifficultyItems = computed(() => [
  { label: "不限难度", value: "" },
  ...DIFFICULTY_OPTIONS.map((difficulty) => ({ label: `至少${difficulty}`, value: difficulty })),
]);
watch(() => form.progressScope, (scope) => {
  if (scope !== regularScope) form.progressMapIds = [];
});

const chipStatus = computed(() => {
  const title = props.title;
  if (!title) return "";
  return `${title.lifecycle === "draft" ? "草稿" : title.status === "ended" ? "已结束" : "已启用"} · ${titleScopeLabel(title.scope)}`;
});
const dialogTitle = computed(() => props.mode === "edit" ? "编辑挑战" : "添加挑战");
const showEnableTitle = computed(() => props.mode === "add" && props.title?.lifecycle === "draft" && form.status === "active");

const normalizeRule = (rule: AdminTitleProgressRule | undefined, draft?: typeof form) => {
  if (draft) {
    if (draft.progressMode !== "required_maps_completed") return null;
    return {
      mapIds: [...draft.progressMapIds].sort(),
      difficultyAtLeast: draft.progressDifficultyAtLeast || "",
      mode: draft.progressScope === regularScope ? "" : draft.progressScope,
    };
  }
  if (!rule) return null;
  return { mapIds: [...(rule.mapIds ?? [])].sort(), difficultyAtLeast: rule.difficultyAtLeast ?? "", mode: rule.mode ?? "" };
};
const sameList = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index]);

const original = computed(() => props.challenge);
const qualificationChanged = computed(() => {
  const challenge = original.value;
  if (!challenge || props.mode !== "edit") return false;
  if (form.progressMode !== form.initialProgressMode) return true;
  const before = normalizeRule(challenge.progressRule);
  const after = normalizeRule(undefined, form);
  if (JSON.stringify(before) !== JSON.stringify(after)) return true;
  if (!sameList([...(challenge.mapIds ?? [])].sort(), [...form.mapIds].sort())) return true;
  return (challenge.mapVariant ?? undefined) !== form.mapVariant;
});
const textChanged = computed(() => {
  const challenge = original.value;
  if (!challenge || props.mode !== "edit") return false;
  return challenge.condition !== form.condition
    || (challenge.evidenceRule ?? "") !== form.evidenceRule
    || challenge.submissionMode !== form.submissionMode;
});

const canSubmit = computed(() => Boolean(
  form.condition.trim()
  && (!progressMode.value || form.progressScope !== regularScope || form.progressMapIds.length),
));
const submitLabel = computed(() => props.mode === "add" ? "添加挑战" : qualificationChanged.value ? "保存为新挑战" : "保存");

const progressRulePayload = () => progressMode.value
  ? {
      type: "required_maps_completed" as const,
      ...(form.progressMapIds.length ? { mapIds: [...form.progressMapIds] } : {}),
      ...(form.progressDifficultyAtLeast ? { difficultyAtLeast: form.progressDifficultyAtLeast } : {}),
      ...(form.progressScope !== regularScope ? { mode: form.progressScope } : {}),
    }
  : null;

function submit() {
  if (!canSubmit.value) return;
  const rule = progressRulePayload();
  if (props.mode === "add") {
    emit("submit", {
      contractVersion: "1",
      condition: form.condition.trim(),
      evidenceRule: form.evidenceRule.trim() || DEFAULT_EVIDENCE_RULE,
      submissionMode: form.submissionMode,
      status: form.status,
      ...(form.startsAt ? { startsAt: form.startsAt } : {}),
      ...(form.endsAt ? { endsAt: form.endsAt } : {}),
      ...(form.gameVersion.trim() ? { gameVersion: form.gameVersion.trim() } : {}),
      ...(isMapTitle.value && form.mapIds.length ? { mapIds: [...form.mapIds] } : {}),
      ...(isMapTitle.value && form.mapVariant ? { mapVariant: form.mapVariant } : {}),
      ...(rule ? { progressRule: rule } : {}),
      ...(showEnableTitle.value && form.enableTitle ? { enableTitle: true } : {}),
    });
    return;
  }
  const challenge = props.challenge;
  if (!challenge) return;
  const saveMode = qualificationChanged.value ? "new_challenge" : textChanged.value ? form.saveMode : "in_place";
  emit("submit", {
    contractVersion: "1",
    family: "achievement",
    saveMode,
    // The dialog never edits the display category; echo it so a save keeps the override.
    categoryOverride: challenge.categoryOverride ?? null,
    condition: form.condition.trim(),
    evidenceRule: form.evidenceRule.trim() || DEFAULT_EVIDENCE_RULE,
    submissionMode: form.submissionMode,
    status: challenge.status,
    ...(isMapTitle.value ? { mapIds: [...form.mapIds], mapVariant: form.mapVariant } : {}),
    progressRule: rule,
    // The dialog never edits the announced sunset version; echo the stored one
    // so an in-place or replacement save does not silently clear a planned sunset.
    ...(challenge.status === "active" ? { retiredVersion: challenge.retiredVersion } : {}),
    ...(form.gameVersion.trim() ? { gameVersion: form.gameVersion.trim() } : challenge.status === "draft" ? { gameVersion: null } : {}),
    startsAt: form.startsAt,
    endsAt: form.endsAt,
  });
}
</script>

<template>
  <AdminResponsiveDialog v-model:open="dialogOpen" :title="dialogTitle" size="lg">
    <template #body>
      <div v-if="title" class="challenge-dialog-title">
        <span class="challenge-chip">{{ title.label }}</span>
        <span class="type-caption">{{ chipStatus }}</span>
      </div>
      <form id="admin-challenge-form" class="challenge-dialog-form" @submit.prevent="submit">
        <UAlert v-if="errorMessage" class="challenge-dialog-form__wide" color="error" variant="subtle" title="无法保存挑战" :description="errorMessage" />
        <UAlert v-if="qualificationChanged" class="challenge-dialog-form__wide" color="info" variant="subtle" role="status" title="保存后会新建一条挑战" description="获取资格变了（完成规则、要求地图、最低难度或适用地图），当前挑战会结束，新挑战接替它。已经获得称号的玩家不受影响。" />
        <UFormField class="challenge-dialog-form__wide" label="完成规则" :help="progressMode ? '以已验证通关为准，不走截图审核。' : '按截图审核完成。'">
          <USelect v-model="form.progressMode" :items="progressModeItems" :disabled="saving" />
        </UFormField>
        <UFormField class="challenge-dialog-form__wide" label="完成条件" required>
          <UTextarea v-model="form.condition" class="w-full" required maxlength="1024" :disabled="saving" />
        </UFormField>

        <template v-if="progressMode">
          <UFormField label="统计范围" help="选择独立模式后自动跟随该模式的全部地图。">
            <USelect v-model="form.progressScope" :items="scopeItems" :disabled="saving" />
          </UFormField>
          <UFormField label="最低难度">
            <USelect v-model="form.progressDifficultyAtLeast" :items="progressDifficultyItems" :disabled="saving" />
          </UFormField>
          <UFormField v-if="form.progressScope === regularScope" class="challenge-dialog-form__wide" label="要求地图" required help="开放时间内每张地图各有一条已验证通关即完成。">
            <USelect v-model="form.progressMapIds" class="w-full" multiple :items="mapItems" :disabled="saving" />
            <div class="challenge-dialog-form__actions">
              <UButton size="xs" color="neutral" variant="soft" label="全选" :disabled="saving" @click="form.progressMapIds = mapItems.map((item) => item.value)" />
              <UButton size="xs" color="neutral" variant="ghost" label="清空" :disabled="saving || !form.progressMapIds.length" @click="form.progressMapIds = []" />
              <span class="type-caption">已选 {{ form.progressMapIds.length }} / {{ mapItems.length }}</span>
            </div>
          </UFormField>
        </template>

        <template v-else>
          <UFormField class="challenge-dialog-form__wide" label="截图规则" help="留空使用默认规则。">
            <UTextarea v-model="form.evidenceRule" class="w-full" :placeholder="DEFAULT_EVIDENCE_RULE" maxlength="2048" :disabled="saving" />
          </UFormField>
          <UFormField label="提交方式">
            <USelect v-model="form.submissionMode" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :disabled="saving" />
          </UFormField>
          <template v-if="isMapTitle">
            <UFormField label="地图版本">
              <USelect v-model="form.mapVariant" :items="[{ label: '标准版', value: undefined }, { label: '经典版', value: 'classic' }]" :disabled="saving" />
            </UFormField>
            <UFormField class="challenge-dialog-form__wide" label="指定地图" help="留空作用于全部有效地图。">
              <USelect v-model="form.mapIds" multiple :items="mapItems" :disabled="saving" />
            </UFormField>
          </template>
        </template>

        <p class="challenge-section challenge-dialog-form__wide">开放</p>
        <UFormField v-if="mode === 'add'" class="challenge-dialog-form__wide" label="状态">
          <USelect v-model="form.status" :items="[{ label: '草稿', value: 'draft' }, { label: '已开放', value: 'active' }]" :disabled="saving" />
          <template #help>
            <span v-if="showEnableTitle" class="challenge-enable">
              <UCheckbox v-model="form.enableTitle" :label="`同时启用称号「${title?.label}」`" :disabled="saving" />
              <span class="challenge-enable__hint">称号还是草稿；不启用的话，挑战开放了玩家也拿不到。</span>
            </span>
          </template>
        </UFormField>
        <UFormField label="开始时间">
          <AdminDateTimePicker v-model="form.startsAt" placeholder="立即" :disabled="saving" />
        </UFormField>
        <UFormField label="结束时间">
          <AdminDateTimePicker v-model="form.endsAt" placeholder="长期开放" :disabled="saving" />
        </UFormField>
        <UFormField label="引入版本" help="留空使用最新版本。">
          <UInput v-model="form.gameVersion" placeholder="例如 26.1003.1" :disabled="saving" />
        </UFormField>

        <p v-if="siblings.length" class="challenge-section challenge-dialog-form__wide">其他获取方式</p>
        <div v-if="siblings.length" class="challenge-dialog-form__wide challenge-siblings">
          <p v-for="sibling in siblings" :key="sibling.challengeId" class="challenge-siblings__item">{{ sibling.condition }}</p>
          <p class="type-caption">玩家已持有这个称号时，不会从新挑战重复获得。</p>
        </div>

        <fieldset v-if="mode === 'edit' && !qualificationChanged && textChanged" class="challenge-dialog-form__wide challenge-save-mode">
          <legend>这次修改怎么保存</legend>
          <label class="challenge-save-mode__option">
            <input v-model="form.saveMode" type="radio" value="in_place" :disabled="saving" />
            <span class="title-cell-stack"><span>原地更新</span><small class="table-meta">还是同一条挑战，已获得的记录和进行中的提交都不变。适合修正措辞。</small></span>
          </label>
          <label class="challenge-save-mode__option">
            <input v-model="form.saveMode" type="radio" value="new_challenge" :disabled="saving" />
            <span class="title-cell-stack"><span>保存为新挑战</span><small class="table-meta">当前挑战结束，新挑战接替。适合条件实际变了的情况。</small></span>
          </label>
        </fieldset>
      </form>
    </template>
    <template #footer>
      <UButton label="取消" color="neutral" variant="ghost" :disabled="saving" @click="dialogOpen = false" />
      <UButton :label="submitLabel" type="submit" form="admin-challenge-form" :loading="saving" :disabled="!canSubmit" />
    </template>
  </AdminResponsiveDialog>
</template>

<style scoped>
.challenge-dialog-title { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-4) var(--space-6) 0; }
.challenge-chip { display: inline-flex; align-items: center; min-height: 22px; padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--surface-raised); font-size: .75rem; font-weight: 600; }
.challenge-dialog-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: var(--space-5); padding: var(--space-6); }
.challenge-dialog-form__wide { grid-column: 1 / -1; }
.challenge-dialog-form__actions { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
.challenge-section { margin: var(--space-2) 0 0; padding-top: var(--space-3); border-top: 1px solid var(--line); font-size: .75rem; font-weight: 700; color: var(--quiet); }
.challenge-enable { display: grid; gap: var(--space-1); }
.challenge-enable__hint { color: var(--quiet); font-size: .75rem; }
.challenge-siblings { display: grid; gap: var(--space-2); }
.challenge-siblings__item { margin: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); font-size: .8125rem; }
.challenge-save-mode { margin: 0; padding: var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-control); display: grid; gap: var(--space-2); }
.challenge-save-mode legend { padding: 0 var(--space-1); font-size: .8125rem; font-weight: 500; color: var(--muted); }
.challenge-save-mode__option { display: flex; align-items: flex-start; gap: var(--space-2); font-size: .875rem; cursor: pointer; }
.challenge-save-mode__option input { margin-top: .2rem; }
.title-cell-stack { display: grid; gap: 2px; }
.table-meta { color: var(--quiet); font-size: var(--type-caption-size); }
@container (max-width: 36rem) {
  .challenge-dialog-form { grid-template-columns: 1fr; }
}
</style>
