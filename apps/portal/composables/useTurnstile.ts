type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback?: (token: string) => void;
    "expired-callback"?: () => void;
    "error-callback"?: () => void;
  }) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const turnstileScriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileScript: Promise<void> | undefined;

const loadTurnstileScript = () => {
  if (window.turnstile) return Promise.resolve();
  turnstileScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = turnstileScriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TURNSTILE_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
  return turnstileScript;
};

export const turnstileErrorMessage = (code: string | undefined, fallback: string) =>
  code === "TURNSTILE_UNAVAILABLE" ? "人机验证暂不可用，请稍后重试。" : code?.startsWith("TURNSTILE") ? "验证未通过，请重试。" : fallback;

// Turnstile tokens are single-use and expire, so the widget re-issues one whenever the
// current token is spent (reset) or lapses (expired-callback); forms read `token` at submit
// time and call `reset` after every attempt, per the managed-mode decision in #468.
export function useTurnstile() {
  const config = useRuntimeConfig();
  const siteKey = String(config.public.turnstileSiteKey ?? "");
  const element = shallowRef<HTMLElement>();
  const token = shallowRef("");
  const failed = shallowRef(false);
  let widgetId: string | undefined;

  const reset = () => {
    token.value = "";
    if (window.turnstile && widgetId) window.turnstile.reset(widgetId);
  };

  onMounted(async () => {
    if (!siteKey || !element.value) return;
    try { await loadTurnstileScript(); }
    catch { turnstileScript = undefined; failed.value = true; return; }
    if (!element.value || widgetId || !window.turnstile) return;
    widgetId = window.turnstile.render(element.value, {
      sitekey: siteKey,
      callback: (value) => { token.value = value; },
      "expired-callback": reset,
      "error-callback": () => { token.value = ""; },
    });
  });

  onBeforeUnmount(() => {
    if (window.turnstile && widgetId) window.turnstile.remove(widgetId);
    widgetId = undefined;
  });

  return { element, token, failed, reset };
}
