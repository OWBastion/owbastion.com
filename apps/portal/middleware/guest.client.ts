import { hasSafeReturnTo, safeReturnTo } from "~/utils/safeReturnTo";

export default defineNuxtRouteMiddleware(async (to) => {
  const { player, status, refresh } = useCurrentPlayer();
  if (status.value === "unknown" || status.value === "loading") await refresh();
  if (status.value !== "authenticated" || !player.value) return;

  const target = hasSafeReturnTo(to.query.returnTo)
    ? safeReturnTo(to.query.returnTo)
    : player.value.player.isAdmin ? "/admin" : "/me";
  return navigateTo(target, { replace: true });
});
