export default defineNuxtRouteMiddleware(async (to) => {
  const { player, status, refresh } = useCurrentPlayer();
  if (status.value === "unknown" || status.value === "loading") {
    try {
      await refresh();
    } catch {
      return navigateTo({ path: "/login", query: { returnTo: to.fullPath } });
    }
  }
  if (status.value !== "authenticated" || !player.value) return navigateTo({ path: "/login", query: { returnTo: to.fullPath } });
  if (!player.value.player.isAdmin) return navigateTo("/me");
});
