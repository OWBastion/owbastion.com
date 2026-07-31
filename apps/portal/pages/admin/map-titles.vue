<script setup lang="ts">
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "地图称号规则 · 躲避堡垒 3" });

type Rule = { ruleId: string; titleKey: string; titleName: string; kind: string; condition: string; evidenceRule: string; submissionMode: "manual" | "automatic"; displayKind: "fixed" | "map_pioneer" | "map_name_suffix"; slot: "pioneer" | "conqueror" | "dominator" | null; defaultScope: "all_active" | "explicit"; status: "active" | "sunsetting" | "retired"; introducedVersion: string; retiredVersion: string | null };
type MapItem = { mapId: string; mapName: string };
type Inheritance = { mapId: string; rule: Rule; projected: boolean; source: "map_title_rule"; effective: { condition: string; evidenceRule: string; submissionMode: "manual" | "automatic"; slot: Rule["slot"] } | null; exception: { enabled: boolean; condition: string | null; evidenceRule: string | null; submissionMode: "manual" | "automatic" | null; slot: Rule["slot"] } | null };
type RuleForm = Omit<Rule, "ruleId" | "titleName" | "retiredVersion"> & { retiredVersion: string };

const api = useAdminApi();
const toast = useToast();
const rules = ref<Rule[]>([]);
const maps = ref<MapItem[]>([]);
const selectedMapId = ref("");
const inheritance = ref<Inheritance[]>([]);
const loading = ref(true);
const saving = ref(false);
const errorMessage = ref("");
const editing = ref<Rule | null>(null);
const formOpen = shallowRef(false);
const form = reactive<RuleForm>({ titleKey: "", kind: "", condition: "", evidenceRule: "", submissionMode: "manual", displayKind: "fixed", slot: null, defaultScope: "all_active", status: "active", introducedVersion: "", retiredVersion: "" });

