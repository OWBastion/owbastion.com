<script setup lang="ts">
import type {
  AdminChallengeLifecycleResponse,
  AdminTitleChallenge,
  AdminTitleChallengeListResponse,
  AdminTitleSummary,
  AdminTitleSummaryListResponse,
  AdminTitleUpdateResponse,
} from "./admin-title-types";
import { challengeWindowLabel, submissionModeLabel, titleAcquisitionLabel, titleColorLabel, titleDisplayKindLabel, titleScopeLabel } from "./admin-title-types";
import type { AdminMap, DerivedStatus, StandaloneModeOption } from "./admin-achievement-types";
import { achievementStatusLabel, achievementStatusTone, challengeDisplayStatus } from "./admin-achievement-types";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";

const api = useAdminApi();
const toast = useToast();
const titles = ref<AdminTitleSummary[]>([]);
const maps = ref<AdminMap[]>([]);
const modes = ref<StandaloneModeOption[]>([]);
const errorMessage = ref("");
const expandedKeys = reactive(new Set<string>());
const challengesByTitle = reactive(new Map<string, AdminTitleChallenge[]>());
const challengesLoading = reactive(new Set<string>());
const challengesError = reactive(new Map<string, string>());
const savingKey = ref<string | null>(null);
const planningChallengeId = ref<string | null>(null);
const retirementVersions = reactive<Record<string, string>>({});

const search = shallowRef("");
const categoryFilter = shallowRef("all");
const scopeFilter = shallowRef<"all" | "global" | "map">("all");
const statusFilter = shallowRef<"all" | DerivedStatus>("all");
const sortMode = shallowRef<"category_label" | "label" | "status">("category_label");

const titleDialogOpen = shallowRef(false);
const titleDialogMode = shallowRef<"create" | "edit">("create");
const editingTitle = shallowRef<AdminTitleSummary | null>(null);
const titleDialogSaving = shallowRef(false);
const titleDialogError = shallowRef("");
const keyConflict = shallowRef<string | null>(null);

const challengeDialogOpen = shallowRef(false);
const challengeDialogMode = shallowRef<"add" | "edit">("add");
const challengeDialogTitle = shallowRef<AdminTitleSummary | null>(null);
const editingChallenge = shallowRef<AdminTitleChallenge | null>(null);
const challengeSaving = shallowRef(false);
const challengeDialogError = shallowRef("");

const categories = computed(() => [...new Set(titles.value.map((title) => title.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")));

const searchHaystack = (title: AdminTitleSummary) => {
  const conditions = (challengesByTitle.get(title.titleKey) ?? []).map((challenge) => challenge.condition).join(" ");
  return `${title.label} ${title.titleKey} ${title.category} ${conditions}`.toLocaleLowerCase();
};
const filteredTitles = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return titles.value.filter((title) =>
    (!query || searchHaystack(title).includes(query))
    && (categoryFilter.value === "all" || title.category === categoryFilter.value)
    && (scopeFilter.value === "all" || title.scope === scopeFilter.value)
    && (statusFilter.value === "all" || title.status === statusFilter.value));
});
const statusOrder: Record<DerivedStatus, number> = { draft: 0, scheduled: 1, active: 2, sunsetting: 3, ended: 4 };
const sortedTitles = computed(() => {
  const items = [...filteredTitles.value];
  if (sortMode.value === "label") return items.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  if (sortMode.value === "status") return items.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.label.localeCompare(b.label, "zh-CN"));
  return items.sort((a, b) => a.category.localeCompare(b.category, "zh-CN") || a.label.localeCompare(b.label, "zh-CN"));
});
const activeFilterChips = computed(() => {
  const chips: string[] = [];
  if (search.value.trim()) chips.push(`搜索“${search.value.trim()}”`);
  if (categoryFilter.value !== "all") chips.push(categoryFilter.value);
  if (scopeFilter.value !== "all") chips.push(titleScopeLabel(scopeFilter.value));
  if (statusFilter.value !== "all") chips.push(achievementStatusLabel(statusFilter.value));
  return chips;
});
function clearFilters() {
  search.value = "";
  categoryFilter.value = "all";
  scopeFilter.value = "all";
  statusFilter.value = "all";
}

const adminData = useAdminAsyncData("admin-title-summaries", async () => {
  const [titleResponse, mapResponse, modeResponse] = await Promise.all([
    api<AdminTitleSummaryListResponse>("/v1/title-summaries"),
    api<{ items: AdminMap[] }>("/v1/maps"),
    api<{ items: StandaloneModeOption[] }>("/v1/standalone-modes"),
  ]);
  return { items: titleResponse.items, maps: mapResponse.items, modes: modeResponse.items };
}, {
  onStart: () => { errorMessage.value = ""; },
  onData: ({ items, maps: nextMaps, modes: nextModes }) => {
    titles.value = items;
    maps.value = nextMaps;
    modes.value = nextModes;
    for (const key of expandedKeys) void loadChallenges(key);
  },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, "服务暂时不可用，请稍后重试。").description; },
});
const loading = adminData.loading;
async function load() {
  errorMessage.value = "";
  await adminData.refresh();
}

