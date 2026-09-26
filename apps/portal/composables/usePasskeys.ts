import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { portalErrorDetails } from "~/utils/portal-error";

type OptionsResponse = { contractVersion: "1"; challengeId: string; options: Record<string, unknown>; playerName?: string; playerId?: string };

export function usePasskeys() {
  const api = usePortalApi();
  const busy = shallowRef(false);
  const errorMessage = shallowRef("");
  const errorCode = shallowRef("");

  const registrationError = (error: unknown) => {
    if (error instanceof Error && error.name === "NotAllowedError") return "已取消 Passkey 操作。";
    return portalErrorDetails(error, "Passkey 操作失败，请稍后重试。").description;
  };

  async function login(returnTo: string) {
    if (busy.value) return;
    busy.value = true;
    errorMessage.value = "";
    errorCode.value = "";
    try {
      const options = await api<OptionsResponse>("/v1/auth/passkeys/login/options", { method: "POST", body: { contractVersion: "1" } });
      const credential = await startAuthentication({ optionsJSON: options.options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      await api("/v1/auth/passkeys/login/verify", { method: "POST", body: { contractVersion: "1", challengeId: options.challengeId, credential } });
      await navigateTo({ path: "/login/complete", query: { returnTo } });
    } catch (error) {
      errorMessage.value = registrationError(error);
      errorCode.value = portalErrorDetails(error).code ?? "";
    } finally { busy.value = false; }
  }

  async function registerInvitation(code: string, name: string) {
    if (busy.value) return null;
    busy.value = true;
    errorMessage.value = "";
    errorCode.value = "";
    try {
      const options = await api<OptionsResponse>("/v1/public/passkeys/invitations/options", { method: "POST", body: { contractVersion: "1", code } });
      const credential = await startRegistration({ optionsJSON: options.options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      await api("/v1/public/passkeys/invitations/verify", { method: "POST", body: { contractVersion: "1", challengeId: options.challengeId, credential, name } });
      await navigateTo({ path: "/login/complete", query: { returnTo: "/me" } });
      return { playerName: options.playerName ?? "", playerId: options.playerId ?? "" };
    } catch (error) {
      errorMessage.value = registrationError(error);
      errorCode.value = portalErrorDetails(error).code ?? "";
      return null;
    } finally { busy.value = false; }
  }

  async function registerCurrentPlayer(name: string) {
    if (busy.value) return false;
    busy.value = true;
    errorMessage.value = "";
    errorCode.value = "";
    try {
      const options = await api<OptionsResponse>("/v1/me/passkeys/registration/options", { method: "POST", body: { contractVersion: "1", name } });
      const credential = await startRegistration({ optionsJSON: options.options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      await api("/v1/me/passkeys/registration/verify", { method: "POST", body: { contractVersion: "1", challengeId: options.challengeId, credential, name } });
      return true;
    } catch (error) {
      errorMessage.value = registrationError(error);
      errorCode.value = portalErrorDetails(error).code ?? "";
      return false;
    } finally { busy.value = false; }
  }

  async function registerRecovery(token: string, name: string) {
    if (busy.value) return false;
    busy.value = true;
    errorMessage.value = "";
    errorCode.value = "";
    try {
      const options = await api<OptionsResponse>("/v1/public/passkeys/recovery/options", { method: "POST", body: { contractVersion: "1", token, name } });
      const credential = await startRegistration({ optionsJSON: options.options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      await api("/v1/public/passkeys/recovery/verify", { method: "POST", body: { contractVersion: "1", challengeId: options.challengeId, token, credential, name } });
      await navigateTo({ path: "/login/complete", query: { returnTo: "/me" } });
      return true;
    } catch (error) {
      errorMessage.value = registrationError(error);
      errorCode.value = portalErrorDetails(error).code ?? "";
      return false;
    } finally { busy.value = false; }
  }

  return { busy, errorMessage, errorCode, login, registerInvitation, registerCurrentPlayer, registerRecovery };
}
