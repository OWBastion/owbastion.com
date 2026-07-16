<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "成就管理 · 躲避堡垒 3" });

type AchievementStatus = "active" | "sunsetting" | "retired";
type TitleAchievement = {
  challengeId: string;
  family: "achievement";
  type: "title_achievement";
  titleName: string;
  category: string;
  categoryOverride: string | null;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  status: AchievementStatus;
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
};
type MapAchievement = {
  challengeId: string;
  family: "map";
  type: "map_completion";
  name: string;
  mapName: string;
  difficulty?: string;
  status: AchievementStatus;
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
};
type CatalogTitle = {
  challengeId: string;
  family: "title_catalog";
  type: "title_catalog";
  titleKey: string;
  titleName: string;
  category: string;
  condition: string;
  availability: "active" | "retired";
  scope: "global" | "map";
  displayKind: "fixed" | "map_pioneer" | "map_name_suffix";
  status: "active" | "retired";
  gameVersion: string;
  hasChallenge: false;
};
type AdminAchievement = TitleAchievement | MapAchievement | CatalogTitle;

const api = useAdminApi();
const items = ref<AdminAchievement[]>([]);
const status = ref<"all" | AchievementStatus>("all");
const editingId = ref<string | null>(null);
const planningId = ref<string | null>(null);
const retirementVersions = reactive<Record<string, string>>({});
const endTarget = ref<AdminAchievement | null>(null);
const endTrigger = ref<HTMLElement | null>(null);
const loading = ref(true);
const savingId = ref<string | null>(null);
const errorMessage = ref("");
const actionMessage = ref("");