async function loadChallenges(titleKey: string) {
  if (challengesLoading.has(titleKey)) return;
  challengesLoading.add(titleKey);
  challengesError.delete(titleKey);
  try {
    const response = await api<AdminTitleChallengeListResponse>(`/v1/titles/${encodeURIComponent(titleKey)}/challenges`);
    challengesByTitle.set(titleKey, response.items);
    for (const challenge of response.items) retirementVersions[challenge.challengeId] ??= challenge.retiredVersion ?? "";
  } catch (error) {
    challengesError.set(titleKey, portalErrorDetails(error, "无法读取挑战，请稍后重试。").description);
  } finally {
    challengesLoading.delete(titleKey);
  }
}

function toggleExpand(title: AdminTitleSummary) {
  if (expandedKeys.has(title.titleKey)) {
    expandedKeys.delete(title.titleKey);
    return;
  }
  expandedKeys.add(title.titleKey);
  if (title.acquisition.kind === "challenges") void loadChallenges(title.titleKey);
}

function challengesOf(title: AdminTitleSummary) {
  return challengesByTitle.get(title.titleKey) ?? [];
}
function siblingsOf(title: AdminTitleSummary, excludeId?: string) {
  return challengesOf(title).filter((challenge) => challenge.challengeId !== excludeId);
}

const titleBody = (title: AdminTitleSummary) => ({
  contractVersion: "1",
  label: title.label,
  icon: title.icon,
  category: title.category,
  scope: title.scope,
  displayKind: title.displayKind,
  color: title.color ?? null,
  publicVisibility: title.publicVisibility,
});

async function putTitle(title: AdminTitleSummary, body: Record<string, unknown>) {
  return api<AdminTitleUpdateResponse>(`/v1/titles/${encodeURIComponent(title.titleKey)}`, {
    method: "PUT",
    headers: { "Idempotency-Key": createRequestId() },
    body,
  });
}

async function enableTitle(title: AdminTitleSummary) {
  savingKey.value = title.titleKey;
  errorMessage.value = "";
  try {
    const response = await putTitle(title, { ...titleBody(title), lifecycle: "active" });
    await load();
    toast.add({
      title: `已启用「${title.label}」`,
      color: "success",
      duration: 8000,
      actions: response.previousLifecycle === "draft" ? [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => void disableTitle(title) }] : [],
    });
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存称号状态，请稍后重试。").description;
  } finally {
    savingKey.value = null;
  }
}

async function disableTitle(title: AdminTitleSummary) {
  savingKey.value = title.titleKey;
  try {
    await putTitle(title, { ...titleBody(title), lifecycle: "draft" });
    await load();
    toast.add({ title: "已撤销", color: "success" });
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法撤销，请稍后重试。").description;
  } finally {
    savingKey.value = null;
  }
}

// A title ends by ending every still-open challenge path; undo restores each
// challenge to the state its lifecycle response returned as `previous`.
async function endTitle(title: AdminTitleSummary) {
  savingKey.value = title.titleKey;
  errorMessage.value = "";
  try {
    await loadChallenges(title.titleKey);
    const open = challengesOf(title).filter((challenge) => ["active", "sunsetting", "scheduled"].includes(challengeDisplayStatus(challenge)));
    const previous: AdminChallengeLifecycleResponse["previous"][] = [];
    for (const challenge of open) {
      const response = await api<AdminChallengeLifecycleResponse>(`/v1/achievements/${encodeURIComponent(challenge.challengeId)}/lifecycle`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", status: "archived" },
      });
      previous.push(response.previous);
    }
    await loadChallenges(title.titleKey);
    await load();
    toast.add({
      title: `已结束「${title.label}」`,
      color: "success",
      duration: 8000,
      actions: previous.length ? [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => void reopenTitle(title, open.map((challenge, index) => ({ challengeId: challenge.challengeId, previous: previous[index]! }))) }] : [],
    });
  } catch (error) {
    const description = portalErrorDetails(error, "无法结束称号，请稍后重试。").description;
    // Refresh first so the reload's onStart does not clear the surfaced error.
    await loadChallenges(title.titleKey);
    await load();
    errorMessage.value = description;
  } finally {
    savingKey.value = null;
  }
}

