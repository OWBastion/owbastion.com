import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, installSchema, now, seedTitle } from "../test/map-title-rule-fixtures";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

const setup = async () => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  seedTitle(sqlite, "RESTORE_COMPLETION");
  sqlite.prepare("UPDATE title_catalog SET scope = 'global', display_kind = 'fixed' WHERE key = 'RESTORE_COMPLETION'").run();
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.restore', 'restore', 'Restore', 'restore', ?, ?)").run(now, now);
  const services = createPlatformServices(database);
  const { grantId } = await services.createAdminManualTitleGrant({ contractVersion: "1", playerAccountId: "player.restore", titleKey: "RESTORE_COMPLETION" }, auth, "grant");
  const grant = () => sqlite.prepare("SELECT status, revocation_type FROM player_title_grants WHERE id = ?").get(grantId);
  return { sqlite, services, grantId, grant };
};

describe("administrator restore of a title Grant", () => {
  it("keeps the Grant evidence-revoked when its Completion was invalidated while revoked", async () => {
    const { sqlite, services, grantId, grant } = await setup();
    await services.revokeAdminTitleGrant({ grantId }, auth, "revoke");
    // Run invalidation only touches active Grants, so the Completion turns invalidated and the Grant stays revoked.
    sqlite.prepare("UPDATE challenge_completions SET status = 'invalidated' WHERE id = (SELECT completion_id FROM player_title_grants WHERE id = ?)").run(grantId);

    await services.restoreAdminTitleGrant({ grantId }, auth, "restore");

    expect(grant()).toEqual({ status: "revoked", revocation_type: "evidence" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE id = ? AND status = 'active'").get(grantId)).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.title.restore' AND entity_id = ?").get(grantId)).toEqual({ count: 1 });
    await expect(services.restoreAdminTitleGrant({ grantId }, auth, "restore")).resolves.toBeUndefined();
    await expect(services.restoreAdminTitleGrant({ grantId }, auth, "restore-again")).rejects.toThrow("TITLE_GRANT_NOT_ADMINISTRATIVELY_REVOKED");
  });

  it("restores the Grant to active when its Completion is still active", async () => {
    const { services, grantId, grant } = await setup();
    await services.revokeAdminTitleGrant({ grantId }, auth, "revoke");

    await services.restoreAdminTitleGrant({ grantId }, auth, "restore");

    expect(grant()).toEqual({ status: "active", revocation_type: null });
  });
});
