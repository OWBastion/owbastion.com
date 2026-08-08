import { onBeforeUnmount, onMounted, shallowRef } from "vue";

type StudioHost = {
  ui?: {
    activateStudio?: () => void;
    deactivateStudio?: () => void;
    expandSidebar?: () => void;
    collapseSidebar?: () => void;
  };
  on?: { mounted?: (fn: () => void) => void };
};

type StudioSession = {
  user?: { email?: string };
};

export type StudioEditorStatus = "loading" | "open" | "closed" | "error";

const studioLoginUrl = "/api/studio/login?redirect=%2Fadmin%2Fcontent";

const getStudioHost = () => (window as Window & { useStudioHost?: () => StudioHost }).useStudioHost?.();

export function useStudioEditorWorkspace() {
  const status = shallowRef<StudioEditorStatus>("loading");
  const errorMessage = shallowRef("");
  const isEditorOpen = shallowRef(false);
  let editorStateObserver: MutationObserver | undefined;
  let hostReadyObserver: MutationObserver | undefined;
  let requestId = 0;
  let isCleaningUp = false;
  let studioActiveForWorkspace = false;

  const setPagePresentation = (editorOpen: boolean) => {
    const appRoot = document.getElementById("__nuxt");
    if (editorOpen) {
      document.body.setAttribute("data-studio-fullscreen", "true");
      if (appRoot) {
        appRoot.setAttribute("inert", "");
        appRoot.setAttribute("aria-hidden", "true");
      }
      return;
    }

    document.body.removeAttribute("data-studio-fullscreen");
    if (appRoot) {
      appRoot.removeAttribute("inert");
      appRoot.removeAttribute("aria-hidden");
    }
  };

  const syncEditorState = () => {
    const editorOpen = document.body.hasAttribute("data-expand-sidebar");
    const wasEditorOpen = isEditorOpen.value;
    isEditorOpen.value = editorOpen;

    if (editorOpen) {
      setPagePresentation(true);
      status.value = "open";
      return;
    }

    if (!isCleaningUp && !editorOpen && wasEditorOpen && studioActiveForWorkspace && status.value === "open") {
      setPagePresentation(false);
      status.value = "closed";
      studioActiveForWorkspace = false;
      getStudioHost()?.ui?.deactivateStudio?.();
      return;
    }

    if (!editorOpen) setPagePresentation(false);
  };

  const openHost = (host: StudioHost, currentRequestId: number) => {
    if (currentRequestId !== requestId) return;
    if (!host.ui?.expandSidebar) {
      status.value = "error";
      errorMessage.value = "内容编辑器暂时无法载入，请刷新后重试。";
      return;
    }

    setPagePresentation(true);
    studioActiveForWorkspace = true;
    host.ui.activateStudio?.();
    if (host.on?.mounted) {
      host.on.mounted(() => {
        if (currentRequestId === requestId && !isCleaningUp) host.ui?.expandSidebar?.();
      });
    } else {
      host.ui.expandSidebar();
    }
  };

  const waitForHost = (currentRequestId: number) => {
    const host = getStudioHost();
    if (host) {
      openHost(host, currentRequestId);
      return;
    }

    hostReadyObserver?.disconnect();
    hostReadyObserver = new MutationObserver(() => {
      const readyHost = getStudioHost();
      if (!readyHost) return;
      hostReadyObserver?.disconnect();
      hostReadyObserver = undefined;
      openHost(readyHost, currentRequestId);
    });
    hostReadyObserver.observe(document.body, { childList: true });
  };

  const redirectToLogin = () => {
    window.location.assign(studioLoginUrl);
  };

  const start = async () => {
    const currentRequestId = ++requestId;
    status.value = "loading";
    errorMessage.value = "";
    hostReadyObserver?.disconnect();

    const existingHost = getStudioHost();
    if (existingHost) {
      openHost(existingHost, currentRequestId);
      return;
    }

    try {
      const response = await fetch("/__nuxt_studio/auth/session", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (currentRequestId !== requestId) return;
      if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        return;
      }
      if (!response.ok) throw new Error(`Studio session request failed: ${response.status}`);

      const session = await response.json() as StudioSession;
      if (!session.user?.email) {
        redirectToLogin();
        return;
      }
      waitForHost(currentRequestId);
    } catch {
      if (currentRequestId !== requestId) return;
      status.value = "error";
      errorMessage.value = "内容编辑器暂时无法载入，请稍后重试。";
    }
  };

  onMounted(() => {
    syncEditorState();
    editorStateObserver = new MutationObserver(syncEditorState);
    editorStateObserver.observe(document.body, { attributes: true, attributeFilter: ["data-expand-sidebar"] });
    void start();
  });

  onBeforeUnmount(() => {
    isCleaningUp = true;
    requestId += 1;
    hostReadyObserver?.disconnect();
    editorStateObserver?.disconnect();
    const host = getStudioHost();
    if (studioActiveForWorkspace) {
      studioActiveForWorkspace = false;
      host?.ui?.deactivateStudio?.();
    } else if (document.body.hasAttribute("data-expand-sidebar")) {
      host?.ui?.collapseSidebar?.();
    }
    setPagePresentation(false);
  });

  return { status, errorMessage, isEditorOpen, start, redirectToLogin };
}
