import { adminSeasonWriteRequestSchema } from "@owbastion/contracts";
import { maintainerRoute, type AdminRouteDependencies, type ApiApp } from "./route-contract";

export const registerAdminSeasonRoutes = (app: ApiApp, dependencies: AdminRouteDependencies) => {
  const { services, requireMaintainer, errorGroup, adminMutation } = dependencies;
  const errors = {
    ...errorGroup(404, "The season does not exist", "SEASON_NOT_FOUND"),
    ...errorGroup(422, "The season must end after it starts", "SEASON_RANGE_INVALID"),
    ...errorGroup(409, "Season windows cannot overlap", "SEASON_OVERLAP"),
    ...errorGroup(409, "A running season cannot change its start or return to draft", "SEASON_STARTED"),
    ...errorGroup(409, "Only a running season can end early", "SEASON_NOT_RUNNING"),
  };

  app.get("/v1/admin/seasons", maintainerRoute(requireMaintainer, async (c, auth) => c.json(await services(c).listAdminSeasons(auth))));

  app.post("/v1/admin/seasons", (c) => adminMutation(c, {
    schema: adminSeasonWriteRequestSchema,
    status: 201,
    action: (input, auth, key) => services(c).createAdminSeason(input, auth, key),
    errors,
  }));

  app.put("/v1/admin/seasons/:seasonId", (c) => adminMutation(c, {
    schema: adminSeasonWriteRequestSchema,
    action: (input, auth, key) => services(c).updateAdminSeason({ ...input, seasonId: c.req.param("seasonId") }, auth, key),
    errors,
  }));

  app.post("/v1/admin/seasons/:seasonId/end", (c) => adminMutation(c, {
    action: (_input, auth, key) => services(c).endAdminSeason({ seasonId: c.req.param("seasonId") }, auth, key),
    errors,
  }));
};