async function reopenTitle(title: AdminTitleSummary, states: { challengeId: string; previous: AdminChallengeLifecycleResponse["previous"] }[]) {
  savingKey.value = title.titleKey;
  try {
    for (const { challengeId, previous } of states) {
      await api(`/v1/achievements/${encodeURIComponent(challengeId)}/lifecycle`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", status: previous.status, retiredVersion: previous.retiredVersion, startsAt: previous.startsAt, endsAt: previous.endsAt },
      });
    }
    await loadChallenges(title.titleKey);
    await load();
    toast.add({ title: "已撤销", color: "success" });
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法撤销，请稍后重试。").description;
    await loadChallenges(title.titleKey);
    await load();
  } finally {
    savingKey.value = null;
  }
}

async function mutateChallengeLifecycle(title: AdminTitleSummary, challenge: AdminTitleChallenge, body: Record<string, unknown>, message: string) {
  savingKey.value = challenge.challengeId;
  errorMessage.value = "";
  try {
    const response = await api<AdminChallengeLifecycleResponse>(`/v1/achievements/${encodeURIComponent(challenge.challengeId)}/lifecycle`, {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", ...body },
    });
    await loadChallenges(title.titleKey);
    await load();
    toast.add({
      title: message,
      color: "success",
      duration: 8000,
      actions: [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => void undoChallenge(title, challenge.challengeId, response.previous) }],
    });
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法保存挑战状态，请稍后重试。").description;
  } finally {
    savingKey.value = null;
  }
}

async function undoChallenge(title: AdminTitleSummary, challengeId: string, previous: AdminChallengeLifecycleResponse["previous"]) {
  savingKey.value = challengeId;
  try {
    await api(`/v1/achievements/${encodeURIComponent(challengeId)}/lifecycle`, {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", status: previous.status, retiredVersion: previous.retiredVersion, startsAt: previous.startsAt, endsAt: previous.endsAt },
    });
    await loadChallenges(title.titleKey);
    await load();
    toast.add({ title: "已撤销", color: "success" });
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法撤销，请稍后重试。").description;
  } finally {
    savingKey.value = null;
  }
}

async function planSunsetting(title: AdminTitleSummary, challenge: AdminTitleChallenge) {
  const retiredVersion = retirementVersions[challenge.challengeId]?.trim();
  if (!retiredVersion) return;
  await mutateChallengeLifecycle(title, challenge, { status: "active", retiredVersion }, `「${title.label}」的挑战已计划下线`);
  planningChallengeId.value = null;
}

function grantHref(title: AdminTitleSummary) {
  return { path: "/admin/grants", query: { titleKey: title.titleKey } };
}

function openCreateTitle() {
  titleDialogMode.value = "create";
  editingTitle.value = null;
  titleDialogError.value = "";
  keyConflict.value = null;
  titleDialogOpen.value = true;
}
function openEditTitle(title: AdminTitleSummary) {
  titleDialogMode.value = "edit";
  editingTitle.value = title;
  titleDialogError.value = "";
  keyConflict.value = null;
  titleDialogOpen.value = true;
}

async function uploadTitleIcon(titleKey: string, iconFile: File | null) {
  if (!iconFile) return;
  const body = new FormData();
  body.append("file", iconFile);
  await api(`/v1/titles/${encodeURIComponent(titleKey)}/icon`, { method: "POST", body });
}

async function createTitle(payload: Record<string, unknown>, iconFile: File | null, intent: "only" | "with_challenge") {
  titleDialogSaving.value = true;
  titleDialogError.value = "";
  keyConflict.value = null;
  try {
    const created = await api<AdminTitleSummary>("/v1/titles", {
      method: "POST",
      headers: { "Idempotency-Key": createRequestId() },
      body: payload,
    });
    let iconNote = "";
    try {
      await uploadTitleIcon(created.titleKey, iconFile);
    } catch {
      iconNote = "，图标上传失败，请稍后在编辑中重试";
    }
    titleDialogOpen.value = false;
    toast.add({ title: `已创建称号「${created.label}」${iconNote}`, color: "success" });
    await load();
    const fresh = titles.value.find((item) => item.titleKey === created.titleKey) ?? created;
    if (intent === "with_challenge") openAddChallenge(fresh);
    else expandedKeys.add(fresh.titleKey);
  } catch (error) {
    const details = portalErrorDetails(error, "无法创建称号，请稍后重试。");
    if (details.code === "TITLE_KEY_CONFLICT") {
      keyConflict.value = typeof payload.titleKey === "string" ? payload.titleKey : "";
      titleDialogError.value = "唯一 key 已被其他称号使用，修改后再试。";
    } else {
      titleDialogError.value = details.description;
    }
  } finally {
    titleDialogSaving.value = false;
  }
}

async function saveTitle(payload: Record<string, unknown>, iconFile: File | null) {
  const title = editingTitle.value;
  if (!title) return;
  titleDialogSaving.value = true;
  titleDialogError.value = "";
  try {
    await putTitle(title, payload);
    try {
      await uploadTitleIcon(title.titleKey, iconFile);
    } catch {
      errorMessage.value = "称号已保存，图标上传失败，请稍后重试。";
    }
    titleDialogOpen.value = false;
    toast.add({ title: `已保存「${title.label}」`, color: "success" });
    await load();
  } catch (error) {
    titleDialogError.value = portalErrorDetails(error, "无法保存称号，请稍后重试。").description;
  } finally {
    titleDialogSaving.value = false;
  }
}

