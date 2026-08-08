import { onBeforeUnmount, onMounted, shallowRef, type Ref } from "vue";

type StudioRoute = { path: string; fullPath?: string };

type StudioDocument = {
  fsPath?: string;
  path?: string;
  routePath?: string;
};

type StudioRouter = {
  beforeEach?: (guard: (to: StudioRoute, from: StudioRoute) => Promise<boolean | void> | boolean | void) => () => void;
};

type StudioNuxtApp = {
  $router?: StudioRouter;
  callHook?: (name: string, payload?: unknown) => Promise<unknown>;
};

type StudioHost = {
  ui?: {
    activateStudio?: () => void;
    deactivateStudio?: () => void;
    expandSidebar?: () => void;
    collapseSidebar?: () => void;
  };
  document?: {
    db?: { list?: () => Promise<StudioDocument[]> };
  };
  on?: { mounted?: (fn: () => void) => void };
};

type StudioSession = {
  user?: { email?: string };
};

export type StudioEditorStatus = "loading" | "open" | "closed" | "error";

const studioLoginUrl = "/api/studio/login?redirect=%2Fadmin%2Fcontent";
const adminContentPath = "/admin/content";

const getStudioHost = () => (window as Window & { useStudioHost?: () => StudioHost }).useStudioHost?.();

const getNuxtApp = () => (window as Window & { useNuxtApp?: () => StudioNuxtApp }).useNuxtApp?.();

const embeddedStudioLayout = `
  :host([data-studio-embedded]) {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
  }
  :host([data-studio-embedded]) .fixed.top-0.bottom-0.left-0 {
    position: relative !important;
    inset: auto !important;
    width: 100% !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    z-index: auto !important;
    transform: none !important;
  }
  :host([data-studio-embedded]) .fixed.top-0.bottom-0.left-0 .flex-1.overflow-y-auto.relative {
    flex: none !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
  :host([data-studio-embedded]) .fixed.top-0.bottom-0.left-0 > .flex-1.overflow-y-auto.relative {
    flex: none !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }
`;

