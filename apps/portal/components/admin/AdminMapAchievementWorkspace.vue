<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import { mapVariantLabel } from "~/utils/map-variant";

type AchievementStatus = "scheduled" | "active" | "sunsetting" | "retired";
type MapItem = { mapId: string; mapName: string };
type MapChallenge = {
  challengeId: string;
  family: "map";
  gameplayRevisionId: string;
  type: "map_completion";
  kind?: string;
  titleKey?: string;
  name: string;
  mapVariant?: "classic";
  mapId: string;
  mapName: string;
  difficulty?: string;
  condition?: string;
  evidenceRule?: string;
  submissionMode?: "manual" | "automatic";
  status: AchievementStatus;
  introducedVersion: string;
  retiredVersion: string | null;
  mapTitleRule?: { ruleId: string; kind: string; displayKind: Rule["displayKind"]; slot: Rule["slot"]; dynamic: boolean };
};
type Rule = {
  ruleId: string;
  titleKey: string;
  titleName: string;
  kind: string;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  displayKind: "fixed" | "map_pioneer" | "map_name_suffix";
  slot: "pioneer" | "conqueror" | "dominator" | null;
  mapVariant?: "classic";
  defaultScope: "all_active" | "explicit";
  status: "active" | "sunsetting" | "retired";
  introducedVersion: string;
  retiredVersion: string | null;
};
type Exception = {
  exceptionId?: string;
  ruleId?: string;
  mapId?: string;
  enabled: boolean;
  condition: string | null;
  evidenceRule: string | null;
  submissionMode: "manual" | "automatic" | null;
  slot: Rule["slot"];
};
type Inheritance = {
  mapId: string;
  rule: Rule;
  projected: boolean;
  source: "map_title_rule";
  effective: { condition: string; evidenceRule: string; submissionMode: Rule["submissionMode"]; slot: Rule["slot"] } | null;
  exception: Exception | null;
};
type RuleSummary = Rule & { effectiveMapCount: number; exceptionCount: number };
type MapViewRow = {
  rowId: string;
  rowType: "projection" | "challenge";
  titleName: string;
  source: string;
  condition: string;
  submissionMode: string;
  status: AchievementStatus;
  rule?: Rule;
  inheritance?: Inheritance;
  challenge?: MapChallenge;
};

const props = withDefaults(defineProps<{
  maps: MapItem[];
  challenges: MapChallenge[];
  loading?: boolean;
  initialMapId?: string;
  initialRuleId?: string;
}>(), { loading: false, initialMapId: "", initialRuleId: "" });

const emit = defineEmits<{ editChallenge: [challenge: MapChallenge] }>();
const api = useAdminApi();
const toast = useToast();
const rules = shallowRef<Rule[]>([]);
const inheritances = shallowRef<Inheritance[]>([]);
const selectedMapId = shallowRef(props.initialMapId || "");
const viewMode = shallowRef<"rules" | "map">(props.initialMapId ? "map" : "rules");
const loadingRules = shallowRef(true);
const saving = shallowRef(false);
const errorMessage = shallowRef("");
const editingRule = shallowRef<Rule | null>(null);
const ruleFormOpen = shallowRef(false);
const editingExceptionId = shallowRef<string | null>(null);
const exceptionDraft = reactive<Exception>({ enabled: true, condition: null, evidenceRule: null, submissionMode: null, slot: null });
const form = reactive({ titleKey: "", kind: "", condition: "", evidenceRule: "", submissionMode: "manual" as Rule["submissionMode"], displayKind: "fixed" as Rule["displayKind"], slot: null as Rule["slot"], mapVariant: undefined as "classic" | undefined, defaultScope: "all_active" as Rule["defaultScope"], status: "active" as Rule["status"], introducedVersion: "", retiredVersion: "" });