async function openAddChallenge(title: AdminTitleSummary) {
  challengeDialogMode.value = "add";
  challengeDialogTitle.value = title;
  editingChallenge.value = null;
  challengeDialogError.value = "";
  challengeDialogOpen.value = true;
  if (title.acquisition.kind === "challenges") await loadChallenges(title.titleKey);
}
function openEditChallenge(title: AdminTitleSummary, challenge: AdminTitleChallenge) {
  challengeDialogMode.value = "edit";
  challengeDialogTitle.value = title;
  editingChallenge.value = challenge;
  challengeDialogError.value = "";
  challengeDialogOpen.value = true;
}

async function submitChallenge(payload: Record<string, unknown>) {
  const title = challengeDialogTitle.value;
  if (!title) return;
  challengeSaving.value = true;
  challengeDialogError.value = "";
  try {
    if (challengeDialogMode.value === "add") {
      await api(`/v1/titles/${encodeURIComponent(title.titleKey)}/challenges`, {
        method: "POST",
        headers: { "Idempotency-Key": createRequestId() },
        body: payload,
      });
      toast.add({ title: `已为「${title.label}」添加挑战`, color: "success" });
    } else {
      const challenge = editingChallenge.value;
      if (!challenge) return;
      await api(`/v1/achievements/${encodeURIComponent(challenge.challengeId)}`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: payload,
      });
      toast.add({ title: "挑战已保存", color: "success" });
    }
    challengeDialogOpen.value = false;
    await loadChallenges(title.titleKey);
    await load();
  } catch (error) {
    challengeDialogError.value = portalErrorDetails(error, "无法保存挑战，请稍后重试。").description;
  } finally {
    challengeSaving.value = false;
  }
}
</script>

