import { qqChangelogPushRequestSchema } from "@owbastion/contracts";
import { errorGroup, maintainerRoute, type AdminRouteDependencies, type ApiApp } from "./route-contract";

export const registerAdminQqChangelogRoutes = (app: ApiApp, { services, requireMaintainer, adminMutation }: AdminRouteDependencies) => {
  app.post("/v1/admin/qq/changelog-pushes", (c) => adminMutation(c, {
    schema: qqChangelogPushRequestSchema,
    // The push is idempotent per version and group, so the header only satisfies the admin write contract.
    action: async (input, auth) => ({ contractVersion: "1", items: await services(c).requestQqChangelogPush(input, auth) }),
    errors: {
      ...errorGroup(409, "A selected group already received this version; confirm the resend", "QQ_CHANGELOG_ALREADY_SENT"),
      ...errorGroup(422, "A selected group does not exist or is disconnected", "QQ_CHANGELOG_GROUP_NOT_PUSHABLE"),
    },
  }));

  app.get("/v1/admin/qq/changelog-pushes", maintainerRoute(requireMaintainer, async (c, auth) => {
    const version = c.req.query("version");
    return c.json({ contractVersion: "1", items: await services(c).listQqChangelogPushes({ version }, auth) });
  }));
};
