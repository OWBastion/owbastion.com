import { safeReturnTo } from "~/utils/safeReturnTo";
import { portalErrorDetails } from "~/utils/portal-error";

type LoginState = "idle" | "creating" | "waiting" | "verified" | "session-establishing" | "expired" | "failed" | "cancelled";
type StoredAttempt = { attemptId: string; attemptToken: string; code: string; expiresAt: number };

const storageKey = "owbastion-login-attempt";

export function useLoginAttempt() {
  const api = usePortalApi();
  const state = ref<LoginState>("idle");
  const attempt = ref<StoredAttempt | null>(null);
  const secondsLeft = ref(0);
  const message = ref("");
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;

  const stopTimers = () => {
    if (pollTimer) clearTimeout(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    pollTimer = undefined;
    countdownTimer = undefined;
  };

  const clearAttempt = () => {
    stopTimers();
    attempt.value = null;
    secondsLeft.value = 0;
    if (import.meta.client) sessionStorage.removeItem(storageKey);
  };

  const tick = () => {
    if (!attempt.value) return;
    secondsLeft.value = Math.max(0, Math.ceil((attempt.value.expiresAt - Date.now()) / 1000));
    if (secondsLeft.value === 0) {
      clearAttempt();
      state.value = "expired";
    }
  };

  const scheduleCountdown = () => {
    tick();
    if (state.value === "waiting") countdownTimer = setInterval(tick, 1000);
  };

  const persist = () => {
    if (import.meta.client && attempt.value) sessionStorage.setItem(storageKey, JSON.stringify(attempt.value));
  };

  const poll = async (returnTo: string) => {
    if (!attempt.value || state.value !== "waiting") return;
    try {
      const result = await api<{ status: "pending" | "verified" | "expired" }>(`/v1/auth/qq/login-attempt/${attempt.value.attemptId}`, { headers: { "x-login-attempt-token": attempt.value.attemptToken } });
      if (result.status === "verified") {
        state.value = "verified";
        clearAttempt();
        state.value = "session-establishing";
        await navigateTo({ path: "/login/complete", query: { returnTo } });
        return;
      }
      if (result.status === "expired") {
        clearAttempt();
        state.value = "expired";
        return;
      }
      pollTimer = setTimeout(() => void poll(returnTo), 2000);
    } catch (error) {
      message.value = portalErrorDetails(error, "无法连接验证服务，请稍后重试。").description;
      state.value = "failed";
    }
  };

  const start = async (returnTo: string) => {
    if (state.value === "creating" || state.value === "waiting") return;
    clearAttempt();
    state.value = "creating";
    message.value = "";
    try {
      attempt.value = await api<StoredAttempt>("/v1/auth/qq/login-attempt", { method: "POST", body: { contractVersion: "1", provider: "qq" } });
      state.value = "waiting";
      persist();
      scheduleCountdown();
      void poll(returnTo);
    } catch (error) {
      message.value = portalErrorDetails(error, "无法创建验证码，请稍后重试。").description;
      state.value = "failed";
    }
  };

  const restore = (returnTo: string) => {
    if (!import.meta.client || state.value !== "idle") return;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredAttempt;
      if (!saved.attemptId || !saved.attemptToken || !saved.code || saved.expiresAt <= Date.now()) throw new Error("expired");
      attempt.value = saved;
      state.value = "waiting";
      scheduleCountdown();
      void poll(returnTo);
    } catch {
      clearAttempt();
      state.value = "expired";
    }
  };

  const cancel = () => {
    clearAttempt();
    state.value = "cancelled";
  };

  const copyCode = async () => {
    if (!attempt.value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`/验证 ${attempt.value.code}`);
  };

  onBeforeUnmount(stopTimers);

  return { state, attempt, secondsLeft, message, start, restore, cancel, copyCode, safeReturnTo };
}
