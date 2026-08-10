import type { CurrentPlayerMasteryResponse } from "./usePortalApi";
import { portalErrorDetails } from "~/utils/portal-error";

type HistoryRequest = { mapId: string; page?: number; pageSize?: number };

const historyPath = ({ mapId, page = 1, pageSize = 10 }: Required<HistoryRequest>) => {
  const search = new URLSearchParams({ mapId, page: String(page), pageSize: String(pageSize) });
  return `/v1/me/mastery?${search}`;
};

export function usePlayerMastery() {
  const api = usePortalApi();
  const profiles = shallowRef<CurrentPlayerMasteryResponse["profiles"]>([]);
  const overviewLoading = shallowRef(false);
  const overviewError = shallowRef("");
  const history = shallowRef<CurrentPlayerMasteryResponse | null>(null);
  const historyMapId = shallowRef<string | null>(null);
  const historyLoading = shallowRef(false);
  const historyError = shallowRef("");
  let historyRequest = 0;

  const refreshOverview = async () => {
    overviewLoading.value = true;
    overviewError.value = "";
    try {
      const response = await api<CurrentPlayerMasteryResponse>("/v1/me/mastery?page=1&pageSize=1");
      profiles.value = response.profiles;
      return response;
    } catch (error) {
      overviewError.value = portalErrorDetails(error, "无法读取精通记录，请稍后重试。").description;
      return null;
    } finally {
      overviewLoading.value = false;
    }
  };

  const loadHistory = async ({ mapId, page = 1, pageSize = 10 }: HistoryRequest) => {
    const requestId = ++historyRequest;
    const normalizedMapId = mapId.trim();
    if (!normalizedMapId) return null;
    historyMapId.value = normalizedMapId;
    history.value = null;
    historyError.value = "";
    historyLoading.value = true;
    try {
      const response = await api<CurrentPlayerMasteryResponse>(historyPath({ mapId: normalizedMapId, page, pageSize }));
      if (requestId === historyRequest) history.value = response;
      return response;
    } catch (error) {
      if (requestId === historyRequest) historyError.value = portalErrorDetails(error, "无法读取通关记录，请稍后重试。").description;
      return null;
    } finally {
      if (requestId === historyRequest) historyLoading.value = false;
    }
  };

  return { profiles, overviewLoading, overviewError, refreshOverview, history, historyMapId, historyLoading, historyError, loadHistory };
}
