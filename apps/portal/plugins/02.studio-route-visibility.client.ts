import { isStudioVisibleRoute } from "~/utils/studio-route";

const studioElementSelector = "nuxt-studio";

const syncStudioVisibility = (path: string) => {
  const studioElement = document.querySelector<HTMLElement>(studioElementSelector);
  if (!studioElement) return;

  const isVisible = isStudioVisibleRoute(path);
  studioElement.hidden = !isVisible;

  if (isVisible) {
    studioElement.removeAttribute("aria-hidden");
  } else {
    studioElement.setAttribute("aria-hidden", "true");
  }
};

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter();
  const syncCurrentRoute = () => syncStudioVisibility(router.currentRoute.value.path);

  nuxtApp.hook("app:mounted", () => {
    syncCurrentRoute();

    const observer = new MutationObserver(syncCurrentRoute);
    observer.observe(document.body, { childList: true });

    router.afterEach((to) => syncStudioVisibility(to.path));
  });
});
