export type LocalDevAccount = {
  accountId: string;
  playerId: string;
  playerName: string;
  isAdmin: boolean;
};

export function useLocalDevAuth() {
  const config = useRuntimeConfig();
  const api = usePortalApi();
  const accounts = shallowRef<LocalDevAccount[]>([]);
  const selectedAccountId = shallowRef("");
  const loading = shallowRef(false);
  const errorMessage = shallowRef("");
  const { refresh } = useCurrentPlayer();

  const enabled = computed(() => String(config.public.localDevAuth) === "true");

  const load = async () => {
    if (!enabled.value || accounts.value.length) return;
    loading.value = true;
    errorMessage.value = "";
    try {
      const response = await api<{ accounts: LocalDevAccount[] }>("/v1/__local/accounts");
      accounts.value = response.accounts;
      selectedAccountId.value = response.accounts[0]?.accountId ?? "";
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "本地账号不可用，请启动 API 后重试。").description;
    } finally {
      loading.value = false;
    }
  };

  const login = async () => {
    if (!selectedAccountId.value) return null;
    loading.value = true;
    errorMessage.value = "";
    try {
      await api("/v1/__local/login", { method: "POST", body: { accountId: selectedAccountId.value } });
      const account = accounts.value.find((item) => item.accountId === selectedAccountId.value);
      await refresh({ force: true });
      return account ?? null;
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "本地登录失败，请先启动 API 并完成 seed。").description;
      return null;
    } finally {
      loading.value = false;
    }
  };

  return { accounts, selectedAccountId, loading, errorMessage, enabled, load, login };
}
import { portalErrorDetails } from "~/utils/portal-error";