const isTitle = (item: AdminAchievement): item is TitleAchievement | CatalogTitle => item.family === "achievement" || item.family === "title_catalog";
const isChallengeTitle = (item: AdminAchievement): item is TitleAchievement => item.family === "achievement";
const isMap = (item: AdminAchievement): item is MapAchievement => item.family === "map";
const itemName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
const statusText = (value: AchievementStatus) => value === "active" ? "已开放" : value === "sunsetting" ? "即将结束" : "已下线";
const statusTone = (value: AchievementStatus) => value === "active" ? "success" : "warning";
const isSaving = (item: AdminAchievement) => savingId.value === item.challengeId;
const titleGroups = computed(() => {
  const groups = new Map<string, Array<TitleAchievement | CatalogTitle>>();
  for (const item of items.value) {
    if (!isTitle(item)) continue;
    groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  }
  return [...groups].map(([category, challenges]) => ({ category, challenges }));
});
const mapGroups = computed(() => {
  const groups = new Map<string, MapAchievement[]>();
  for (const item of items.value) {
    if (isTitle(item)) continue;
    groups.set(item.mapName, [...(groups.get(item.mapName) ?? []), item]);
  }
  return [...groups].map(([mapName, challenges]) => ({ mapName, challenges }));
});

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const query = new URLSearchParams();
    if (status.value !== "all") query.set("status", status.value);
    const response = await api<{ items: AdminAchievement[] }>(`/v1/achievements${query.size ? `?${query}` : ""}`);
    items.value = response.items;
    for (const item of items.value) if (isChallengeTitle(item) || isMap(item)) retirementVersions[item.challengeId] ??= item.retiredVersion ?? "";
    if (editingId.value && !items.value.some((item) => item.challengeId === editingId.value)) editingId.value = null;
  } catch (error: any) {
    errorMessage.value = error?.data?.error?.message ?? "无法读取成就目录，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

function titleUpdate(item: TitleAchievement, status: AchievementStatus = item.status, retiredVersion?: string) {
  return {
    family: "achievement",
    condition: item.condition,
    evidenceRule: item.evidenceRule,
    submissionMode: item.submissionMode,
    categoryOverride: item.categoryOverride?.trim() || null,
    status,
    ...(status === "sunsetting" ? { retiredVersion: retiredVersion ?? item.retiredVersion ?? "" } : {}),
  };
}

function updatePayload(item: AdminAchievement, status: AchievementStatus, retiredVersion?: string) {
  if (isChallengeTitle(item)) return titleUpdate(item, status, retiredVersion);
  if (isMap(item)) return { family: "map", status, ...(status === "sunsetting" ? { retiredVersion: retiredVersion ?? item.retiredVersion ?? "" } : {}) };
  throw new Error("CATALOG_TITLE_UPDATE_REQUIRES_CATALOG_ENDPOINT");
}

async function saveCatalogTitle(item: CatalogTitle, status: "active" | "retired") {
  savingId.value = item.challengeId;
  errorMessage.value = "";
  actionMessage.value = "保存中…";
  try {
    await api<void>(`/v1/titles/${encodeURIComponent(item.titleKey)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", status },
    });
    actionMessage.value = status === "active" ? "称号已重新开放" : "称号已下线";
    await load();
  } catch (error: any) {
    actionMessage.value = "";
    errorMessage.value = error?.data?.error?.message ?? "无法保存称号状态，请稍后重试。";
  } finally {
    savingId.value = null;
  }
}

async function save(item: AdminAchievement, body: Record<string, unknown>, message: string) {
  savingId.value = item.challengeId;
  errorMessage.value = "";
  actionMessage.value = "保存中…";
  try {
    await api<void>(`/v1/achievements/${encodeURIComponent(item.challengeId)}`, {
      method: "PUT",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", ...body },
    });
    actionMessage.value = message;
    await load();
    return true;
  } catch (error: any) {
    actionMessage.value = "";
    errorMessage.value = error?.data?.error?.message ?? "无法保存成就规则，请稍后重试。";
    return false;
  } finally {
    savingId.value = null;
  }
}

async function saveTitle(item: TitleAchievement) {
  if (await save(item, titleUpdate(item), "成就规则已保存")) editingId.value = null;
}

async function planSunsetting(item: AdminAchievement) {
  const version = retirementVersions[item.challengeId]?.trim();
  if (!version) return;
  if (await save(item, updatePayload(item, "sunsetting", version), item.status === "active" ? "挑战已计划下线" : "计划下线版本已保存")) planningId.value = null;
}

async function reopen(item: AdminAchievement) {
  if (item.family === "title_catalog") return saveCatalogTitle(item, "active");
  await save(item, updatePayload(item, "active"), "挑战已重新开放");
}

function openEnd(item: AdminAchievement, trigger: EventTarget | null) {
  endTarget.value = item;
  endTrigger.value = trigger instanceof HTMLElement ? trigger : null;
}

function closeEnd() {
  const trigger = endTrigger.value;
  endTarget.value = null;
  endTrigger.value = null;
  void nextTick(() => trigger?.isConnected && trigger.focus());
}

async function endChallenge() {
  const item = endTarget.value;
  if (!item) return;
  if (item.family === "title_catalog") {
    await saveCatalogTitle(item, "retired");
    closeEnd();
    return;
  }
  if (await save(item, updatePayload(item, "retired"), "挑战已下线")) closeEnd();
}

watch(status, () => { void load(); });
onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="成就管理" :count="loading ? '读取中…' : `${items.length} 项`">
    <template #actions><NuxtLink class="migration-link" to="/admin/titles">称号迁移</NuxtLink></template>
    <template #messages><p v-if="errorMessage" class="admin-alert" role="alert">{{ errorMessage }}</p><p v-if="actionMessage" class="admin-feedback" role="status">{{ actionMessage }}</p></template>
    <template #toolbar><div class="admin-toolbar"><PortalSelect v-model="status" aria-label="筛选成就状态" :items="[{ label: '全部状态', value: 'all' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已下线', value: 'retired' }]" /></div></template>

    <section class="catalog" aria-labelledby="catalog-title">
      <div class="catalog-heading"><h2 id="catalog-title">已登记成就</h2></div>

      <div v-if="!loading && items.length" class="catalog-groups">
        <section class="catalog-section" aria-labelledby="title-achievements-title">
          <div class="section-heading"><div><p class="eyebrow">通用成就</p><h3 id="title-achievements-title">称号挑战</h3></div><span>{{ items.filter(isTitle).length }} 项</span></div>
          <div v-if="titleGroups.length" class="series-groups">
            <section v-for="group in titleGroups" :key="group.category" class="series-group" :aria-labelledby="`series-${group.category}`">
              <div class="group-heading"><h4 :id="`series-${group.category}`">{{ group.category }}</h4><span>{{ group.challenges.length }} 项</span></div>
              <article v-for="item in group.challenges" :key="item.challengeId" class="achievement-card surface-card" :class="{ editing: editingId === item.challengeId }">
                <div class="card-summary"><div class="card-copy"><strong>{{ item.titleName }}</strong><span>{{ item.condition }}</span><small v-if="isChallengeTitle(item)">引入版本 {{ item.introducedVersion }} · {{ item.status === 'active' ? `当前 ${item.gameVersion}` : `${statusText(item.status)} ｜ ${item.retiredVersion}` }}</small><small v-else>{{ item.scope === 'map' ? '地图称号' : '目录称号' }} · {{ item.gameVersion }} · 未登记挑战条件</small></div><StatusBadge :label="isChallengeTitle(item) ? statusText(item.status) : item.status === 'active' ? '未开放' : '已下线'" :tone="isChallengeTitle(item) ? statusTone(item.status) : 'warning'" /></div>
                <div class="card-actions"><template v-if="isChallengeTitle(item)"><PortalButton tone="secondary" type="button" :disabled="isSaving(item)" :aria-expanded="editingId === item.challengeId" @click="editingId = editingId === item.challengeId ? null : item.challengeId">{{ editingId === item.challengeId ? '收起编辑' : '编辑规则' }}</PortalButton><template v-if="item.status !== 'retired'"><UPopover :open="planningId === item.challengeId" @update:open="(open) => { planningId = open ? item.challengeId : null; }"><PortalButton tone="secondary" type="button" :disabled="isSaving(item)">{{ item.status === 'active' ? '计划下线' : '更新计划' }}</PortalButton><template #content><UCard class="plan-popover-card"><form class="plan-popover" @submit.prevent="planSunsetting(item)"><PortalField label="计划下线版本" required><PortalInput v-model="retirementVersions[item.challengeId]" required placeholder="例如 26.0713.1" :disabled="isSaving(item)" /></PortalField><PortalButton type="submit" :loading="isSaving(item)" :disabled="!retirementVersions[item.challengeId]?.trim()">{{ item.status === 'active' ? '确认计划' : '保存计划' }}</PortalButton></form></UCard></template></UPopover><PortalButton tone="danger" type="button" :disabled="isSaving(item)" @click="openEnd(item, $event.currentTarget)">{{ item.status === 'active' ? '结束挑战' : '立即结束' }}</PortalButton><PortalButton v-if="item.status === 'sunsetting'" tone="text" type="button" :disabled="isSaving(item)" @click="reopen(item)">恢复开放</PortalButton></template><PortalButton v-else tone="secondary" type="button" :disabled="isSaving(item)" @click="reopen(item)">重新开放</PortalButton></template><template v-else><PortalButton v-if="item.status === 'active'" tone="danger" type="button" :disabled="isSaving(item)" @click="openEnd(item, $event.currentTarget)">下线称号</PortalButton><PortalButton v-else tone="secondary" type="button" :disabled="isSaving(item)" @click="reopen(item)">重新开放</PortalButton></template></div>
                <form v-if="isChallengeTitle(item) && editingId === item.challengeId" class="editor" @submit.prevent="saveTitle(item)"><PortalField label="完成条件" required><PortalTextarea v-model="item.condition" required maxlength="1024" :disabled="isSaving(item)" /></PortalField><PortalField label="截图规则" required><PortalTextarea v-model="item.evidenceRule" required maxlength="2048" :disabled="isSaving(item)" /></PortalField><PortalField label="提交方式"><PortalSelect v-model="item.submissionMode" :disabled="isSaving(item)" :items="[{ label: '手动提交', value: 'manual' }, { label: '自动提交', value: 'automatic' }]" /></PortalField><PortalField label="展示分类" :hint="`留空则使用 Bastion 系列“${item.category}”`"><PortalInput v-model="item.categoryOverride" :disabled="isSaving(item)" :placeholder="item.category" maxlength="128" /></PortalField><div class="editor-actions"><PortalButton tone="secondary" type="button" :disabled="isSaving(item)" @click="editingId = null">取消</PortalButton><PortalButton :loading="isSaving(item)" type="submit">保存规则</PortalButton></div></form>
              </article>
            </section>
          </div>
          <p v-else class="empty surface-card">暂无记录。</p>
        </section>

        <section class="catalog-section" aria-labelledby="map-achievements-title">
          <div class="section-heading"><div><p class="eyebrow">地图挑战</p><h3 id="map-achievements-title">按地图管理</h3></div><span>{{ items.filter((item) => !isTitle(item)).length }} 项</span></div>
          <div v-if="mapGroups.length" class="map-card-grid">
            <article v-for="group in mapGroups" :key="group.mapName" class="map-card surface-card" :aria-labelledby="`map-${group.mapName}`">
              <div class="map-card-heading"><h4 :id="`map-${group.mapName}`">{{ group.mapName }}</h4><span>{{ group.challenges.length }} 项</span></div>
              <div class="map-challenges">
                <article v-for="item in group.challenges" :key="item.challengeId" class="map-challenge">
                  <div class="card-summary"><div class="card-copy"><strong>{{ item.name }}</strong><span>{{ item.difficulty ?? '地图通关' }}</span><small>引入版本 {{ item.introducedVersion }} · 地图、难度和版本由 Bastion 发布快照维护。</small></div><StatusBadge :label="statusText(item.status)" :tone="statusTone(item.status)" /></div>
                  <div class="card-actions"><template v-if="item.status !== 'retired'"><UPopover :open="planningId === item.challengeId" @update:open="(open) => { planningId = open ? item.challengeId : null; }"><PortalButton tone="secondary" type="button" :disabled="isSaving(item)">{{ item.status === 'active' ? '计划下线' : '更新计划' }}</PortalButton><template #content><UCard class="plan-popover-card"><form class="plan-popover" @submit.prevent="planSunsetting(item)"><PortalField label="计划下线版本" required><PortalInput v-model="retirementVersions[item.challengeId]" required placeholder="例如 26.0713.1" :disabled="isSaving(item)" /></PortalField><PortalButton type="submit" :loading="isSaving(item)" :disabled="!retirementVersions[item.challengeId]?.trim()">{{ item.status === 'active' ? '确认计划' : '保存计划' }}</PortalButton></form></UCard></template></UPopover><PortalButton tone="danger" type="button" :disabled="isSaving(item)" @click="openEnd(item, $event.currentTarget)">{{ item.status === 'active' ? '结束挑战' : '立即结束' }}</PortalButton><PortalButton v-if="item.status === 'sunsetting'" tone="text" type="button" :disabled="isSaving(item)" @click="reopen(item)">恢复开放</PortalButton></template><PortalButton v-else tone="secondary" type="button" :disabled="isSaving(item)" @click="reopen(item)">重新开放</PortalButton></div>
                </article>
              </div>
            </article>
          </div>
          <p v-else class="empty surface-card">暂无记录。</p>
        </section>
      </div>
      <p v-else-if="!loading" class="empty surface-card">暂无记录。</p>
    </section>

    <UModal :open="endTarget !== null" title="结束挑战" @update:open="(open) => { if (!open) closeEnd(); }"><template #body><form v-if="endTarget" class="end-dialog" @submit.prevent="endChallenge"><p>结束后不再接受新的截图提交。</p><div class="editor-actions"><PortalButton tone="secondary" type="button" :disabled="isSaving(endTarget)" @click="closeEnd">取消</PortalButton><PortalButton tone="danger" type="submit" :loading="isSaving(endTarget)">结束挑战</PortalButton></div></form></template></UModal>
  </AdminWorkspace>
</template>

<style scoped>
.map-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.map-card { display: grid; align-content: start; gap: 16px; padding: 18px; }
.map-card-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.map-card-heading h4 { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 1.05rem; letter-spacing: -.025em; }
.map-card-heading span { flex: 0 0 auto; color: var(--quiet); font-size: .78rem; }
.map-challenges { display: grid; gap: 10px; }
.map-challenge { display: grid; gap: 13px; min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); }
.map-card, .map-challenge { transition: transform 140ms ease, border-color 140ms ease, background 140ms ease; }
.map-card:focus-within, .map-challenge:focus-within { border-color: var(--line-strong); }
.catalog { max-width: 920px; }.catalog-heading, .section-heading, .group-heading, .card-summary, .card-actions, .editor-actions { display: flex; align-items: center; gap: 12px; }.catalog-heading { margin-bottom: 2px; }.catalog-heading h2 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.6rem); letter-spacing: -.04em; }.section-heading > span, .group-heading > span { margin-left: auto; }.migration-link, .section-heading > span, .group-heading > span, .card-copy small { color: var(--quiet); font-size: .78rem; }.migration-link { text-decoration: none; }.migration-link:hover { color: var(--text); }.catalog-groups, .catalog-section, .series-groups, .series-group { display: grid; gap: 14px; }.catalog-section + .catalog-section { margin-top: 52px; }.section-heading { align-items: end; }.section-heading h3 { margin: 3px 0 0; font-size: clamp(1.25rem, 2vw, 1.6rem); letter-spacing: -.035em; }.section-heading .eyebrow { margin: 0; }.series-group { gap: 9px; }.group-heading h4 { margin: 0; font-size: .92rem; }.achievement-card { display: grid; gap: 14px; padding: 17px 18px; }.achievement-card.editing { border-color: var(--line-strong); }.card-summary { align-items: flex-start; justify-content: space-between; }.card-copy { display: grid; gap: 5px; min-width: 0; }.card-copy strong { overflow-wrap: anywhere; color: var(--text); font-size: 1rem; }.card-copy > span { color: var(--muted); font-size: .84rem; line-height: 1.45; }.card-copy small { line-height: 1.45; }.card-actions { flex-wrap: wrap; }.editor, .end-dialog, .plan-popover { display: grid; gap: 16px; }.editor { padding-top: 18px; border-top: 1px solid var(--line); }.editor-actions { justify-content: flex-end; }.plan-popover-card { width: min(280px, calc(100vw - 32px)); }.empty { margin: 0; padding: 28px; color: var(--quiet); text-align: center; }.end-dialog p { margin: 0; color: var(--muted); font-size: .86rem; line-height: 1.55; }.achievement-card, .portal-button { transition: transform 140ms ease, border-color 140ms ease, background 140ms ease; }.achievement-card:focus-within { border-color: var(--line-strong); }.portal-button:active { transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .achievement-card, .portal-button { transition: opacity 140ms ease, border-color 140ms ease, background 140ms ease; }.portal-button:active { transform: none; } }
@media (max-width: 560px) { .catalog-heading, .section-heading, .group-heading { align-items: flex-start; flex-wrap: wrap; }.catalog-heading > span, .section-heading > span, .group-heading > span { margin-left: 0; }.card-summary { gap: 10px; }.editor-actions { justify-content: stretch; }.editor-actions .portal-button { flex: 1; } }
</style>
