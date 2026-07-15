export default defineNuxtRouteMiddleware(async () => {
  const { player, refresh } = useCurrentPlayer();
  if (!player.value) await refresh();
  if (!player.value) return navigateTo("/login");
  if (!player.value.player.isAdmin) return navigateTo("/me");
});
