export default defineNuxtRouteMiddleware(async (to) => {
  const { player, status, refresh } = useCurrentPlayer();
  if (status.value === "unknown" || status.value === "loading") await refresh();
  if (status.value !== "authenticated" || !player.value) return navigateTo({ path: "/login", query: { returnTo: to.fullPath } });
});