const defaultRuleSorting: SortingState = [{ id: "titleName", desc: false }];
const ruleSorting = shallowRef<SortingState>([...defaultRuleSorting]);
const ruleSortingOptions = [
  { id: "titleName", label: "称号" },
  { id: "effectiveMapCount", label: "有效地图数" },
  { id: "exceptionCount", label: "地图例外数" },
  { id: "status", label: "状态" },
];
const defaultMapSorting: SortingState = [{ id: "titleName", desc: false }];
const mapSorting = shallowRef<SortingState>([...defaultMapSorting]);
const mapSortingOptions = [
  { id: "titleName", label: "挑战" },
  { id: "source", label: "来源" },
  { id: "status", label: "状态" },
];
const ruleColumns: TableColumn<RuleSummary>[] = [
  { accessorKey: "titleName", header: "称号" },
  { accessorKey: "effectiveMapCount", header: "有效地图" },
  { accessorKey: "exceptionCount", header: "地图例外" },
  { accessorKey: "displayKind", header: "展示方式" },
  { accessorKey: "submissionMode", header: "提交方式" },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作", enableHiding: false },
];
const mapColumns: TableColumn<MapViewRow>[] = [
  { accessorKey: "titleName", header: "挑战" },
  { accessorKey: "source", header: "来源" },
  { accessorKey: "condition", header: "完成条件" },
  { accessorKey: "submissionMode", header: "提交方式" },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作", enableHiding: false },
];

const statusLabel = (status: AchievementStatus) => status === "active" ? "已开放" : status === "sunsetting" ? "即将结束" : status === "scheduled" ? "未开放" : "已下线";
const statusTone = (status: AchievementStatus) => status === "active" ? "success" : "warning";
const displayKindLabel = (displayKind: Rule["displayKind"]) => ({ fixed: "固定称号", map_pioneer: "地图名 + 开拓者", map_name_suffix: "地图名 + 后缀称号" })[displayKind];
const submissionModeLabel = (submissionMode: Rule["submissionMode"] | null | undefined) => submissionMode === "automatic" ? "自动提交" : "手动提交";
const scopeLabel = (scope: Rule["defaultScope"]) => scope === "all_active" ? "全部有效地图" : "仅例外地图";
const scopeOptions = computed(() => form.kind.trim().toLocaleLowerCase() === "pioneer"
  ? [{ label: "仅例外地图（限时开放）", value: "explicit" as const }]
  : [{ label: "全部有效地图", value: "all_active" as const }, { label: "仅例外地图", value: "explicit" as const }]);
const mapName = computed(() => props.maps.find((map) => map.mapId === selectedMapId.value)?.mapName ?? "");
const ruleSummaries = computed<RuleSummary[]>(() => rules.value.map((rule) => {
  const rows = inheritances.value.filter((item) => item.rule.ruleId === rule.ruleId);
  return { ...rule, effectiveMapCount: rows.filter((item) => item.projected).length, exceptionCount: rows.filter((item) => item.exception !== null).length };
}));
const selectedInheritance = computed(() => inheritances.value.filter((item) => item.mapId === selectedMapId.value));
const mapRows = computed<MapViewRow[]>(() => {
  const projections = selectedInheritance.value.map((item) => ({
    rowId: `${item.mapId}:${item.rule.ruleId}`,
    rowType: "projection" as const,
    titleName: item.rule.titleName,
    source: `规则 · ${item.rule.kind}`,
    condition: item.effective?.condition ?? "未在此地图生效",
    submissionMode: item.effective ? submissionModeLabel(item.effective.submissionMode) : "—",
    status: item.rule.status,
    rule: item.rule,
    inheritance: item,
  }));
  const genuineChallenges = props.challenges.filter((challenge) => challenge.mapId === selectedMapId.value && !challenge.mapTitleRule?.dynamic).map((challenge) => ({
    rowId: `${challenge.mapId}:${challenge.challengeId}:${challenge.gameplayRevisionId}`,
    rowType: "challenge" as const,
    titleName: challenge.name,
    source: "单图挑战",
    condition: challenge.condition ?? "",
    submissionMode: submissionModeLabel(challenge.submissionMode),
    status: challenge.status,
    challenge,
  }));
  return [...projections, ...genuineChallenges];
});
const selectedException = computed(() => selectedInheritance.value.find((item) => `${item.mapId}:${item.rule.ruleId}` === editingExceptionId.value) ?? null);
const dialogOpen = computed({ get: () => ruleFormOpen.value, set: (open: boolean) => { if (open) ruleFormOpen.value = true; else closeRuleForm(); } });

