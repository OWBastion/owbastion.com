import {
  computed,
  onMounted,
  onUnmounted,
  readonly,
  shallowRef,
} from "vue";

export type StudioLoadingState = "loading" | "ready" | "unavailable";

interface UseStudioLoadingOptions {
  timeoutMs?: number;
}

const studioElementSelector = "nuxt-studio";
const defaultTimeoutMs = 8_000;

export function useStudioLoading(options: UseStudioLoadingOptions = {}) {
  const state = shallowRef<StudioLoadingState>("loading");
  const isLoading = computed(() => state.value === "loading");
  const isUnavailable = computed(() => state.value === "unavailable");

  let active = false;
  let settled = false;
  let observer: MutationObserver | undefined;
  let timeoutId: number | undefined;
  let frameId: number | undefined;

  const cleanup = () => {
    observer?.disconnect();
    observer = undefined;

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    if (frameId !== undefined) {
      window.cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  };

  const setState = (nextState: Exclude<StudioLoadingState, "loading">) => {
    if (!active || settled) {
      return;
    }

    settled = true;
    state.value = nextState;
    cleanup();
  };

  const scheduleReady = () => {
    if (
      !active ||
      settled ||
      frameId !== undefined ||
      !document.querySelector(studioElementSelector)
    ) {
      return;
    }

    if (typeof window.requestAnimationFrame !== "function") {
      setState("ready");
      return;
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = undefined;
      setState("ready");
    });
  };

  const checkForStudio = () => {
    scheduleReady();
  };

  onMounted(() => {
    active = true;
    checkForStudio();

    observer = new MutationObserver(checkForStudio);
    observer.observe(document.body, { childList: true, subtree: true });

    if (typeof customElements !== "undefined") {
      customElements.whenDefined(studioElementSelector).then(checkForStudio);
    }

    timeoutId = window.setTimeout(
      () => setState("unavailable"),
      options.timeoutMs ?? defaultTimeoutMs,
    );
  });

  onUnmounted(() => {
    active = false;
    cleanup();
  });

  return {
    state: readonly(state),
    isLoading,
    isUnavailable,
  };
}