<template>
  <AdminWorkspace title="称号与挑战" :count="loading ? '读取中…' : `${titles.length} 个称号`">
    <template #actions><UButton label="新建称号" icon="i-lucide-plus" @click="openCreateTitle" /></template>
    <AdminAchievementNav />
    <section class="title-workspace" aria-label="称号列表">
      <div class="title-toolbar">
        <UInput v-model="search" class="title-toolbar__search" aria-label="搜索称号或完成条件" placeholder="搜索称号或完成条件" icon="i-lucide-search" />
        <USelect v-model="categoryFilter" aria-label="筛选系列" :items="[{ label: '全部系列', value: 'all' }, ...categories.map((category) => ({ label: category, value: category }))]" />
        <USelect v-model="scopeFilter" aria-label="筛选范围" :items="[{ label: '全部范围', value: 'all' }, { label: '全局称号', value: 'global' }, { label: '地图称号', value: 'map' }]" />
        <USelect v-model="statusFilter" aria-label="筛选称号状态" :items="[{ label: '全部状态', value: 'all' }, { label: '草稿', value: 'draft' }, { label: '未开放', value: 'scheduled' }, { label: '已开放', value: 'active' }, { label: '即将结束', value: 'sunsetting' }, { label: '已结束', value: 'ended' }]" />
        <USelect v-model="sortMode" aria-label="排序方式" :items="[{ label: '系列 · 称号', value: 'category_label' }, { label: '称号', value: 'label' }, { label: '状态', value: 'status' }]" />
      </div>

      <div v-if="loading" class="title-state" aria-busy="true">
        <div class="title-skeleton" v-for="index in 4" :key="index"><USkeleton class="title-skeleton__line" /><USkeleton class="title-skeleton__badge" /></div>
        <span class="type-caption" role="status">读取中…</span>
      </div>
      <div v-else-if="errorMessage" class="title-state">
        <UAlert color="error" variant="subtle" title="无法读取称号" :description="errorMessage" />
        <UButton label="重试" color="neutral" variant="outline" size="sm" @click="load" />
      </div>
      <div v-else-if="!titles.length" class="title-state">
        <h3>还没有称号</h3>
        <p class="type-caption">新建称号后，为它添加挑战玩家才能获得。</p>
        <UButton label="新建第一个称号" color="neutral" variant="outline" icon="i-lucide-plus" @click="openCreateTitle" />
      </div>
      <div v-else-if="!sortedTitles.length" class="title-state">
        <h3>没有符合条件的称号</h3>
        <div class="title-state__chips"><StatusBadge v-for="chip in activeFilterChips" :key="chip" :label="chip" /></div>
        <UButton label="清除筛选" color="neutral" variant="outline" size="sm" @click="clearFilters" />
      </div>

      <template v-if="sortedTitles.length">
        <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />
        <table class="title-table">
          <thead>
            <tr>
              <th class="title-col-expand" scope="col"><span class="sr-only">展开</span></th>
              <th scope="col">称号</th>
              <th scope="col">系列</th>
              <th scope="col">范围 · 展示方式</th>
              <th scope="col">获取方式</th>
              <th scope="col">状态</th>
              <th class="title-col-actions" scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="title in sortedTitles" :key="title.titleKey">
              <tr :class="{ 'title-row--open': expandedKeys.has(title.titleKey) }">
                <td>
                  <UButton size="sm" color="neutral" variant="ghost" square :icon="expandedKeys.has(title.titleKey) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" :aria-expanded="expandedKeys.has(title.titleKey)" :aria-label="`${expandedKeys.has(title.titleKey) ? '收起' : '展开'}${title.label}的获取方式`" :aria-controls="`title-panel-${title.titleKey}`" @click="toggleExpand(title)" />
                </td>
                <td>
                  <strong>{{ title.label }}</strong>
                  <small class="table-meta">{{ titleColorLabel(title.color) }}</small>
                </td>
                <td>{{ title.category }}</td>
                <td>
                  <span class="title-cell-stack"><span>{{ titleScopeLabel(title.scope) }}</span><small class="table-meta">{{ titleDisplayKindLabel(title.displayKind) }}</small></span>
                </td>
                <td class="title-num">{{ titleAcquisitionLabel(title.acquisition) }}</td>
                <td><StatusBadge :label="title.developerOnly && title.lifecycle === 'active' ? '开发保留' : achievementStatusLabel(title.status)" :tone="title.developerOnly && title.lifecycle === 'active' ? 'warning' : achievementStatusTone(title.status)" /></td>
                <td>
                  <div class="table-actions">
                    <UButton size="sm" color="neutral" variant="outline" label="编辑" :aria-label="`编辑${title.label}`" :disabled="savingKey === title.titleKey" @click="openEditTitle(title)" />
                    <UButton v-if="title.lifecycle === 'draft'" size="sm" color="neutral" variant="outline" label="启用" :aria-label="`启用${title.label}`" :loading="savingKey === title.titleKey" @click="enableTitle(title)" />
                    <template v-else>
                      <UButton size="sm" color="neutral" variant="outline" label="发放" :aria-label="`发放${title.label}`" :to="grantHref(title)" />
                      <UButton v-if="title.acquisition.kind === 'challenges' && title.status !== 'ended'" size="sm" color="error" variant="soft" label="结束" :aria-label="`结束${title.label}`" :loading="savingKey === title.titleKey" @click="endTitle(title)" />
                    </template>
                  </div>
                </td>
              </tr>
              <tr v-if="expandedKeys.has(title.titleKey)" class="title-panel-row">
                <td :id="`title-panel-${title.titleKey}`" colspan="7" role="region" :aria-label="`${title.label}的获取方式`">
                  <div class="title-panel">
                    <div class="title-panel__head">
                      <span class="type-caption title-panel__heading">获取方式</span>
                      <UButton v-if="title.acquisition.kind !== 'map_rule'" size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" label="添加挑战" :aria-label="`为${title.label}添加挑战`" @click="openAddChallenge(title)" />
                    </div>
                    <div v-if="title.acquisition.kind === 'map_rule'" class="title-rule-card">
                      <span class="title-cell-stack">
                        <span>{{ title.acquisition.condition }}</span>
                        <small class="table-meta">由地图称号规则发放 · {{ title.acquisition.scopeLabel }}</small>
                      </span>
                      <UButton size="sm" color="neutral" variant="outline" label="在地图挑战中管理" :to="{ path: '/admin/achievements/map-challenges', query: { ruleId: title.acquisition.ruleId } }" />
                    </div>
                    <template v-else>
                      <p v-if="title.status === 'ended' && challengesOf(title).length" class="title-panel__note">称号的获取方式已全部结束，下面的挑战不再产生新的获得记录；仍可手动发放给指定玩家。</p>
                      <div v-if="challengesLoading.has(title.titleKey)" class="title-challenge title-challenge--loading" role="status">读取中…</div>
                      <UAlert v-else-if="challengesError.get(title.titleKey)" color="error" variant="subtle" :description="challengesError.get(title.titleKey)" />
                      <div v-else-if="!challengesOf(title).length" class="title-empty-card">
                        <span>还没有获取方式，玩家无法获得这个称号。</span>
                        <UButton size="sm" color="neutral" variant="outline" label="添加第一条挑战" @click="openAddChallenge(title)" />
                      </div>
                      <ul v-else class="title-challenges" :aria-label="`${title.label}的获取方式`">
                        <li v-for="challenge in challengesOf(title)" :key="challenge.challengeId" class="title-challenge">
                          <div class="title-cell-stack title-challenge__condition">
                            <span>{{ challenge.condition }}</span>
                            <small v-if="challenge.replacedByChallengeId" class="table-meta">完成条件变更后由上一条取代</small>
                          </div>
                          <span class="title-challenge__mode">{{ submissionModeLabel(challenge.submissionMode) }}</span>
                          <div class="title-cell-stack title-num">
                            <span>{{ challengeWindowLabel(challenge) }}</span>
                            <small class="table-meta">{{ challenge.introducedVersion ? `引入 ${challenge.introducedVersion}` : "" }}</small>
                          </div>
                          <StatusBadge :label="achievementStatusLabel(challengeDisplayStatus(challenge))" :tone="achievementStatusTone(challengeDisplayStatus(challenge))" />
                          <div class="table-actions">
                            <UButton v-if="challengeDisplayStatus(challenge) !== 'ended'" size="sm" color="neutral" variant="outline" label="编辑" :aria-label="`编辑${title.label}的挑战`" :disabled="savingKey === challenge.challengeId" @click="openEditChallenge(title, challenge)" />
                            <UButton v-if="challenge.status === 'draft'" size="sm" color="neutral" variant="outline" label="开放" :aria-label="`开放${title.label}的挑战`" :loading="savingKey === challenge.challengeId" @click="mutateChallengeLifecycle(title, challenge, { status: 'active' }, `已开放「${title.label}」的挑战`)" />
                            <UPopover v-else-if="challengeDisplayStatus(challenge) === 'active' || challengeDisplayStatus(challenge) === 'sunsetting'" :open="planningChallengeId === challenge.challengeId" @update:open="(open) => { planningChallengeId = open ? challenge.challengeId : null; }">
                              <UButton size="sm" color="neutral" variant="outline" label="计划下线" :aria-label="`计划下线${title.label}的挑战`" :disabled="savingKey === challenge.challengeId" />
                              <template #content>
                                <UCard class="plan-popover-card">
                                  <form class="plan-popover" role="dialog" :aria-label="`计划下线${title.label}的挑战`" @submit.prevent="planSunsetting(title, challenge)">
                                    <UFormField label="计划下线版本" required help="玩家侧会显示为即将结束。">
                                      <UInput v-model="retirementVersions[challenge.challengeId]" required placeholder="例如 26.1101.1" :disabled="savingKey === challenge.challengeId" />
                                    </UFormField>
                                    <UButton type="submit" block label="确认" size="sm" :loading="savingKey === challenge.challengeId" :disabled="!retirementVersions[challenge.challengeId]?.trim()" />
                                  </form>
                                </UCard>
                              </template>
                            </UPopover>
                            <UButton v-if="challengeDisplayStatus(challenge) === 'active' || challengeDisplayStatus(challenge) === 'sunsetting'" size="sm" color="error" variant="soft" label="结束" :aria-label="`结束${title.label}的挑战`" :loading="savingKey === challenge.challengeId" @click="mutateChallengeLifecycle(title, challenge, { status: 'archived' }, `已结束「${title.label}」的挑战`)" />
                            <UButton v-if="challenge.status === 'archived'" size="sm" color="neutral" variant="outline" label="重开" :aria-label="`重开${title.label}的挑战`" :loading="savingKey === challenge.challengeId" @click="mutateChallengeLifecycle(title, challenge, { status: 'active' }, `已重开「${title.label}」的挑战`)" />
                          </div>
                        </li>
                      </ul>
                    </template>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <ul class="title-records">
          <li v-for="title in sortedTitles" :key="title.titleKey" class="title-record">
            <button type="button" class="title-record__head" :aria-expanded="expandedKeys.has(title.titleKey)" :aria-label="`${expandedKeys.has(title.titleKey) ? '收起' : '展开'}${title.label}的获取方式`" @click="toggleExpand(title)">
              <span class="title-cell-stack">
                <strong>{{ title.label }}</strong>
                <small class="table-meta">{{ title.category }} · {{ titleAcquisitionLabel(title.acquisition) }}</small>
              </span>
              <StatusBadge :label="title.developerOnly && title.lifecycle === 'active' ? '开发保留' : achievementStatusLabel(title.status)" :tone="title.developerOnly && title.lifecycle === 'active' ? 'warning' : achievementStatusTone(title.status)" />
            </button>
            <div v-if="expandedKeys.has(title.titleKey)" class="title-record__body">
              <div v-if="title.acquisition.kind === 'map_rule'" class="title-rule-card">
                <span class="title-cell-stack">
                  <span>{{ title.acquisition.condition }}</span>
                  <small class="table-meta">由地图称号规则发放 · {{ title.acquisition.scopeLabel }}</small>
                </span>
                <UButton size="sm" color="neutral" variant="outline" label="在地图挑战中管理" :to="{ path: '/admin/achievements/map-challenges', query: { ruleId: title.acquisition.ruleId } }" />
              </div>
              <template v-else>
                <p v-if="title.status === 'ended' && challengesOf(title).length" class="title-panel__note">称号的获取方式已全部结束，下面的挑战不再产生新的获得记录；仍可手动发放给指定玩家。</p>
                <div v-if="challengesLoading.has(title.titleKey)" role="status" class="table-meta">读取中…</div>
                <UAlert v-else-if="challengesError.get(title.titleKey)" color="error" variant="subtle" :description="challengesError.get(title.titleKey)" />
                <div v-else-if="!challengesOf(title).length" class="title-empty-card">还没有获取方式，玩家无法获得这个称号。</div>
                <div v-for="challenge in challengesOf(title)" :key="challenge.challengeId" class="title-record__challenge">
                  <div class="title-record__challenge-head">
                    <span>{{ challenge.condition }}</span>
                    <StatusBadge :label="achievementStatusLabel(challengeDisplayStatus(challenge))" :tone="achievementStatusTone(challengeDisplayStatus(challenge))" />
                  </div>
                  <small class="table-meta">{{ submissionModeLabel(challenge.submissionMode) }} · {{ challengeWindowLabel(challenge) }}{{ challenge.introducedVersion ? ` · 引入 ${challenge.introducedVersion}` : '' }}</small>
                  <small v-if="challenge.replacedByChallengeId" class="table-meta">完成条件变更后由上一条取代</small>
                  <div class="table-actions">
                    <UButton v-if="challengeDisplayStatus(challenge) !== 'ended'" size="sm" color="neutral" variant="outline" label="编辑" @click="openEditChallenge(title, challenge)" />
                    <UButton v-if="challenge.status === 'draft'" size="sm" color="neutral" variant="outline" label="开放" :loading="savingKey === challenge.challengeId" @click="mutateChallengeLifecycle(title, challenge, { status: 'active' }, `已开放「${title.label}」的挑战`)" />
                    <UButton v-else-if="challengeDisplayStatus(challenge) === 'active' || challengeDisplayStatus(challenge) === 'sunsetting'" size="sm" color="neutral" variant="outline" label="计划下线" @click="planningChallengeId = planningChallengeId === challenge.challengeId ? null : challenge.challengeId" />
                    <UButton v-if="challengeDisplayStatus(challenge) === 'active' || challengeDisplayStatus(challenge) === 'sunsetting'" size="sm" color="error" variant="soft" label="结束" :loading="savingKey === challenge.challengeId" @click="mutateChallengeLifecycle(title, challenge, { status: 'archived' }, `已结束「${title.label}」的挑战`)" />
                    <UButton v-if="challenge.status === 'archived'" size="sm" color="neutral" variant="outline" label="重开" :loading="savingKey === challenge.challengeId" @click="mutateChallengeLifecycle(title, challenge, { status: 'active' }, `已重开「${title.label}」的挑战`)" />
                  </div>
                  <form v-if="planningChallengeId === challenge.challengeId" class="plan-popover title-record__plan" role="dialog" :aria-label="`计划下线${title.label}的挑战`" @submit.prevent="planSunsetting(title, challenge)">
                    <UFormField label="计划下线版本" required help="玩家侧会显示为即将结束。">
                      <UInput v-model="retirementVersions[challenge.challengeId]" required placeholder="例如 26.1101.1" :disabled="savingKey === challenge.challengeId" />
                    </UFormField>
                    <div class="table-actions">
                      <UButton type="button" size="sm" color="neutral" variant="ghost" label="取消" @click="planningChallengeId = null" />
                      <UButton type="submit" size="sm" color="neutral" variant="outline" label="确认" :loading="savingKey === challenge.challengeId" :disabled="!retirementVersions[challenge.challengeId]?.trim()" />
                    </div>
                  </form>
                </div>
              </template>
              <div class="title-record__foot">
                <UButton v-if="title.acquisition.kind !== 'map_rule'" size="sm" color="neutral" variant="outline" icon="i-lucide-plus" label="添加挑战" @click="openAddChallenge(title)" />
                <UButton size="sm" color="neutral" variant="outline" label="编辑称号" @click="openEditTitle(title)" />
                <UButton v-if="title.lifecycle === 'draft'" size="sm" color="neutral" variant="outline" label="启用" :loading="savingKey === title.titleKey" @click="enableTitle(title)" />
                <template v-else>
                  <UButton size="sm" color="neutral" variant="outline" label="发放" :to="grantHref(title)" />
                  <UButton v-if="title.acquisition.kind === 'challenges' && title.status !== 'ended'" size="sm" color="error" variant="soft" label="结束" :loading="savingKey === title.titleKey" @click="endTitle(title)" />
                </template>
              </div>
            </div>
          </li>
        </ul>
        <p class="title-count type-caption">{{ `显示 ${sortedTitles.length} 个称号` }}</p>
      </template>
    </section>

    <AdminTitleCreateDialog
      v-model:open="titleDialogOpen"
      :mode="titleDialogMode"
      :title="editingTitle"
      :categories="categories"
      :existing-titles="titles.map((title) => ({ titleKey: title.titleKey, label: title.label }))"
      :saving="titleDialogSaving"
      :error-message="titleDialogError"
      :key-conflict="keyConflict"
      @create="createTitle"
      @save="saveTitle"
    />
    <AdminChallengeDialog
      v-model:open="challengeDialogOpen"
      :mode="challengeDialogMode"
      :title="challengeDialogTitle"
      :challenge="editingChallenge"
      :siblings="challengeDialogTitle ? siblingsOf(challengeDialogTitle, editingChallenge?.challengeId) : []"
      :maps="maps"
      :modes="modes"
      :saving="challengeSaving"
      :error-message="challengeDialogError"
      @submit="submitChallenge"
    />
  </AdminWorkspace>
