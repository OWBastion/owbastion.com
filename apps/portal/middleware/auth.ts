export default defineNuxtRouteMiddleware(async (to) => {
  const { player, status, refresh } = useCurrentPlayer();
  if (status.value === "unknown" || status.value === "loading") {
    try {
      await refresh();
    } catch {
      // Let the page render its request failure state instead of replacing it
      // with a route-level error while the session endpoint is unavailable.
      return;
    }
  }
  if (status.value !== "authenticated" || !player.value) return navigateTo({ path: "/login", query: { returnTo: to.fullPath } });
});