function resetForm(rule?: Rule) {
  Object.assign(form, rule ? { ...rule, retiredVersion: rule.retiredVersion ?? "" } : { titleKey: "", kind: "", condition: "", evidenceRule: "", submissionMode: "manual", displayKind: "fixed", slot: null, mapVariant: undefined, defaultScope: "all_active", status: "active", introducedVersion: "", retiredVersion: "" });
  if (form.kind.trim().toLocaleLowerCase() === "pioneer") form.defaultScope = "explicit";
}
function editRule(rule?: Rule) { editingRule.value = rule ?? null; resetForm(rule); ruleFormOpen.value = true; }
function closeRuleForm() { editingRule.value = null; ruleFormOpen.value = false; resetForm(); }
function openException(item: Inheritance) {
  editingExceptionId.value = `${item.mapId}:${item.rule.ruleId}`;
  Object.assign(exceptionDraft, item.exception ?? { enabled: item.projected, condition: null, evidenceRule: null, submissionMode: null, slot: null });
}
function closeException() { editingExceptionId.value = null; Object.assign(exceptionDraft, { enabled: true, condition: null, evidenceRule: null, submissionMode: null, slot: null }); }

async function load() {
  if (!props.maps.length) return;
  const currentLoad = Symbol();
  activeLoad = currentLoad;
  loadingRules.value = true;
  errorMessage.value = "";
  try {
    const ruleResult = await api<{ items: Rule[] }>("/v1/map-title-rules");
    if (activeLoad !== currentLoad) return;
    rules.value = ruleResult.items;
    const results = await Promise.all(props.maps.map((map) => api<{ items: Inheritance[] }>(`/v1/maps/${encodeURIComponent(map.mapId)}/map-title-inheritance`)));
    if (activeLoad !== currentLoad) return;
    inheritances.value = results.flatMap((result) => result.items);
    selectedMapId.value ||= props.maps[0]?.mapId ?? "";
    if (props.initialRuleId) {
      const target = rules.value.find((rule) => rule.ruleId === props.initialRuleId);
      if (target) editRule(target);
    }
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取地图成就，请稍后重试。").description;
  } finally {
    if (activeLoad === currentLoad) loadingRules.value = false;
  }
}
let activeLoad: symbol | undefined;