</template>

<style scoped>
.title-workspace { container-type: inline-size; display: grid; gap: var(--space-3); }
.title-toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.title-toolbar__search { flex: 1 1 16rem; min-width: 12rem; }
.title-toolbar :deep(select), .title-toolbar :deep(button) { min-width: 8.5rem; }
.table-meta { color: var(--quiet); font-size: var(--type-caption-size); }
.title-cell-stack { display: grid; gap: 2px; }
.title-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.table-actions { display: flex; flex-wrap: nowrap; gap: var(--space-2); justify-content: flex-end; }

.title-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
.title-table th { padding: var(--space-2) var(--space-3); text-align: left; font-size: .72rem; font-weight: 700; letter-spacing: .025em; color: var(--quiet); border-bottom: 1px solid var(--line); white-space: nowrap; }
.title-table td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--line); vertical-align: middle; }
.title-table tbody tr:last-child td { border-bottom: 0; }
.title-col-expand { width: 2.5rem; }
.title-col-actions { text-align: right; }
.title-table strong, .title-table small { display: block; }
.title-row--open td { background: color-mix(in oklch, var(--surface-raised) 45%, var(--surface)); border-bottom-color: transparent; }
.title-panel-row > td { padding: 0 var(--space-3) var(--space-4) calc(2.5rem + var(--space-6)); background: color-mix(in oklch, var(--surface-raised) 45%, var(--surface)); }

