import { ref } from "vue";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import {
  type AchievementStatus,
  type AdminAchievement,
  type AdminMap,
  type MapAchievement,
  isMap,
  itemIdentity,
} from "~/components/admin/admin-achievement-types";

/** State and write actions for the admin map-challenge route. */
export function useAdminAchievementWorkspace() {
  const api = useAdminApi();
  const items = ref<AdminAchievement[]>([]);
  const editingId = ref<string | null>(null);
  const savingId = ref<string | null>(null);
  const toast = useToast();
  const errorMessage = ref("");
  const maps = ref<AdminMap[]>([]);
  const isSaving = (item: AdminAchievement) => savingId.value === itemIdentity(item);
  const mapItems = computed(() => items.value.filter(isMap));
  const editingItem = computed(() => items.value.find((candidate): candidate is MapAchievement => itemIdentity(candidate) === editingId.value && isMap(candidate)) ?? null);
  const editorOpen = computed({
    get: () => editingItem.value !== null,
    set: (open: boolean) => { if (!open) closeEditing(); },
  });
  const adminData = useAdminAsyncData("achievements", async () => {
      const [response, mapResponse] = await Promise.all([
        api<{ items: AdminAchievement[] }>("/v1/achievements"),
        api<{ items: AdminMap[] }>("/v1/maps"),
      ]);
      return { items: response.items, maps: mapResponse.items };
    }, {
      onStart: () => { errorMessage.value = ""; },
      onData: ({ items: nextItems, maps: nextMaps }) => {
        items.value = nextItems;
        maps.value = nextMaps;
        if (editingId.value && !nextItems.some((item) => itemIdentity(item) === editingId.value)) editingId.value = null;
      },
      onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取成就目录，请稍后重试。").description; },
    });
  const loading = adminData.loading;

  async function load() {
    errorMessage.value = "";
    await adminData.refresh();
  }

  function mapUpdate(item: MapAchievement, status: AchievementStatus = item.status) {
    return {
      family: "map",
      name: item.name,
      difficulty: item.difficulty ?? null,
      condition: item.condition,
      evidenceRule: item.evidenceRule,
      submissionMode: item.submissionMode,
      status,
      ...(status === "active" ? { retiredVersion: item.retiredVersion?.trim() || null } : {}),
    };
  }

  async function save(item: MapAchievement) {
    savingId.value = itemIdentity(item);
    errorMessage.value = "";
    try {
      const updated = await api<AdminAchievement>(`/v1/achievements/${encodeURIComponent(item.challengeId)}`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", ...mapUpdate(item) },
      });
      items.value = items.value.map((candidate) => itemIdentity(candidate) === itemIdentity(updated) ? updated : candidate);
      await load();
      toast.add({ title: "地图挑战规则已保存", color: "success" });
      return true;
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "无法保存成就规则，请稍后重试。").description;
      return false;
    } finally {
      savingId.value = null;
    }
  }

  async function saveEditingItem(item: AdminAchievement) {
    if (isMap(item) && await save(item)) editingId.value = null;
  }

  function toggleEditing(item: AdminAchievement) {
    const identity = itemIdentity(item);
    editingId.value = editingId.value === identity ? null : identity;
  }

  function closeEditing() {
    editingId.value = null;
  }

  return {
    items, maps, loading, errorMessage,
    editingId, savingId, editingItem, editorOpen, mapItems,
    isSaving, load, saveEditingItem, toggleEditing, closeEditing,
  };
}
