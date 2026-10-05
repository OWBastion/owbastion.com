import type { PlayerActivityResponse } from "./usePortalApi";
import { portalErrorDetails } from "~/utils/portal-error";

export function usePlayerActivity() {
  const api = usePortalApi();
  const days = shallowRef<PlayerActivityResponse["days"]>([]);
  const loading = shallowRef(false);
  const ready = shallowRef(false);
  const error = shallowRef("");

  const refresh = async () => {
    loading.value = true;
    error.value = "";
    try {
      const response = await api<PlayerActivityResponse>("/v1/me/activity");
      days.value = response.days;
      ready.value = true;
      return response;
    } catch (cause) {
      ready.value = false;
      error.value = portalErrorDetails(cause, "无法读取通关记录，请稍后重试。").description;
      return null;
    } finally {
      loading.value = false;
    }
  };

  return { days, loading, ready, error, refresh };
}