const resetForm = (rule?: Rule) => Object.assign(form, rule ? { ...rule, retiredVersion: rule.retiredVersion ?? "" } : { titleKey: "", kind: "", condition: "", evidenceRule: "", submissionMode: "manual", displayKind: "fixed", slot: null, defaultScope: "all_active", status: "active", introducedVersion: "", retiredVersion: "" });
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    const [ruleResult, mapResult] = await Promise.all([api<{ items: Rule[] }>("/v1/map-title-rules"), api<{ items: MapItem[] }>("/v1/maps")]);
    rules.value = ruleResult.items; maps.value = mapResult.items;
    selectedMapId.value ||= maps.value[0]?.mapId ?? "";
    if (selectedMapId.value) await loadInheritance();
  } catch (error) { errorMessage.value = portalErrorDetails(error, "无法读取地图称号规则，请稍后重试。").description; }
  finally { loading.value = false; }
}
async function loadInheritance() {
  if (!selectedMapId.value) return;
  const result = await api<{ items: Inheritance[] }>(`/v1/maps/${selectedMapId.value}/map-title-inheritance`);
  inheritance.value = result.items;
}
function edit(rule?: Rule) { editing.value = rule ?? null; resetForm(rule); formOpen.value = true; }
function closeForm() { editing.value = null; formOpen.value = false; resetForm(); }
const dialogOpen = computed({ get: () => formOpen.value, set: (open: boolean) => { if (open) formOpen.value = true; else closeForm(); } });
async function saveRule() {
  saving.value = true;
  const body = { contractVersion: "1", ...form, retiredVersion: form.status === "sunsetting" ? form.retiredVersion.trim() || null : null };
  try {
    if (editing.value) await api(`/v1/map-title-rules/${editing.value.ruleId}`, { method: "PUT", body, headers: { "idempotency-key": createRequestId() } });
    else await api("/v1/map-title-rules", { method: "POST", body, headers: { "idempotency-key": createRequestId() } });
    toast.add({ title: editing.value ? "规则已更新" : "规则已创建", color: "success" }); closeForm(); await load();
  } catch (error) { errorMessage.value = portalErrorDetails(error, "无法保存地图称号规则。").description; }
  finally { saving.value = false; }
}
async function saveException(item: Inheritance) {
  saving.value = true;
  const exception = item.exception ?? { enabled: item.projected, condition: null, evidenceRule: null, submissionMode: null, slot: null };
  try {
    await api(`/v1/maps/${item.mapId}/map-title-rules/${item.rule.ruleId}/exception`, { method: "PUT", headers: { "idempotency-key": createRequestId() }, body: { contractVersion: "1", ...exception } });
    toast.add({ title: "地图例外已保存", color: "success" }); await loadInheritance();
  } catch (error) { errorMessage.value = portalErrorDetails(error, "无法保存地图例外。").description; }
  finally { saving.value = false; }
}
onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="地图称号规则" :count="loading ? '读取中…' : `${rules.length} 条`">
    <div class="space-y-6">
      <UAlert v-if="errorMessage" color="error" :description="errorMessage" />
      <UCard>
        <template #header><div class="flex items-center justify-between gap-3"><div><p class="text-sm font-medium">权威规则</p><p class="text-sm text-muted">规则定义称号关联、条件、展示与生命周期；不会为每张地图创建挑战记录。</p></div><UButton label="新建规则" size="sm" @click="edit()" /></div></template>
        <div class="space-y-3">
          <div v-for="rule in rules" :key="rule.ruleId" class="flex items-start justify-between gap-4 border-b border-default pb-3 last:border-0">
            <div><p class="font-medium">{{ rule.titleName }} <span class="text-muted">{{ rule.kind }}</span></p><p class="text-sm text-muted">{{ rule.titleKey }} · {{ rule.defaultScope === 'all_active' ? '全部有效地图' : '仅例外地图' }} · {{ rule.displayKind }}</p></div>
            <UButton label="编辑规则" size="xs" color="neutral" variant="outline" @click="edit(rule)" />
          </div>
          <p v-if="!loading && !rules.length" class="text-sm text-muted">暂无规则。</p>
        </div>
      </UCard>
      <AdminResponsiveDialog v-model:open="dialogOpen" :title="editing ? '编辑权威规则' : '新建权威规则'" size="lg">
        <template #body>
          <form id="map-title-rule-editor" class="grid gap-3 md:grid-cols-2" @submit.prevent="saveRule">
            <UFormField label="称号键" required><UInput v-model="form.titleKey" required /></UFormField><UFormField label="规则类型" required><UInput v-model="form.kind" required /></UFormField>
            <UFormField class="md:col-span-2" label="完成条件" required><UTextarea v-model="form.condition" required /></UFormField><UFormField class="md:col-span-2" label="截图规则" required><UTextarea v-model="form.evidenceRule" required /></UFormField>
            <UFormField label="适用范围"><USelect v-model="form.defaultScope" :items="[{ label: '全部有效地图', value: 'all_active' }, { label: '仅例外地图', value: 'explicit' }]" /></UFormField><UFormField label="展示方式"><USelect v-model="form.displayKind" :items="[{ label: '固定', value: 'fixed' }, { label: '地图先锋', value: 'map_pioneer' }, { label: '地图名称后缀', value: 'map_name_suffix' }]" /></UFormField>
            <UFormField label="提交方式"><USelect v-model="form.submissionMode" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" /></UFormField><UFormField label="称号槽位"><USelect v-model="form.slot" :items="[{ label: '无命名槽位', value: null }, { label: '先锋', value: 'pioneer' }, { label: '征服者', value: 'conqueror' }, { label: '支配者', value: 'dominator' }]" /></UFormField>
            <UFormField label="状态"><USelect v-model="form.status" :items="[{ label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" /></UFormField><UFormField label="引入版本" required><UInput v-model="form.introducedVersion" required /></UFormField>
            <UFormField v-if="form.status === 'sunsetting'" label="计划下线版本" required><UInput v-model="form.retiredVersion" required /></UFormField>
          </form>
        </template>
        <template #footer><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeForm" /><UButton type="submit" form="map-title-rule-editor" label="保存规则" :loading="saving" /></template>
      </AdminResponsiveDialog>
      <UCard>
        <template #header><div><p class="text-sm font-medium">地图继承与例外</p><p class="text-sm text-muted">每一项都是规则投影，只能在此设置允许的地图例外字段。</p></div></template>
        <USelect v-model="selectedMapId" :items="maps.map((map) => ({ label: map.mapName, value: map.mapId }))" @update:model-value="loadInheritance" />
        <div class="mt-4 space-y-3">
          <div v-for="item in inheritance" :key="item.rule.ruleId" class="rounded border border-default p-3">
            <div class="flex items-start justify-between gap-3"><div><p class="font-medium">{{ item.rule.titleName }}</p><p class="text-sm text-muted">来源：{{ item.source === 'map_title_rule' ? `规则 ${item.rule.kind}` : item.source }} · {{ item.projected ? '已投影，只读' : '未投影' }}</p></div><USwitch v-model="(item.exception ??= { enabled: item.projected, condition: null, evidenceRule: null, submissionMode: null, slot: null }).enabled" label="启用例外" /></div>
            <div class="mt-3 grid gap-3 md:grid-cols-2"><UFormField label="覆盖完成条件"><UInput :model-value="item.exception!.condition ?? ''" placeholder="留空继承规则" @update:model-value="item.exception!.condition = $event || null" /></UFormField><UFormField label="覆盖提交方式"><USelect v-model="item.exception!.submissionMode" :items="[{ label: '继承规则', value: null }, { label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" /></UFormField></div>
            <div class="mt-3 flex justify-end"><UButton label="保存例外" size="xs" :loading="saving" @click="saveException(item)" /></div>
          </div>
          <p v-if="selectedMapId && !inheritance.length" class="text-sm text-muted">暂无可继承的地图称号规则。</p>
        </div>
      </UCard>
    </div>
  </AdminWorkspace>
</template>