export function useStudioEditorWorkspace(mountTarget: Ref<HTMLElement | null>) {
  const status = shallowRef<StudioEditorStatus>("loading");
  const errorMessage = shallowRef("");
  const isEditorOpen = shallowRef(false);
  let editorStateObserver: MutationObserver | undefined;
  let hostReadyObserver: MutationObserver | undefined;
  let requestId = 0;
  let isCleaningUp = false;
  let studioActiveForWorkspace = false;
  let removeRouteGuard: (() => void) | undefined;
  let previewNavigationPath: string | null = null;
  const toast = useToast();

  const getStudioElement = () => document.querySelector("nuxt-studio") as HTMLElement | null;

  const syncEmbeddedStudioLayout = (element: HTMLElement) => {
    const root = element.shadowRoot;
    if (!root) return;
    let style = root.querySelector<HTMLStyleElement>("[data-portal-embedded-layout]");
    if (!style) {
      style = document.createElement("style");
      style.setAttribute("data-portal-embedded-layout", "");
      root.appendChild(style);
    }
    style.textContent = embeddedStudioLayout;
  };

  const mountStudioElement = () => {
    const element = getStudioElement();
    const target = mountTarget.value;
    if (!element || !target) return false;
    if (element.parentElement !== target) target.appendChild(element);
    element.setAttribute("data-studio-embedded", "true");
    syncEmbeddedStudioLayout(element);
    return true;
  };

  const restoreStudioElement = () => {
    const element = getStudioElement();
    if (!element || element.parentElement === document.body) return;
    element.removeAttribute("data-studio-embedded");
    document.body.appendChild(element);
  };

  const clearLegacyStudioLayoutStyles = () => {
    const style = document.querySelector("[data-studio-style]");
    if (style) style.textContent = "";
    // The pristine Studio host also shifts fixed elements (toasts, overlays) by
    // the sidebar width through inline `left`. The embedded workspace must not
    // keep that offset, so reset any Studio-applied left on fixed elements.
    document.querySelectorAll("*").forEach((el) => {
      const element = el as HTMLElement;
      if (window.getComputedStyle(element).position === "fixed" && element.style.left) {
        element.style.left = "";
      }
    });
  };

  const syncEditorState = () => {
    const editorOpen = document.body.hasAttribute("data-expand-sidebar");
    isEditorOpen.value = editorOpen;

    if (editorOpen) {
      status.value = "open";
      return;
    }

    if (!isCleaningUp && studioActiveForWorkspace && status.value === "open") {
      status.value = "closed";
      studioActiveForWorkspace = false;
      removeRouteGuard?.();
      removeRouteGuard = undefined;
      getStudioHost()?.ui?.deactivateStudio?.();
      return;
    }

    if (!editorOpen && status.value !== "error" && status.value !== "loading") status.value = "closed";
  };

  const interceptDocumentRoutes = (host: StudioHost) => {
    const router = getNuxtApp()?.$router;
    if (!router?.beforeEach || removeRouteGuard) return;

    removeRouteGuard = router.beforeEach(async (to) => {
      if (isCleaningUp || !studioActiveForWorkspace || to.path === adminContentPath || to.path.startsWith("/admin/")) return;
      if (previewNavigationPath === to.path) {
        previewNavigationPath = null;
        return;
      }
      const documents = await host.document?.db?.list?.() ?? [];
      const document = documents.find((item) => (item.routePath === to.path || item.path === to.path) && item.fsPath);
      if (!document?.fsPath) return;

      const callHook = getNuxtApp()?.callHook as unknown as ((name: string, payload: unknown) => Promise<unknown>) | undefined;
      await callHook?.("studio:document:edit", document.fsPath);
      toast.add({
        title: "已在编辑器中打开该文档",
        description: to.path,
        actions: [{
          label: "在页面中预览",
          onClick: () => {
            previewNavigationPath = to.path;
            void navigateTo(to.fullPath ?? to.path);
          },
        }],
      });
      return false;
    });
  };

  const openHost = (host: StudioHost, currentRequestId: number) => {
    if (currentRequestId !== requestId) return;
    if (!host.ui?.expandSidebar) {
      status.value = "error";
      errorMessage.value = "内容编辑器暂时无法载入，请刷新后重试。";
      return;
    }

    if (!mountStudioElement()) {
      hostReadyObserver?.disconnect();
      hostReadyObserver = new MutationObserver(() => {
        if (!mountStudioElement()) return;
        hostReadyObserver?.disconnect();
        hostReadyObserver = undefined;
        openHost(host, currentRequestId);
      });
      hostReadyObserver.observe(document.body, { childList: true });
      return;
    }

    studioActiveForWorkspace = true;
    interceptDocumentRoutes(host);
    host.ui.activateStudio?.();
    host.ui.expandSidebar();
    clearLegacyStudioLayoutStyles();
    if (host.on?.mounted) {
      host.on.mounted(() => {
        if (currentRequestId === requestId && !isCleaningUp) {
          host.ui?.expandSidebar?.();
          clearLegacyStudioLayoutStyles();
        }
      });
    } else {
      host.ui.expandSidebar();
      clearLegacyStudioLayoutStyles();
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

  const close = () => {
    studioActiveForWorkspace = false;
    removeRouteGuard?.();
    removeRouteGuard = undefined;
    getStudioHost()?.ui?.deactivateStudio?.();
    clearLegacyStudioLayoutStyles();
    isEditorOpen.value = false;
    status.value = "closed";
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
    removeRouteGuard?.();
    removeRouteGuard = undefined;
    const host = getStudioHost();
    if (studioActiveForWorkspace) {
      studioActiveForWorkspace = false;
      host?.ui?.deactivateStudio?.();
    } else if (document.body.hasAttribute("data-expand-sidebar")) {
      host?.ui?.collapseSidebar?.();
    }
    clearLegacyStudioLayoutStyles();
    restoreStudioElement();
  });

  return { status, errorMessage, isEditorOpen, start, close, redirectToLogin };
}