async function saveRule() {
  saving.value = true;
  const body = { contractVersion: "1", ...form, retiredVersion: form.status === "sunsetting" ? form.retiredVersion.trim() || null : null };
  try {
    if (editingRule.value) await api(`/v1/map-title-rules/${encodeURIComponent(editingRule.value.ruleId)}`, { method: "PUT", body, headers: { "Idempotency-Key": createRequestId() } });
    else await api("/v1/map-title-rules", { method: "POST", body, headers: { "Idempotency-Key": createRequestId() } });
    toast.add({ title: editingRule.value ? "地图称号规则已更新" : "地图称号规则已创建", color: "success" });
    closeRuleForm();
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存地图称号规则，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}
async function saveException() {
  const item = selectedException.value;
  if (!item) return;
  saving.value = true;
  try {
    await api(`/v1/maps/${encodeURIComponent(item.mapId)}/map-title-rules/${encodeURIComponent(item.rule.ruleId)}/exception`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", ...exceptionDraft } });
    toast.add({ title: "地图例外已保存", color: "success" });
    closeException();
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存地图例外，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

watch(() => form.kind, (kind) => { if (kind.trim().toLocaleLowerCase() === "pioneer") form.defaultScope = "explicit"; });
watch(() => props.maps, () => { if (!selectedMapId.value && props.maps[0]) selectedMapId.value = props.maps[0].mapId; void load(); }, { immediate: true });
</script>

<template>
  <section class="map-achievement-workspace" aria-labelledby="map-achievements-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">地图成就</p>
        <h2 id="map-achievements-title" class="type-headline">规则与有效结果</h2>
      </div>
      <span class="type-caption">{{ loadingRules ? "读取中…" : `${rules.length} 条规则` }}</span>
    </div>
    <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
    <UTabs v-model="viewMode" :items="[{ label: '按规则', value: 'rules' }, { label: '按地图查看', value: 'map' }]" variant="link" aria-label="地图成就视图" />

    <template v-if="viewMode === 'rules'">
      <div class="section-toolbar"><p class="type-caption">规则是地图称号的唯一编辑入口；有效结果只读。</p><UButton label="新建规则" size="sm" @click="editRule()" /></div>
      <AdminDataTable v-model:sorting="ruleSorting" :sorting-options="ruleSortingOptions" :default-sorting="defaultRuleSorting" :data="ruleSummaries" :columns="ruleColumns" :loading="loadingRules" empty="暂无地图称号规则。" row-key="ruleId" table-key="unified-map-achievement-rules" table-min-width="900px" class="admin-table">
        <template #titleName-cell="{ row }"><strong>{{ row.original.titleName }}</strong><small class="type-caption">{{ row.original.kind }} · {{ scopeLabel(row.original.defaultScope) }}</small></template>
        <template #effectiveMapCount-cell="{ row }"><span>{{ row.original.effectiveMapCount }} 张</span></template>
        <template #exceptionCount-cell="{ row }"><span>{{ row.original.exceptionCount }} 项</span></template>
        <template #displayKind-cell="{ row }"><span>{{ displayKindLabel(row.original.displayKind) }}</span></template>
        <template #submissionMode-cell="{ row }"><span>{{ submissionModeLabel(row.original.submissionMode) }}</span></template>
        <template #status-cell="{ row }"><StatusBadge :label="statusLabel(row.original.status)" :tone="statusTone(row.original.status)" /></template>
        <template #actions-cell="{ row }"><div class="table-actions"><UButton label="编辑规则" size="sm" color="neutral" variant="outline" @click="editRule(row.original)" /></div></template>
      </AdminDataTable>
    </template>

    <template v-else>
      <div class="section-toolbar"><USelect v-model="selectedMapId" aria-label="选择地图" :items="props.maps.map((map) => ({ label: map.mapName, value: map.mapId }))" /><span class="type-caption">{{ mapName }} · {{ mapRows.length }} 项</span></div>
      <AdminDataTable v-model:sorting="mapSorting" :sorting-options="mapSortingOptions" :default-sorting="defaultMapSorting" :data="mapRows" :columns="mapColumns" :loading="loadingRules || props.loading" empty="暂无地图成就。" :row-key="(row) => row.rowId" :table-key="`unified-map-achievements-${selectedMapId}`" table-min-width="860px" class="admin-table">
        <template #titleName-cell="{ row }"><strong>{{ row.original.titleName }}</strong><small class="type-caption">{{ row.original.rowType === 'projection' ? `${mapVariantLabel(row.original.rule?.mapVariant)} · ${row.original.inheritance?.projected ? '有效结果' : '未启用规则'}` : `${mapVariantLabel(row.original.challenge?.mapVariant)} · 真实单图挑战` }}</small></template>
        <template #source-cell="{ row }"><span>{{ row.original.source }}</span></template>
        <template #condition-cell="{ row }"><span class="condition-cell">{{ row.original.condition || '暂无记录' }}</span></template>
        <template #submissionMode-cell="{ row }"><span>{{ row.original.submissionMode }}</span></template>
        <template #status-cell="{ row }"><StatusBadge :label="statusLabel(row.original.status)" :tone="statusTone(row.original.status)" /></template>
        <template #actions-cell="{ row }"><div class="table-actions"><template v-if="row.original.rowType === 'projection'"><UButton label="编辑规则" size="sm" color="neutral" variant="outline" @click="editRule(row.original.rule)" /><UButton label="编辑例外" size="sm" color="neutral" variant="soft" @click="openException(row.original.inheritance!)" /></template><UButton v-else label="编辑挑战" size="sm" color="neutral" variant="outline" @click="emit('editChallenge', row.original.challenge!)" /></div></template>
      </AdminDataTable>
      <AdminResponsiveDialog :open="selectedException !== null" :title="selectedException ? `${mapName} · 地图例外` : ''" size="md" :dismissible="!saving" @update:open="(open) => { if (!open) closeException(); }">
        <template #body><form v-if="selectedException" id="map-exception-editor" class="exception-editor" @submit.prevent="saveException"><UFormField label="例外状态"><USwitch v-model="exceptionDraft.enabled" label="在此地图启用规则" /></UFormField><UFormField label="覆盖完成条件"><UTextarea :model-value="exceptionDraft.condition ?? ''" placeholder="留空继承规则" :disabled="saving" @update:model-value="exceptionDraft.condition = $event || null" /></UFormField><UFormField label="覆盖截图规则"><UTextarea :model-value="exceptionDraft.evidenceRule ?? ''" placeholder="留空继承规则" :disabled="saving" @update:model-value="exceptionDraft.evidenceRule = $event || null" /></UFormField><UFormField label="覆盖提交方式"><USelect v-model="exceptionDraft.submissionMode" :items="[{ label: '继承规则', value: null }, { label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :disabled="saving" /></UFormField><UFormField label="覆盖称号槽位"><USelect v-model="exceptionDraft.slot" :items="[{ label: '继承规则', value: null }, { label: '开拓者槽位', value: 'pioneer' }, { label: '征服者槽位', value: 'conqueror' }, { label: '主宰槽位', value: 'dominator' }]" :disabled="saving" /></UFormField></form></template>
        <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeException" /><UButton label="保存例外" type="submit" form="map-exception-editor" :loading="saving" /></template>
      </AdminResponsiveDialog>
    </template>

    <AdminResponsiveDialog v-model:open="dialogOpen" :title="editingRule ? '编辑地图称号规则' : '新建地图称号规则'" size="lg">
      <template #body><form id="map-title-rule-editor" class="rule-editor" @submit.prevent="saveRule"><UFormField label="称号键" required><UInput v-model="form.titleKey" required :disabled="Boolean(editingRule) || saving" /></UFormField><UFormField label="规则类型" required><UInput v-model="form.kind" required :disabled="saving" /></UFormField><UFormField class="rule-editor__wide" label="完成条件" required><UTextarea v-model="form.condition" required :disabled="saving" /></UFormField><UFormField class="rule-editor__wide" label="截图规则" required><UTextarea v-model="form.evidenceRule" required :disabled="saving" /></UFormField><UFormField label="适用范围"><USelect v-model="form.defaultScope" :items="scopeOptions" :disabled="saving || form.kind.trim().toLocaleLowerCase() === 'pioneer'" /></UFormField><UFormField label="地图版本"><USelect v-model="form.mapVariant" :items="[{ label: '正式版', value: undefined }, { label: '经典版', value: 'classic' }]" :disabled="saving" /></UFormField><UFormField label="展示方式"><USelect v-model="form.displayKind" :items="[{ label: '固定称号', value: 'fixed' }, { label: '地图名 + 开拓者', value: 'map_pioneer' }, { label: '地图名 + 后缀称号', value: 'map_name_suffix' }]" :disabled="saving" /></UFormField><UFormField label="提交方式"><USelect v-model="form.submissionMode" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" :disabled="saving" /></UFormField><UFormField label="称号槽位"><USelect v-model="form.slot" :items="[{ label: '无指定槽位', value: null }, { label: '开拓者槽位', value: 'pioneer' }, { label: '征服者槽位', value: 'conqueror' }, { label: '主宰槽位', value: 'dominator' }]" :disabled="saving" /></UFormField><UFormField label="状态"><USelect v-model="form.status" :items="[{ label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" :disabled="saving" /></UFormField><UFormField label="引入版本" required><UInput v-model="form.introducedVersion" required :disabled="saving" /></UFormField><UFormField v-if="form.status === 'sunsetting'" label="计划下线版本" required><UInput v-model="form.retiredVersion" required :disabled="saving" /></UFormField></form></template>
      <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeRuleForm" /><UButton label="保存规则" type="submit" form="map-title-rule-editor" :loading="saving" /></template>
    </AdminResponsiveDialog>
  </section>
</template>

<style scoped>
.map-achievement-workspace { display: grid; gap: 16px; }
.section-heading,
.section-toolbar { display: flex; align-items: end; justify-content: space-between; gap: 12px; }
.section-heading .type-headline { margin: 3px 0 0; }
.section-heading .eyebrow { margin: 0; }
.section-toolbar { align-items: center; }
.section-toolbar > :first-child { min-width: min(18rem, 100%); }
.table-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 4px; }

.map-achievement-workspace :deep(table[data-slot="base"]) { min-width: 860px; }
.map-achievement-workspace :deep(.table-actions [data-slot="base"]),
.map-achievement-workspace :deep(.table-actions [data-slot="base"]:hover),
.map-achievement-workspace :deep(.table-actions [data-slot="base"]:focus-visible),
.map-achievement-workspace :deep(.table-actions [data-slot="base"]:active) {
  transform: none !important;
}
.condition-cell { display: -webkit-box; overflow: hidden; color: var(--muted); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.rule-editor, .exception-editor { display: grid; gap: 16px; }
.rule-editor { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 24px; gap: 20px; }
.rule-editor__wide { grid-column: 1 / -1; }
.exception-editor { padding: 24px; }
.map-achievement-workspace :deep(.admin-data-table__sort-control) { min-width: 15rem; }
@media (max-width: 560px) {
  .section-heading, .section-toolbar { align-items: flex-start; flex-wrap: wrap; }
  .rule-editor { grid-template-columns: 1fr; }
  .rule-editor__wide { grid-column: auto; }
  .section-toolbar > :first-child { width: 100%; }
}
</style>