.title-panel { display: grid; gap: var(--space-2); }
.title-panel__head { display: flex; align-items: center; justify-content: space-between; }
.title-panel__heading { font-weight: 700; }
.title-panel__note { margin: 0; color: var(--muted); font-size: .8125rem; }
.title-challenges { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.title-challenge { display: grid; grid-template-columns: minmax(12rem, 1.6fr) 6rem minmax(9rem, 1fr) 6rem minmax(14rem, auto); align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); font-size: .875rem; }
.title-challenge--loading { display: block; color: var(--quiet); }
.title-rule-card { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--surface); font-size: .875rem; }
.title-empty-card { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px dashed var(--line); border-radius: var(--radius-control); color: var(--muted); font-size: .875rem; }
.plan-popover { display: grid; gap: var(--space-3); }
.plan-popover-card { width: min(280px, calc(100vw - 32px)); }
.title-count { margin: 0; font-variant-numeric: tabular-nums; }

.title-state { display: grid; justify-items: center; gap: var(--space-2); padding: var(--space-8) var(--space-4); text-align: center; }
.title-state h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.title-state p { margin: 0; }
.title-state__chips { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; }
.title-skeleton { display: flex; width: 100%; gap: var(--space-3); }
.title-skeleton__line { flex: 1; height: .875rem; }
.title-skeleton__badge { width: 4rem; height: .875rem; }

.title-records { display: none; margin: 0; padding: 0; list-style: none; }
.title-record { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); }
.title-record + .title-record { margin-top: var(--space-3); }
.title-record__head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); width: 100%; min-height: 3.5rem; padding: var(--space-3) var(--space-4); border: 0; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.title-record__body { display: grid; gap: var(--space-3); padding: 0 var(--space-4) var(--space-4); border-top: 1px solid var(--line); }
.title-record__challenge { display: grid; gap: var(--space-2); padding-top: var(--space-3); }
.title-record__challenge-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); flex-wrap: nowrap; }
.title-record__foot { display: flex; flex-wrap: wrap; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--line); }
.title-record__plan { border: 1px solid var(--line); border-radius: var(--radius-control); padding: var(--space-3); }

@container (max-width: 47.99rem) {
  .title-challenge { grid-template-columns: minmax(0, 1fr) auto; }
  .title-challenge__mode, .title-challenge__condition + span { display: none; }
}
@container (max-width: 23.99rem) {
  .title-table { display: none; }
  .title-records { display: block; }
  .title-toolbar { display: grid; grid-template-columns: 1fr auto; }
  .title-toolbar__search { grid-column: 1 / -1; }
}
</style>
