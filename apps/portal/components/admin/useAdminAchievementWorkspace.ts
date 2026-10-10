import { computed, reactive, ref, shallowRef } from "vue";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import {
  type AchievementStatus,
  type AdminAchievement,
  type AdminMap,
  type StandaloneModeOption,
  type CatalogTitle,
  type MapAchievement,
  type TitleAchievement,
  DEFAULT_EVIDENCE_RULE,
  achievementStatusLabel,
  achievementStatusTone,
  isCatalog,
  isChallengeTitle,
  isDeveloperOnly,
  isMap,
  isTitle,
  itemIdentity,
} from "~/components/admin/admin-achievement-types";

/** State and write actions shared by the admin title, challenge, and map-challenge routes. */
export function useAdminAchievementWorkspace() {
  const api = useAdminApi();
  const items = ref<AdminAchievement[]>([]);
  const editingId = ref<string | null>(null);
  const planningId = ref<string | null>(null);
  const retirementVersions = reactive<Record<string, string>>({});
  const endTarget = ref<AdminAchievement | null>(null);
  const endTrigger = ref<HTMLElement | null>(null);
  const savingId = ref<string | null>(null);
  const iconFile = shallowRef<File | null>(null);
  const iconUploading = shallowRef(false);
  const toast = useToast();
  const errorMessage = ref("");
  const createOpen = shallowRef(false);
  const creating = shallowRef(false);
  const maps = ref<AdminMap[]>([]);
  const modes = ref<StandaloneModeOption[]>([]);
  /* A-04 — briefly flash a row after an in-place update so the change is
     visible without reloading the whole page. */
  const updatedCatalogIds = new Set<string>();
  function flashRow(id: string) {
    updatedCatalogIds.add(id);
    window.setTimeout(() => updatedCatalogIds.delete(id), 420);
  }
  const isSaving = (item: AdminAchievement) => savingId.value === itemIdentity(item);
  const mapItems = computed(() => items.value.filter(isMap));
  const editingItem = computed(() => items.value.find((candidate) => itemIdentity(candidate) === editingId.value && (isTitle(candidate) || isMap(candidate))) ?? null);
  const editorOpen = computed({
    get: () => editingItem.value !== null,
    set: (open: boolean) => { if (!open) closeEditing(); },
  });
  const achievementStatusText = (item: AdminAchievement) =>
    isChallengeTitle(item)
      ? achievementStatusLabel(item.status)
      : isCatalog(item)
        ? isDeveloperOnly(item) && item.lifecycle === "active" ? "开发保留" : item.lifecycle === "draft" ? "草稿" : item.lifecycle === "retired" ? "已退休" : "已启用"
        : item.status === "active" ? "已开放" : "已下线";
  const achievementItemStatusTone = (item: AdminAchievement) =>
    isCatalog(item)
      ? isDeveloperOnly(item) && item.lifecycle === "active" ? "warning" : item.lifecycle === "active" ? "success" : item.lifecycle === "draft" ? "info" : "default"
      : achievementStatusTone(item.status);
  const endingCatalog = computed(() => endTarget.value !== null && isCatalog(endTarget.value));
  const adminData = useAdminAsyncData("achievements", async () => {
      const [response, mapResponse, modeResponse] = await Promise.all([
        api<{ items: AdminAchievement[] }>("/v1/achievements"),
        api<{ items: AdminMap[] }>("/v1/maps"),
        api<{ items: StandaloneModeOption[] }>("/v1/standalone-modes"),
      ]);
      return { items: response.items, maps: mapResponse.items, modes: modeResponse.items };
    }, {
      onStart: () => { errorMessage.value = ""; },
      onData: ({ items: nextItems, maps: nextMaps, modes: nextModes }) => {
        items.value = nextItems;
        maps.value = nextMaps;
        modes.value = nextModes;
        for (const item of nextItems) if (isChallengeTitle(item) || isMap(item)) retirementVersions[itemIdentity(item)] ??= item.retiredVersion ?? "";
        if (editingId.value && !nextItems.some((item) => itemIdentity(item) === editingId.value)) editingId.value = null;
      },
      onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取成就目录，请稍后重试。").description; },
    });
  const loading = adminData.loading;

  async function load() {
    errorMessage.value = "";
    await adminData.refresh();
  }

  async function openCreate() {
    if (!maps.value.length) await load();
    createOpen.value = true;
  }

  async function loadMapOptions() {
    if (!maps.value.length) {
      try { await load(); } catch { /* the editor can still save an unchanged scope */ }
    }
  }

  function titleUpdate(item: TitleAchievement, status: AchievementStatus = item.status, retiredVersion?: string) {
    return {
      family: "achievement",
      condition: item.condition,
      evidenceRule: item.evidenceRule,
      submissionMode: item.submissionMode,
      categoryOverride: item.categoryOverride?.trim() || null,
      iconUrl: item.iconUrl?.trim() || null,
      status,
      ...(item.scope ? { scope: item.scope, mapIds: item.scope === "map" ? item.mapIds ?? [] : [] } : {}),
      ...(item.progressRule !== undefined ? { progressRule: item.progressRule ? { type: "required_maps_completed", ...(item.progressRule.mapIds?.length ? { mapIds: item.progressRule.mapIds } : {}), ...(item.progressRule.difficultyAtLeast ? { difficultyAtLeast: item.progressRule.difficultyAtLeast } : {}), ...(item.progressRule.mode?.trim() ? { mode: item.progressRule.mode.trim() } : {}) } : null } : {}),
      ...(item.gameVersion?.trim() ? { gameVersion: item.gameVersion.trim() } : status === "scheduled" ? { gameVersion: null } : {}),
      ...(item.scope === "map" ? { mapVariant: item.mapVariant } : {}),
      ...(status === "sunsetting" && (retiredVersion ?? item.retiredVersion)?.trim() ? { retiredVersion: (retiredVersion ?? item.retiredVersion)!.trim() } : {}),
      ...(status === "scheduled" ? {
        ...(item.startsAt && item.startsAt > 0 ? { startsAt: item.startsAt } : {}),
        ...(item.endsAt && item.endsAt > 0 ? { endsAt: item.endsAt } : {}),
      } : {}),
    };
  }

  async function createAchievement(payload: Record<string, unknown>, iconFile: File | null) {
    creating.value = true;
    errorMessage.value = "";
    let iconUploadError = "";
    try {
      const created = await api<AdminAchievement>("/v1/achievements", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: payload });
      items.value = [created, ...items.value];
      if (iconFile) {
        const body = new FormData();
        body.append("file", iconFile);
        try {
          await api<{ iconUrl: string }>(`/v1/titles/${encodeURIComponent(String(payload.titleKey))}/icon`, { method: "POST", body });
        } catch (error) {
          iconUploadError = portalErrorDetails(error, "成就已创建，但图标上传失败，请稍后在编辑中重试。").description;
        }
      }
      await load();
      toast.add({ title: "成就挑战已创建", color: "success" });
      createOpen.value = false;
      if (iconUploadError) errorMessage.value = iconUploadError;
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "无法创建成就挑战，请稍后重试。").description;
    } finally {
      creating.value = false;
    }
  }

  function updatePayload(item: AdminAchievement, status: AchievementStatus, retiredVersion?: string) {
    if (isChallengeTitle(item)) return titleUpdate(item, status, retiredVersion);
    if (isMap(item)) return { family: "map", name: item.name, difficulty: item.difficulty ?? null, condition: item.condition, evidenceRule: item.evidenceRule, submissionMode: item.submissionMode, status, ...(status === "sunsetting" ? { retiredVersion: retiredVersion ?? item.retiredVersion ?? "" } : {}) };
    throw new Error("CATALOG_TITLE_UPDATE_REQUIRES_CATALOG_ENDPOINT");
  }

  async function saveCatalogTitle(item: CatalogTitle, lifecycle: CatalogTitle["lifecycle"], includeChallengeFields = false) {
    savingId.value = itemIdentity(item);
    errorMessage.value = "";
    try {
      await api<void>(`/v1/titles/${encodeURIComponent(item.titleKey)}`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: {
          contractVersion: "1",
          status: lifecycle === "retired" ? "retired" : "active",
          lifecycle,
          publicVisibility: item.publicVisibility,
          label: item.titleName,
          icon: item.icon,
          category: item.category,
          scope: item.scope,
          displayKind: item.displayKind,
          color: item.color ?? null,
          ...(includeChallengeFields ? {
            condition: item.condition,
            evidenceRule: item.evidenceRule?.trim() || DEFAULT_EVIDENCE_RULE,
            submissionMode: item.submissionMode ?? "manual",
            categoryOverride: item.categoryOverride?.trim() || null,
            iconUrl: item.iconUrl?.trim() || null,
            ...(lifecycle === "retired" && item.retiredVersion?.trim() ? { retiredVersion: item.retiredVersion.trim() } : {}),
          } : {}),
        },
      });
      toast.add({ title: lifecycle === "active" ? "称号已启用" : lifecycle === "draft" ? "称号已设为草稿" : "称号已退休", color: "success" });
      const updated = items.value.find((candidate): candidate is CatalogTitle => candidate.challengeId === item.challengeId && candidate.family === "title_catalog");
      if (updated) {
        updated.status = lifecycle;
        updated.lifecycle = lifecycle;
        updated.availability = lifecycle === "retired" ? "retired" : "active";
        if (includeChallengeFields) {
          if (item.condition !== undefined) updated.condition = item.condition;
          if (item.evidenceRule !== undefined) updated.evidenceRule = item.evidenceRule;
          if (item.submissionMode !== undefined) updated.submissionMode = item.submissionMode;
          if (item.categoryOverride !== undefined) updated.categoryOverride = item.categoryOverride;
          if (item.iconUrl !== undefined) updated.iconUrl = item.iconUrl;
          if (item.retiredVersion !== undefined) updated.retiredVersion = item.retiredVersion;
          if (item.startsAt !== undefined) updated.startsAt = item.startsAt;
          if (item.endsAt !== undefined) updated.endsAt = item.endsAt;
        }
        flashRow(updated.challengeId);
      }
      await load();
      return true;
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "无法保存称号状态，请稍后重试。").description;
      return false;
    } finally {
      savingId.value = null;
    }
  }

  async function save(item: AdminAchievement, body: Record<string, unknown>, message: string) {
    savingId.value = itemIdentity(item);
    errorMessage.value = "";
    try {
      const updated = await api<AdminAchievement>(`/v1/achievements/${encodeURIComponent(item.challengeId)}`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", ...body },
      });
      items.value = items.value.map((candidate) => itemIdentity(candidate) === itemIdentity(updated) ? updated : candidate);
      await load();
      toast.add({ title: message, color: "success" });
      return true;
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "无法保存成就规则，请稍后重试。").description;
      return false;
    } finally {
      savingId.value = null;
    }
  }

  async function saveTitle(item: TitleAchievement) {
    if (await save(item, titleUpdate(item), "成就规则已保存")) editingId.value = null;
  }

  async function saveMap(item: MapAchievement) {
    if (await save(item, updatePayload(item, item.status), "地图挑战规则已保存")) editingId.value = null;
  }

  async function saveEditingItem(item: AdminAchievement) {
    if (isChallengeTitle(item)) {
      await saveTitle(item);
      return;
    }
    if (isMap(item)) {
      await saveMap(item);
      return;
    }
    if (await saveCatalogTitle(item, item.lifecycle)) editingId.value = null;
  }

  function updateEditingCatalogLifecycle(lifecycle: CatalogTitle["lifecycle"]) {
    if (editingItem.value && isCatalog(editingItem.value)) editingItem.value.lifecycle = lifecycle;
  }

  function updateEditingPublicVisibility(publicVisibility: boolean) {
    if (editingItem.value && isCatalog(editingItem.value)) editingItem.value.publicVisibility = publicVisibility;
  }

  async function planSunsetting(item: AdminAchievement) {
    const version = retirementVersions[itemIdentity(item)]?.trim();
    if (!version) return;
    if (await save(item, updatePayload(item, "sunsetting", version), item.status === "active" ? "挑战已计划下线" : "计划下线版本已保存")) planningId.value = null;
  }

  async function reopen(item: AdminAchievement) {
    if (item.family === "title_catalog") return saveCatalogTitle(item, "active", false);
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

  function toggleEditing(id: string, mapId?: string, gameplayRevisionId?: string) {
    iconFile.value = null;
    const item = items.value.find((candidate) => candidate.challengeId === id && (!mapId || !isMap(candidate) || candidate.mapId === mapId && (!gameplayRevisionId || candidate.gameplayRevisionId === gameplayRevisionId)));
    const identity = item ? itemIdentity(item) : id;
    editingId.value = editingId.value === identity ? null : identity;
    if (editingId.value) void loadMapOptions();
  }

  function closeEditing() {
    iconFile.value = null;
    editingId.value = null;
  }

  async function uploadIcon() {
    const item = editingItem.value;
    const file = iconFile.value;
    if (!item || !isTitle(item) || !file) return;
    iconUploading.value = true;
    errorMessage.value = "";
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await api<{ iconUrl: string }>(`/v1/titles/${encodeURIComponent(item.titleKey)}/icon`, { method: "POST", body });
      item.iconUrl = response.iconUrl;
      iconFile.value = null;
      await load();
      toast.add({ title: "成就图标已上传", color: "success" });
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "无法上传成就图标，请稍后重试。").description;
    } finally {
      iconUploading.value = false;
    }
  }

  async function endChallenge() {
    const item = endTarget.value;
    if (!item) return;
    if (item.family === "title_catalog") {
      await saveCatalogTitle(item, "retired", false);
      closeEnd();
      return;
    }
    if (await save(item, updatePayload(item, "retired"), "挑战已下线")) closeEnd();
  }

  return {
    items, maps, modes, loading, errorMessage, updatedCatalogIds,
    editingId, planningId, retirementVersions, endTarget, savingId, iconFile, iconUploading,
    createOpen, creating, editingItem, editorOpen, endingCatalog, mapItems,
    achievementStatusText, achievementItemStatusTone, isSaving,
    load, openCreate, createAchievement, saveEditingItem, updateEditingCatalogLifecycle, updateEditingPublicVisibility,
    planSunsetting, reopen, openEnd, closeEnd, toggleEditing, closeEditing, uploadIcon, endChallenge,
  };
}
