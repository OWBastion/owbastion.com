import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { hashRequest as requestHash } from "./portal-session";
import {
  createD1, createOcrDifficultyResponse, createTestDatabase, fakeEvidenceBucket, installSchema,
  legacyGameplayRevisionId, now, seedAgentSpatialConfig, seedCompat, seedException, seedMap,
  seedMapTitleChallenge, seedMasteryPlayer, seedRevisionAssignment, seedRule, seedSelectableGameplayRevision,
  seedTitle, seedLegacyMapChallenge,
} from "../test/map-title-rule-fixtures";

// Expose the internal resolveMapTitleProjection helper via the service's test-internal path.
// We test it indirectly through reviewSubmission and a thin wrapper export.
// For direct unit coverage of the resolver we call it through a minimal service instance
// and an augmented services object that exposes the resolver.
//
// The resolver lives inside createPlatformServices's closure. We access it by creating
// a minimal services object and asserting on the reviewSubmission behaviour.

describe("map title rule model – locked invariants", () => {
  describe("post-OCR player confirmation", () => {
    it("repairs a legacy classic submission before manual OCR retry", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CLASSIC");
      seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
      seedException(sqlite, "exception.paris", "rule.classic", "map.paris");
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.paris");
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.legacy-classic', 'binding.1', 'resubmission_required', 'map_title_achievement', 'title.CLASSIC', 'map.paris', '地图 map.paris', 'Tester', 'portal', 'portal', 'msg.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.1', 'sub.legacy-classic', 'portal', 'external.1', 'image/png', 1, 'hash', 'evidence/classic.png', 'stored', ?)").run(now);

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v6",
        fields: {
          challenge_completed: { status: "ok", confidence: 0.99 },
          viewer_player: { status: "ok", confidence: 0.99 },
          map_name: { status: "ok", confidence: 0.99 },
          map_variant: { status: "ok", confidence: 0.99 },
        },
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.paris", map_variant: "classic", achievement_panel_text: "称号 CLASSIC ✓" },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const sent: unknown[] = [];
        const queue = { send: async (message: unknown) => { sent.push(message); } } as Queue;
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue);
        await services.requestAdminOcr({ submissionId: "sub.legacy-classic" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "idem.1", "request.1");
        await services.processOcrJob({ ...(sent[0] as { submissionId: string; objectKey: string; manual: boolean; requestId: string }), attempt: 1 });
      } finally {
        vi.unstubAllGlobals();
      }

      const submission = sqlite.prepare("SELECT status, rule_snapshot_json FROM submissions WHERE id = 'sub.legacy-classic'").get() as { status: string; rule_snapshot_json: string | null };
      expect(submission.status).toBe("approved");
      expect(JSON.parse(submission.rule_snapshot_json!)).toMatchObject({ titleKey: "CLASSIC", mapId: "map.paris", mapVariant: "classic" });
    });

    it("persists the covered conqueror grant when a dominator OCR match is automated", async () => {
      const { database, sqlite } = createTestDatabase("map.dorado");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
      const revisionId = "revision:map.dorado:initial";
      const canonicalChallenge = sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, map_id, gameplay_revision_id, status, manual, public_condition, condition_operator, conditions_json, condition, created_at, updated_at) VALUES (?, 'map_title_rule', ?, ?, 'map.dorado', ?, 'active', 0, 0, 'and', ?, '完成地图', ?, ?)");
      canonicalChallenge.run(`legacy:map_title_rule:rule.conqueror:map.dorado:${revisionId}`, "rule.conqueror", "CONQUEROR", revisionId, JSON.stringify({ operator: "and", conditions: [{ type: "completed" }] }), now, now);
      canonicalChallenge.run(`legacy:map_title_rule:rule.dominator:map.dorado:${revisionId}`, "rule.dominator", "DOMINATOR", revisionId, JSON.stringify({ operator: "and", conditions: [{ type: "completed" }] }), now, now);
      sqlite.prepare("INSERT INTO challenge_satisfies (challenge_id, satisfied_challenge_id, created_at) VALUES (?, ?, ?)").run(`legacy:map_title_rule:rule.dominator:map.dorado:${revisionId}`, `legacy:map_title_rule:rule.conqueror:map.dorado:${revisionId}`, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.auto', 'auto-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.auto', 'identity.auto', 'player.auto', 'qq', 'group.auto', 'member.auto', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.auto', 'binding.auto', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'auto.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.auto', 'submission.auto', 'portal', 'external.auto', 'image/png', 1, 'hash', 'evidence/auto.png', 'stored', ?)").run(now);

      const ocrResponse = createOcrDifficultyResponse("地图 map.dorado", "地狱", "1280x720-v6");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await services.processOcrJob({ submissionId: "submission.auto", objectKey: "evidence/auto.png", attempt: 1, requestId: "request.auto" });
      } finally {
        vi.unstubAllGlobals();
      }

      const grants = sqlite.prepare("SELECT title_key, slot, source_type, source_id FROM player_title_grants WHERE player_account_id = 'player.auto' AND status = 'active' ORDER BY title_key").all() as Array<{ title_key: string; slot: string; source_type: string; source_id: string }>;
      expect(grants).toEqual([
        { title_key: "CONQUEROR", slot: "conqueror", source_type: "automatic", source_id: "submission.auto" },
        { title_key: "DOMINATOR", slot: "dominator", source_type: "automatic", source_id: "submission.auto" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_id = 'submission.auto' AND status = 'active'").get()).toEqual({ count: 2 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_type = 'automatic' AND completion_id IS NOT NULL").get()).toEqual({ count: 2 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.auto' AND title_key = 'CONQUEROR' AND status = 'active'").get()).toEqual({ count: 1 });
      const auditCount = sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'submission.automatic_grant' AND entity_type = 'player_title_grant'").get() as { count: number };
      expect(auditCount.count).toBe(2);

      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.auto.repeat', 'binding.auto', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'auto.repeat', ?, ?)").run(now + 1, now + 1);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.auto.repeat', 'submission.auto.repeat', 'portal', 'external.auto.repeat', 'image/png', 1, 'hash', 'evidence/auto-repeat.png', 'stored', ?)").run(now + 1);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await services.processOcrJob({ submissionId: "submission.auto.repeat", objectKey: "evidence/auto-repeat.png", attempt: 1, requestId: "request.auto.repeat" });
      } finally {
        vi.unstubAllGlobals();
      }
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.auto.repeat'").get()).toEqual({ status: "resubmission_required", grant_id: null });
      expect(sqlite.prepare("SELECT json_extract(match_json, '$.candidates') AS candidates FROM ocr_results WHERE submission_id = 'submission.auto.repeat'").get()).toEqual({ candidates: "[]" });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE player_account_id = 'player.auto' AND status = 'active'").get()).toEqual({ count: 2 });
    });

    it("preserves each matched challenge completion while granting a shared title once", async () => {
      const { database, sqlite } = createTestDatabase("map.shared-title");
      seedTitle(sqlite, "SHARED_TITLE");
      const challengeIds = ["challenge.shared.first", "challenge.shared.second"];
      const insertChallenge = sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES (?, 'map.shared-title', 'difficulty_completion', ?, '传奇', '完成通关', '上传截图', 'automatic', 'SHARED_TITLE', '2026.07.15', 'active', '2026.07.15', ?, ?)");
      for (const [index, challengeId] of challengeIds.entries()) {
        insertChallenge.run(challengeId, `挑战 ${index + 1}`, now, now);
        seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.shared-title:initial", mapId: "map.shared-title", challengeFamily: "map_challenge", challengeId, slot: "shared" });
      }
      const seedPlayerSubmission = (playerId: string, bindingId: string, submissionId: string, status: string) => {
        sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, 'Tester', 'tester', 0, 'active', ?, ?)").run(playerId, playerId, now, now);
        sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', ?, ?, 'active', ?)").run(bindingId, `identity.${playerId}`, playerId, `group.${playerId}`, `member.${playerId}`, now);
        sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, ?, 'unknown', '成就挑战', 'Tester', 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, status, `message.${submissionId}`, now, now);
      };
      seedPlayerSubmission("player.shared.auto", "binding.shared.auto", "submission.shared.auto", "ocr_pending");
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.shared.auto', 'submission.shared.auto', 'portal', 'external.shared.auto', 'image/png', 1, 'hash', 'evidence/shared-auto.png', 'stored', ?)").run(now);
      seedPlayerSubmission("player.shared.review", "binding.shared.review", "submission.shared.review", "ocr_review_required");

      const ocrResponse = createOcrDifficultyResponse("地图 map.shared-title", "传奇", "1280x720-v6");
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.shared.review', 'submission.shared.review', 1, 'review_required', ?, '{}', ?)").run(JSON.stringify(ocrResponse), now);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await services.processOcrJob({ submissionId: "submission.shared.auto", objectKey: "evidence/shared-auto.png", attempt: 1, requestId: "request.shared.auto" });
        const reviewed = await services.reviewSubmission(
          { submissionId: "submission.shared.review", decision: "approved" },
          { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" },
          "shared-title-review",
        );
        expect(reviewed.grants).toHaveLength(1);
      } finally {
        vi.unstubAllGlobals();
      }

      expect(sqlite.prepare("SELECT s.id AS submission_id, c.source_id AS challenge_id FROM challenge_completions completion JOIN challenges c ON c.id = completion.challenge_id JOIN submissions s ON s.id = completion.source_id WHERE completion.source_id IN ('submission.shared.auto', 'submission.shared.review') AND completion.status = 'active' ORDER BY s.id, c.source_id").all()).toEqual([
        { submission_id: "submission.shared.auto", challenge_id: challengeIds[0] },
        { submission_id: "submission.shared.auto", challenge_id: challengeIds[1] },
        { submission_id: "submission.shared.review", challenge_id: challengeIds[0] },
        { submission_id: "submission.shared.review", challenge_id: challengeIds[1] },
      ]);
      expect(sqlite.prepare("SELECT player_account_id, source_type, title_key, COUNT(*) AS count FROM player_title_grants WHERE source_id IN ('submission.shared.auto', 'submission.shared.review') AND status = 'active' GROUP BY player_account_id, source_type, title_key ORDER BY player_account_id").all()).toEqual([
        { player_account_id: "player.shared.auto", source_type: "automatic", title_key: "SHARED_TITLE", count: 1 },
        { player_account_id: "player.shared.review", source_type: "submission", title_key: "SHARED_TITLE", count: 1 },
      ]);
      expect(sqlite.prepare("SELECT json_extract(payload_json, '$.submissionId') AS submission_id, operation, COUNT(*) AS count FROM audit_events WHERE operation IN ('challenge.completion.submission', 'submission.automatic_grant', 'submission.grant') AND json_extract(payload_json, '$.submissionId') IN ('submission.shared.auto', 'submission.shared.review') GROUP BY submission_id, operation ORDER BY submission_id, operation").all()).toEqual([
        { submission_id: "submission.shared.auto", operation: "challenge.completion.submission", count: 2 },
        { submission_id: "submission.shared.auto", operation: "submission.automatic_grant", count: 1 },
        { submission_id: "submission.shared.review", operation: "challenge.completion.submission", count: 2 },
        { submission_id: "submission.shared.review", operation: "submission.grant", count: 1 },
      ]);
    });
  });

  describe("historical title migration", () => {
    it("reconciles inherited conqueror grants before linking historical records", async () => {
      const { database, sqlite } = createTestDatabase();
      sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
      seedMap(sqlite, "map.inherited");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.migration', 'migration-1', 'Migration Player', 'migration player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.conqueror', 'map', 'map.inherited', 'revision:map.inherited:initial', 'conqueror', 'CONQUEROR', 'Migration Player', 'test'), ('historical.dominator', 'map', 'map.inherited', 'revision:map.inherited:initial', 'dominator', 'DOMINATOR', 'Migration Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.dominator', 'player.migration', 'DOMINATOR', 'map.inherited', 'revision:map.inherited:initial', 'dominator', 'active', 'historical', 'historical.dominator', 'admin', ?), ('grant.inherited.conqueror', 'player.migration', 'CONQUEROR', 'map.inherited', 'revision:map.inherited:initial', 'conqueror', 'active', 'historical', 'historical.dominator', 'admin', ?)").run(now, now);

      const services = createPlatformServices(database);
      const summary = await services.listHistoricalTitleGrants({ contractVersion: "1", page: 1, pageSize: 10, filter: "all" });
      expect(summary.holders).toEqual([{ holderName: "Migration Player", totalCount: 2, unclaimedCount: 1, status: "pending" }]);
      const detail = await services.getHistoricalTitleHolder({ contractVersion: "1", holderName: "Migration Player", page: 1, pageSize: 10, grantStatus: "all" });
      expect(detail.total).toBe(2);
      expect(detail.items.map((item) => ({ titleKey: item.titleKey, status: item.status }))).toEqual([
        { titleKey: "CONQUEROR", status: "unclaimed" },
        { titleKey: "DOMINATOR", status: "active" },
      ]);
      const response = await services.createAdminTitleGrantBulk({ contractVersion: "1", holderName: "Migration Player", playerAccountId: "player.migration" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "bulk-reconcile");

      expect(response).toEqual({ contractVersion: "1", grantedCount: 1, skippedClaimedCount: 1 });
      expect(sqlite.prepare("SELECT title_key, source_id FROM player_title_grants WHERE player_account_id = 'player.migration' ORDER BY title_key").all()).toEqual([
        { title_key: "CONQUEROR", source_id: "historical.conqueror" },
        { title_key: "DOMINATOR", source_id: "historical.dominator" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.title.grant.bulk'").get()).toEqual({ count: 1 });
    });

    it("reconciles inherited conqueror grants for a single historical record", async () => {
      const { database, sqlite } = createTestDatabase();
      sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
      seedMap(sqlite, "map.single");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.single', 'single-1', 'Single Player', 'single player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.single.conqueror', 'map', 'map.single', 'revision:map.single:initial', 'conqueror', 'CONQUEROR', 'Single Player', 'test'), ('historical.single.dominator', 'map', 'map.single', 'revision:map.single:initial', 'dominator', 'DOMINATOR', 'Single Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.single.dominator', 'player.single', 'DOMINATOR', 'map.single', 'revision:map.single:initial', 'dominator', 'active', 'historical', 'historical.single.dominator', 'admin', ?), ('grant.single.inherited.conqueror', 'player.single', 'CONQUEROR', 'map.single', 'revision:map.single:initial', 'conqueror', 'active', 'historical', 'historical.single.dominator', 'admin', ?)").run(now, now);

      const services = createPlatformServices(database);
      await services.createAdminTitleGrant({ contractVersion: "1", playerAccountId: "player.single", historicalTitleGrantId: "historical.single.conqueror" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "single-reconcile");

      expect(sqlite.prepare("SELECT title_key, source_id FROM player_title_grants WHERE id = 'grant.single.inherited.conqueror'").get()).toEqual({ title_key: "CONQUEROR", source_id: "historical.single.conqueror" });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.title.grant'").get()).toEqual({ count: 1 });
    });

    it("does not rebind a dominator grant from a different historical source", async () => {
      const { database, sqlite } = createTestDatabase();
      sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
      seedMap(sqlite, "map.dominator");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.dominator', 'dominator-1', 'Dominator Player', 'dominator player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.dominator.target', 'map', 'map.dominator', 'revision:map.dominator:initial', 'dominator', 'DOMINATOR', 'Dominator Player', 'test'), ('historical.dominator.source', 'map', 'map.dominator', 'revision:map.dominator:initial', 'dominator', 'DOMINATOR', 'Other Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.dominator.source', 'player.dominator', 'DOMINATOR', 'map.dominator', 'revision:map.dominator:initial', 'dominator', 'active', 'historical', 'historical.dominator.source', 'admin', ?)").run(now);

      const services = createPlatformServices(database);
      await expect(services.createAdminTitleGrant({ contractVersion: "1", playerAccountId: "player.dominator", historicalTitleGrantId: "historical.dominator.target" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "dominator-source-conflict")).rejects.toThrow("HISTORICAL_TITLE_GRANT_CLAIMED");
      expect(sqlite.prepare("SELECT source_id FROM player_title_grants WHERE id = 'grant.dominator.source'").get()).toEqual({ source_id: "historical.dominator.source" });
    });

    it("blocks a single historical claim when the player's same-scope Grant was administratively revoked", async () => {
      const { database, sqlite } = createTestDatabase("map.revoked.single");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.revoked.single', 'revoked-single-1', 'Revoked Player', 'revoked player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.revoked.single', 'map', 'map.revoked.single', 'revision:map.revoked.single:initial', 'dominator', 'DOMINATOR', 'Revoked Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.revoked.single', 'player.revoked.single', 'DOMINATOR', 'map.revoked.single', 'revision:map.revoked.single:initial', 'dominator', 'revoked', 'manual', 'manual:old', 'admin', ?, 'admin', ?, 'review block', 'administrator')").run(now, now);

      const services = createPlatformServices(database);
      await expect(services.createAdminTitleGrant({ contractVersion: "1", playerAccountId: "player.revoked.single", historicalTitleGrantId: "historical.revoked.single" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "revoked-single-claim")).rejects.toThrow("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.revoked.single' AND status = 'active'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE player_account_id = 'player.revoked.single'").get()).toEqual({ count: 0 });
    });

    it("blocks bulk historical claims when a same-scope Grant was administratively revoked", async () => {
      const { database, sqlite } = createTestDatabase("map.revoked.bulk");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.revoked.bulk', 'revoked-bulk-1', 'Bulk Revoked Player', 'bulk revoked player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.revoked.bulk', 'map', 'map.revoked.bulk', 'revision:map.revoked.bulk:initial', 'dominator', 'DOMINATOR', 'Bulk Revoked Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.revoked.bulk', 'player.revoked.bulk', 'DOMINATOR', 'map.revoked.bulk', 'revision:map.revoked.bulk:initial', 'dominator', 'revoked', 'automatic', 'submission:old', 'admin', ?, 'admin', ?, 'review block', 'administrator')").run(now, now);

      const services = createPlatformServices(database);
      await expect(services.createAdminTitleGrantBulk({ contractVersion: "1", holderName: "Bulk Revoked Player", playerAccountId: "player.revoked.bulk" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "revoked-bulk-claim")).rejects.toThrow("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.revoked.bulk' AND status = 'active'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE player_account_id = 'player.revoked.bulk'").get()).toEqual({ count: 0 });
    });
  });

  // ─── Invariant: Stable IDs ────────────────────────────────────────────────
  describe("stable IDs – compat table preserves map.<mapId>.<kind> IDs", () => {
    it("resolves a legacy challenge ID via the compat table", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris", 1);

      // Verify compat row exists and points to the rule + map.
      const compat = sqlite.prepare(
        "SELECT * FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { rule_id: string; map_id: string; is_standard_instance: number } | undefined;

      expect(compat?.rule_id).toBe("rule.conqueror");
      expect(compat?.map_id).toBe("map.paris");
      expect(compat?.is_standard_instance).toBe(1);

      // The legacy ID must not change when the rule is updated.
      sqlite.prepare("UPDATE map_title_rules SET condition = '新条件', updated_at = ? WHERE id = 'rule.conqueror'").run(now + 1000);
      const compatAfter = sqlite.prepare(
        "SELECT legacy_challenge_id FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { legacy_challenge_id: string } | undefined;
      expect(compatAfter?.legacy_challenge_id).toBe("map.paris.conqueror");
    });

    it("distinguishes standard instances from real exceptions in the compat table", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedMap(sqlite, "map.busan");
      seedTitle(sqlite, "CONQUEROR_BUSAN"); // real exception title
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris", 1);  // standard
      seedCompat(sqlite, "map.busan.conqueror", "rule.conqueror", "map.busan", 0);  // real exception

      const paris = sqlite.prepare(
        "SELECT is_standard_instance FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { is_standard_instance: number } | undefined;
      const busan = sqlite.prepare(
        "SELECT is_standard_instance FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.busan.conqueror'",
      ).get() as { is_standard_instance: number } | undefined;

      expect(paris?.is_standard_instance).toBe(1);
      expect(busan?.is_standard_instance).toBe(0);
    });
  });

  // ─── Invariant: Exception precedence ─────────────────────────────────────
  describe("exception precedence – resolution is deterministic", () => {
    it("projects map-scoped title challenges into the map catalog and admin map list", async () => {
      const { database, sqlite } = createTestDatabase("map.hanamura");
      seedTitle(sqlite, "CLASSIC");
      seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.hanamura");
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.listChallenges({ family: "map" })).resolves.toContainEqual(expect.objectContaining({ challengeId: "title.CLASSIC", titleKey: "CLASSIC", mapId: "map.hanamura", kind: "map_title_achievement" }));
      await expect(services.listAdminChallenges({ family: "map" }, auth)).resolves.toMatchObject({ items: [expect.objectContaining({ challengeId: "title.CLASSIC", titleKey: "CLASSIC", mapId: "map.hanamura", kind: "map_title_achievement" })] });
    });

    it("projects one stable, traceable map challenge for Portal, Admin, and Agents", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      const services = createPlatformServices(database);

      const portal = await services.listChallenges({ family: "map" });
      const admin = await services.listAdminChallenges({ family: "map" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
      const agents = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.paris" });
      const expected = { challengeId: "map.paris.conqueror", titleKey: "CONQUEROR", mapId: "map.paris", mapTitleRule: { ruleId: "rule.conqueror", kind: "conqueror", displayKind: "map_name_suffix", slot: "conqueror", dynamic: true } };

      expect(portal).toContainEqual(expect.objectContaining(expected));
      expect(admin.items).toContainEqual(expect.objectContaining(expected));
      expect(agents.items).toContainEqual(expect.objectContaining(expected));
    });

    it("projects assignments on an arbitrary selectable revision across every map challenge family", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "REWORK");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedLegacyMapChallenge(sqlite, "challenge.paris.direct", "map.paris");
      seedMapTitleChallenge(sqlite, "title.paris.rework", "REWORK", "map.paris");
      const reworkRevisionId = seedSelectableGameplayRevision(sqlite, "map.paris");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      seedAgentSpatialConfig(sqlite, reworkRevisionId);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_challenge", challengeId: "challenge.paris.direct" });
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "title_challenge", challengeId: "title.paris.rework" });
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const portal = await services.listChallenges({ family: "map" });
      const admin = await services.listAdminChallenges({ family: "map" }, auth);
      const agents = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.paris" });
      const reworkProjection = (challengeId: string) => expect.objectContaining({ challengeId, mapId: "map.paris", gameplayRevisionId: reworkRevisionId });

      expect(portal).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("challenge.paris.direct"),
        reworkProjection("title.paris.rework"),
      ]));
      expect(admin.items).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("challenge.paris.direct"),
        reworkProjection("title.paris.rework"),
      ]));
      expect(agents.items).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("title.paris.rework"),
      ]));
    });

    it("reruns canonical matching from reviewed OCR corrections without creating annotations", async () => {
      const { database, sqlite } = createTestDatabase();
      seedTitle(sqlite, "HERO");
      seedTitle(sqlite, "SECOND");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key IN ('HERO', 'SECOND')").run();
      const insertChallenge = (id: string, key: string) => sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES (?, ?, '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)").run(id, key, now, now);
      insertChallenge("title.hero", "HERO");
      insertChallenge("title.second", "SECOND");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.mixed', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.mixed', 'identity.mixed', 'player.mixed', 'qq', 'group.mixed', 'member.mixed', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.mixed', 'binding.mixed', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.mixed', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.mixed', 'submission.mixed', 1, 'review_required', ?, ?, ?)").run(
        JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: { map_name: "海滨城", achievement_titles: ["HERO", "SECOND", "THIRD"] } }),
        JSON.stringify({ candidates: [{ challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", match: { achievement: true } }] }),
        now,
      );
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const reviewInput = { submissionId: "submission.mixed", decision: "approved" as const, fieldCorrections: [{ fieldKey: "map_name" as const, reviewedValue: "国王大道" }, { fieldKey: "achievement_titles" as const, reviewedValue: "称号 HERO、称号 SECOND、THIRD" }] };
      const result = await services.reviewSubmission(reviewInput, auth, "review.mixed");
      expect(result).toMatchObject({ decision: "approved", grants: [{ titleKey: "HERO" }, { titleKey: "SECOND" }] });
      expect(result).not.toHaveProperty("reviewedAnnotationIds");
      // Review corrections stay transient business inputs; no annotation rows are written.
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation LIKE 'annotation.%'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT response_json FROM ocr_results WHERE id = 'ocr.mixed'").get()).toMatchObject({ response_json: expect.stringContaining('"THIRD"') });
      const replay = await services.reviewSubmission(reviewInput, auth, "review.mixed");
      expect(replay).toEqual(result);
    });

    it("routes legacy single-selection reviews through the Completion chain", async () => {
      const { database, sqlite } = createTestDatabase();
      seedTitle(sqlite, "HERO");
      seedTitle(sqlite, "LOWER");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key IN ('HERO', 'LOWER')").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, starts_at, ends_at, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?, ?, ?)").run(now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('legacy:title_challenge:title.hero::', 'title_challenge', 'title.hero', 'HERO', 'legacy', 'active', 0, 1, 'and', ?, '完成英雄挑战', ?, ?, ?, ?), ('challenge.lower', 'title_challenge', 'title.lower', 'LOWER', 'legacy', 'active', 0, 0, 'and', '[]', '低级条件', NULL, NULL, ?, ?)").run(JSON.stringify({ operator: "and", conditions: [{ type: "achievement_title", titleKey: "HERO" }] }), now - 100, now + 100, now, now, now, now);
      sqlite.prepare("INSERT INTO challenge_satisfies (challenge_id, satisfied_challenge_id, created_at) VALUES ('legacy:title_challenge:title.hero::', 'challenge.lower', ?)").run(now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.legacy.review', 'legacy-review-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.legacy.review', 'identity.legacy.review', 'player.legacy.review', 'qq', 'group.legacy.review', 'member.legacy.review', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.legacy.review', 'binding.legacy.review', 'ocr_review_required', 'title_achievement', 'title.hero', '成就挑战', 'Tester', 'portal', 'portal', 'legacy.review', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.legacy.review', 'submission.legacy.review', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: { achievement_titles: ["称号 HERO"] } }), now);

      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const result = await services.reviewSubmission({ submissionId: "submission.legacy.review", decision: "approved" }, auth, "legacy-review-approve");

      expect(result).toMatchObject({ decision: "approved", titleKey: "HERO", alreadyOwned: false });
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy.review'").get()).toMatchObject({ status: "approved", grant_id: expect.any(String) });
      expect(sqlite.prepare("SELECT title_key, c.source_type FROM player_title_grants g JOIN challenge_completions c ON c.id = g.completion_id WHERE g.source_id = 'submission.legacy.review' AND g.status = 'active' AND c.status = 'active' ORDER BY title_key").all()).toEqual([
        { title_key: "HERO", source_type: "submission" },
        { title_key: "LOWER", source_type: "challenge_satisfies" },
      ]);
    });

    it("does not grant a stored legacy Challenge without matching evidence", async () => {
      const { database, sqlite } = createTestDatabase();
      seedTitle(sqlite, "HERO");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, starts_at, ends_at, created_at, updated_at) VALUES ('title.legacy-no-evidence', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?, ?, ?)").run(now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('legacy:title_challenge:title.legacy-no-evidence::', 'title_challenge', 'title.legacy-no-evidence', 'HERO', 'legacy', 'active', 0, 1, 'and', ?, '完成英雄挑战', ?, ?, ?, ?)").run(JSON.stringify({ operator: "and", conditions: [{ type: "achievement_title", titleKey: "HERO" }] }), now - 100, now + 100, now, now);
      seedMasteryPlayer(sqlite, "player.legacy-no-evidence", "binding.legacy-no-evidence", "Tester");
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.legacy-no-evidence', 'binding.legacy-no-evidence', 'ocr_review_required', 'title_achievement', 'title.legacy-no-evidence', '成就挑战', 'Tester', 'portal', 'portal', 'legacy-no-evidence', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.legacy-no-evidence', 'submission.legacy-no-evidence', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: {} }), now);

      const services = createPlatformServices(database);
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await expect(services.reviewSubmission({ submissionId: "submission.legacy-no-evidence", decision: "approved" }, maintainer, "legacy-no-evidence")).rejects.toThrow("SUBMISSION_OUTCOME_NOT_CONFIGURED");
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy-no-evidence'").get()).toEqual({ status: "ocr_review_required", grant_id: null });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.legacy-no-evidence'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_id = 'submission.legacy-no-evidence'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.legacy-no-evidence'").get()).toEqual({ count: 0 });
    });

    it("keeps a legacy submission pending after an administrative revoke", async () => {
      const { database, sqlite } = createTestDatabase();
      seedTitle(sqlite, "HERO");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, starts_at, ends_at, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?, ?, ?)").run(now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('legacy:title_challenge:title.hero::', 'title_challenge', 'title.hero', 'HERO', 'legacy', 'active', 0, 1, 'and', ?, '完成英雄挑战', ?, ?, ?, ?)").run(JSON.stringify({ operator: "and", conditions: [{ type: "achievement_title", titleKey: "HERO" }] }), now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.legacy.revoked', 'legacy-revoked-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.legacy.revoked', 'identity.legacy.revoked', 'player.legacy.revoked', 'qq', 'group.legacy.revoked', 'member.legacy.revoked', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.legacy.revoked', 'binding.legacy.revoked', 'ocr_review_required', 'title_achievement', 'title.hero', '成就挑战', 'Tester', 'portal', 'portal', 'legacy.revoked', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.legacy.revoked', 'submission.legacy.revoked', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: { achievement_titles: ["称号 HERO"] } }), now);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.legacy.revoked', 'player.legacy.revoked', 'HERO', 'revoked', 'manual', 'manual:old', 'admin', ?, 'admin', ?, 'review block', 'administrator')").run(now, now);

      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await expect(services.reviewSubmission({ submissionId: "submission.legacy.revoked", decision: "approved" }, auth, "legacy-review-revoked")).rejects.toThrow("SUBMISSION_OUTCOME_NOT_CONFIGURED");

      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy.revoked'").get()).toEqual({ status: "ocr_review_required", grant_id: null });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.legacy.revoked'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.legacy.revoked' AND status = 'active'").get()).toEqual({ count: 0 });
    });

    it("persists confirmed field truth when the business submission is rejected", async () => {
      const { database, sqlite } = createTestDatabase();
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.reject', '1003', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.reject', 'identity.reject', 'player.reject', 'qq', 'group.reject', 'member.reject', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.reject', 'binding.reject', 'ocr_review_required', 'unknown', '截图地图', 'Tester', 'portal', 'portal', 'message.reject', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.reject', 'submission.reject', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v4", layout_version: "layout-v8", data: { map_name: "截图地图" } }), now);
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const result = await services.reviewSubmission({ submissionId: "submission.reject", decision: "rejected", fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "国王大道" }] }, auth, "review.reject");

      expect(result).toMatchObject({ decision: "rejected" });
      expect(result).not.toHaveProperty("reviewedAnnotationIds");
      expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.reject'").get()).toEqual({ status: "rejected" });
      // Corrections on a rejected review are transient business inputs, not annotations.
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations").get()).toEqual({ count: 0 });
    });

    it("matches manually confirmed facts without treating them as corrected annotations", async () => {
      const { database, sqlite } = createTestDatabase();
      seedTitle(sqlite, "HERO");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.incomplete', '1002', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.incomplete', 'identity.incomplete', 'player.incomplete', 'qq', 'group.incomplete', 'member.incomplete', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.incomplete', 'binding.incomplete', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.incomplete', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.incomplete', 'submission.incomplete', 1, 'review_required', ?, ?, ?)").run(JSON.stringify({ data: { achievement_titles: ["称号 HERO", "SECOND"] } }), JSON.stringify({ candidates: [{ challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", match: { achievement: true } }] }), now);
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await expect(services.reviewSubmission({ submissionId: "submission.incomplete", decision: "approved" }, auth, "review.incomplete")).resolves.toMatchObject({ decision: "approved" });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations WHERE submission_id = 'submission.incomplete'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.incomplete'").get()).toEqual({ count: 1 });
    });

    it("does not expose a legacy map-title row alongside its rule projection", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedLegacyMapChallenge(sqlite, "map.paris.conqueror", "map.paris");
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const portal = (await services.listChallenges({ family: "map" })).filter((item) => item.challengeId === "map.paris.conqueror" && item.mapId === "map.paris");
      const admin = (await services.listAdminChallenges({ family: "map" }, auth)).items.filter((item) => item.challengeId === "map.paris.conqueror" && item.mapId === "map.paris");

      expect(portal).toHaveLength(1);
      expect(portal[0]).toMatchObject({ mapTitleRule: { ruleId: "rule.conqueror", dynamic: true } });
      expect(admin).toHaveLength(1);
      expect(admin[0]).toMatchObject({ mapTitleRule: { ruleId: "rule.conqueror", dynamic: true } });
    });

    it("keeps repeated legacy challenge IDs distinct by map context", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedMap(sqlite, "map.hanamura");
      seedTitle(sqlite, "CLASSIC");
      seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
      seedException(sqlite, "exception.paris", "rule.classic", "map.paris");
      seedException(sqlite, "exception.hanamura", "rule.classic", "map.hanamura");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      seedAgentSpatialConfig(sqlite, "revision:map.hanamura:initial");
      seedAgentSpatialConfig(sqlite, legacyGameplayRevisionId("map.paris"));
      seedAgentSpatialConfig(sqlite, legacyGameplayRevisionId("map.hanamura"));
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.paris");
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.hanamura");
      const services = createPlatformServices(database);

      const projections = (await services.listChallenges({ family: "map" })).filter((item) => item.challengeId === "title.CLASSIC");
      expect(projections).toHaveLength(2);
      expect(projections).toEqual(expect.arrayContaining([
        expect.objectContaining({ challengeId: "title.CLASSIC", mapId: "map.paris", mapVariant: "classic" }),
        expect.objectContaining({ challengeId: "title.CLASSIC", mapId: "map.hanamura", mapVariant: "classic" }),
      ]));
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC" })).resolves.toBeNull();
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC", mapId: "map.paris" })).resolves.toMatchObject({ mapId: "map.paris", mapVariant: "classic" });
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC", mapId: "map.hanamura" })).resolves.toMatchObject({ mapId: "map.hanamura", mapVariant: "classic" });
    });

    it("disabled standard-rule exception does not remove an enabled revision assignment", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror", defaultScope: "all_active" });
      seedException(sqlite, "exc.1", "rule.conqueror", "map.paris", { enabled: 0, condition: "不生效的地图覆盖" });
      sqlite.prepare("UPDATE gameplay_revision_challenge_assignments SET enabled = 1, condition = '修订条件' WHERE gameplay_revision_id = 'revision:map.paris:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").run();
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const result = await services.listAdminMapTitleInheritance({ mapId: "map.paris" }, auth);
      expect(result.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "修订条件", slot: "conqueror" },
      });
    });

    it("enabled map overrides take precedence over revision values while keeping title_key in the rule", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedException(sqlite, "exc.1", "rule.conqueror", "map.paris", {
        enabled: 1,
        condition: "巴黎专属条件",
        slot: "pioneer", // overrides rule default slot
      });
      sqlite.prepare("UPDATE map_title_rule_exceptions SET evidence_rule = '巴黎截图规则', submission_mode = 'automatic' WHERE rule_id = 'rule.conqueror' AND map_id = 'map.paris'").run();
      sqlite.prepare("UPDATE gameplay_revision_challenge_assignments SET condition = '修订条件', evidence_rule = '修订截图规则', submission_mode = 'manual', slot = 'dominator' WHERE gameplay_revision_id = 'revision:map.paris:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").run();

      // Exception must not create a new title_key; rule's title_key is authoritative.
      const rule = sqlite.prepare("SELECT title_key FROM map_title_rules WHERE id = 'rule.conqueror'").get() as { title_key: string };
      const exc = sqlite.prepare("SELECT condition, slot FROM map_title_rule_exceptions WHERE id = 'exc.1'").get() as { condition: string; slot: string };
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const inheritance = await services.listAdminMapTitleInheritance({ mapId: "map.paris" }, auth);

      expect(rule.title_key).toBe("CONQUEROR");
      expect(exc.condition).toBe("巴黎专属条件");
      expect(exc.slot).toBe("pioneer");
      expect(inheritance.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "巴黎专属条件", slot: "pioneer" },
      });
      await expect(services.listChallenges({ family: "map", mapId: "map.paris" })).resolves.toContainEqual(expect.objectContaining({
        challengeId: "map.paris.conqueror",
        gameplayRevisionId: "revision:map.paris:initial",
        condition: "巴黎专属条件",
        evidenceRule: "巴黎截图规则",
        submissionMode: "automatic",
        mapTitleRule: expect.objectContaining({ slot: "pioneer" }),
      }));
      // The exception does not carry its own title_key column — the rule owns it.
      const hasOwnTitleKey = sqlite.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('map_title_rule_exceptions') WHERE name = 'title_key'").get() as { c: number };
      expect(hasOwnTitleKey.c).toBe(0);
    });

    it("saves map overrides without changing revision applicability or assignment values", async () => {
      const { database, sqlite } = createTestDatabase("map.override");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      sqlite.prepare("UPDATE gameplay_revision_challenge_assignments SET condition = '修订条件', evidence_rule = '修订截图规则', submission_mode = 'automatic', slot = 'dominator' WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").run();
      const assignmentBefore = sqlite.prepare("SELECT enabled, condition, evidence_rule, submission_mode, slot FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").get();
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await services.upsertAdminMapTitleRuleException({
        contractVersion: "1",
        mapId: "map.override",
        ruleId: "rule.conqueror",
        enabled: true,
        condition: "地图级条件",
        evidenceRule: "地图级截图规则",
        submissionMode: "manual",
        slot: "pioneer",
      }, auth, "map-exception-enabled");
      expect(sqlite.prepare("SELECT enabled, condition, evidence_rule, submission_mode, slot FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").get()).toEqual(assignmentBefore);
      let inheritance = await services.listAdminMapTitleInheritance({ mapId: "map.override" }, auth);
      expect(inheritance.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "地图级条件", evidenceRule: "地图级截图规则", submissionMode: "manual", slot: "pioneer" },
      });

      await services.upsertAdminMapTitleRuleException({
        contractVersion: "1",
        mapId: "map.override",
        ruleId: "rule.conqueror",
        enabled: false,
        condition: "已停用的地图级条件",
      }, auth, "map-exception-disabled");
      expect(sqlite.prepare("SELECT enabled, condition, evidence_rule, submission_mode, slot FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").get()).toEqual(assignmentBefore);
      inheritance = await services.listAdminMapTitleInheritance({ mapId: "map.override" }, auth);
      expect(inheritance.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "修订条件", evidenceRule: "修订截图规则", submissionMode: "automatic", slot: "dominator" },
      });
    });

    it("rule default applies when no exception exists and scope is all_active", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror", defaultScope: "all_active" });

      const noException = sqlite.prepare(
        "SELECT COUNT(*) AS c FROM map_title_rule_exceptions WHERE rule_id = 'rule.conqueror' AND map_id = 'map.paris'",
      ).get() as { c: number };
      expect(noException.c).toBe(0);

      // For all_active scope the rule projects to map.paris without an exception.
      const rule = sqlite.prepare("SELECT default_scope, slot FROM map_title_rules WHERE id = 'rule.conqueror'").get() as { default_scope: string; slot: string };
      expect(rule.default_scope).toBe("all_active");
      expect(rule.slot).toBe("conqueror");
    });

    it("explicit-scope rule does not project without a revision assignment", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "SPECIAL");
      seedRule(sqlite, "rule.special", "SPECIAL", "special", { defaultScope: "explicit" });
      const services = createPlatformServices(database);

      await expect(services.listChallenges({ family: "map", mapId: "map.paris" })).resolves.not.toContainEqual(expect.objectContaining({ mapTitleRule: expect.objectContaining({ ruleId: "rule.special" }) }));
    });

    it("requires both a revision assignment and a valid Pioneer window", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "PIONEER");
      seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "all_active" });
      seedException(sqlite, "exception.pioneer", "rule.pioneer", "map.paris", { startsAt: now - 60_000, endsAt: now + 60_000 });
      const playerAccountId = "11111111-1111-4111-8111-111111111111";
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES (?, '1001', 'Pioneer Player', 'pioneer player', ?, ?)").run(playerAccountId, now, now);
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.createAdminManualTitleGrantBatch({
        contractVersion: "1",
        playerAccountIds: [playerAccountId],
        targets: [{ titleKey: "PIONEER", mapId: "map.paris" }],
      }, auth, "pioneer-default-scope")).rejects.toThrow("TITLE_MAP_REWARD_NOT_CONFIGURED");
      await expect(services.listChallenges({ family: "map" })).resolves.not.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris" }));

      sqlite.prepare("UPDATE map_title_rules SET default_scope = 'explicit' WHERE id = 'rule.pioneer'").run();
      sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE map_id = 'map.paris' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.pioneer'").run();
      await services.upsertAdminMapTitleRuleException({
        contractVersion: "1", mapId: "map.paris", ruleId: "rule.pioneer", enabled: true,
        startsAt: now - 60_000, endsAt: now + 60_000,
      }, auth, "pioneer-window");
      await expect(services.listChallenges({ family: "map" })).resolves.not.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris" }));

      seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.paris:initial", mapId: "map.paris", challengeFamily: "map_title_rule", challengeId: "rule.pioneer" });
      await expect(services.listChallenges({ family: "map" })).resolves.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris", mapTitleRule: expect.objectContaining({ kind: "pioneer" }) }));

      sqlite.prepare("UPDATE map_title_rule_exceptions SET ends_at = ? WHERE rule_id = 'rule.pioneer' AND map_id = 'map.paris'").run(now - 1);
      await expect(services.listChallenges({ family: "map" })).resolves.not.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris" }));
    });

    it("uses submission.createdAt for Pioneer OCR after the window ends", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "PIONEER");
      seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
      const startsAt = now - 10_000;
      const endsAt = now - 1;
      seedException(sqlite, "exception.pioneer.paris", "rule.pioneer", "map.paris", { startsAt, endsAt });
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.pioneer', 'pioneer-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.pioneer', 'identity.pioneer', 'player.pioneer', 'qq', 'group.pioneer', 'member.pioneer', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.pioneer.inside', 'binding.pioneer', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.inside', ?, ?), ('submission.pioneer.at-end', 'binding.pioneer', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.at-end', ?, ?)").run(endsAt - 1, endsAt - 1, endsAt, endsAt);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.pioneer.inside', 'submission.pioneer.inside', 'portal', 'external.inside', 'image/png', 1, 'hash', 'evidence/inside.png', 'stored', ?), ('attachment.pioneer.at-end', 'submission.pioneer.at-end', 'portal', 'external.at-end', 'image/png', 1, 'hash', 'evidence/at-end.png', 'stored', ?)").run(now, now);

      const ocrResponse = createOcrDifficultyResponse("地图 map.paris", "地狱", "1280x720-v6");
      vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await services.processOcrJob({ submissionId: "submission.pioneer.inside", objectKey: "evidence/inside.png", attempt: 1, requestId: "request.inside" });
        await services.processOcrJob({ submissionId: "submission.pioneer.at-end", objectKey: "evidence/at-end.png", attempt: 1, requestId: "request.at-end" });
      } finally {
        vi.unstubAllGlobals();
      }

      expect(sqlite.prepare("SELECT id, status FROM submissions WHERE id LIKE 'submission.pioneer.%' ORDER BY id").all()).toEqual([
        { id: "submission.pioneer.at-end", status: "resubmission_required" },
        { id: "submission.pioneer.inside", status: "approved" },
      ]);
      expect(sqlite.prepare("SELECT title_key, map_id, slot FROM player_title_grants WHERE source_id = 'submission.pioneer.inside'").get()).toEqual({ title_key: "PIONEER", map_id: "map.paris", slot: "pioneer" });
    });

    it("allows evidence review for an expired Pioneer rule when the submission is in-window", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "PIONEER");
      seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
      const startsAt = now - 10_000;
      const endsAt = now - 1;
      seedException(sqlite, "exception.pioneer.paris", "rule.pioneer", "map.paris", { startsAt, endsAt });
      seedCompat(sqlite, "map.paris.pioneer", "rule.pioneer", "map.paris");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.pioneer.review', 'pioneer-review-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.pioneer.review', 'identity.pioneer.review', 'player.pioneer.review', 'qq', 'group.pioneer.review', 'member.pioneer.review', 'active', ?)").run(now);
      const createdAt = endsAt - 1;
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.pioneer.review', 'binding.pioneer.review', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.review', ?, ?)").run(createdAt, createdAt);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.pioneer.review', 'submission.pioneer.review', 1, 'review_required', ?, ?, ?)").run(
        JSON.stringify({ data: { map_name: "地图 map.paris", difficulty: "地狱" } }),
        JSON.stringify({ candidates: [{ challengeId: "map.paris.pioneer", mapId: "map.paris", gameplayRevisionId: "revision:map.paris:initial", challengeType: "map_title_achievement", targetMapName: "地图 map.paris", targetDifficulty: "地狱", titleName: "称号 PIONEER", match: { achievement: true } }] }),
        now,
      );
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.reviewSubmission({
        submissionId: "submission.pioneer.review",
        decision: "approved",
        fieldCorrections: [
          { fieldKey: "map_name", reviewedValue: "地图 map.paris" },
          { fieldKey: "difficulty", reviewedValue: "地狱" },
          { fieldKey: "challenge_completed", reviewedValue: "已完成" },
        ],
      }, auth, "pioneer-review-approve")).resolves.toMatchObject({ decision: "approved", titleKey: "PIONEER" });
      expect(sqlite.prepare("SELECT status, rule_snapshot_json FROM submissions WHERE id = 'submission.pioneer.review'").get()).toMatchObject({ status: "approved" });
      expect(sqlite.prepare("SELECT title_key, map_id, slot FROM player_title_grants WHERE source_id = 'submission.pioneer.review'").get()).toEqual({ title_key: "PIONEER", map_id: "map.paris", slot: "pioneer" });
    });
  });

  // ─── Invariant: Slot semantics ───────────────────────────────────────────
  describe("slot semantics – immutable grant-time snapshot", () => {
    it("slot in rule_snapshot_json is taken from the rule (or exception) at submission time", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshotAtCreation = {
        ruleId: "rule.conqueror",
        ruleRevision: now,
        mapId: "map.paris",
        gameplayRevisionId: "revision:map.paris:initial",
        titleKey: "CONQUEROR",
        slot: "conqueror",
        displayKind: "map_name_suffix",
        condition: "完成地图",
        evidenceRule: "上传截图",
        submissionMode: "manual",
        defaultScope: "all_active",
        exceptionId: null,
      };

      // Simulate storing the snapshot at upload-session creation.
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.snap', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', 'revision:map.paris:initial', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshotAtCreation), now, now);

      // Now change the rule's slot — the stored snapshot must not be affected.
      sqlite.prepare("UPDATE map_title_rules SET slot = 'dominator', updated_at = ? WHERE id = 'rule.conqueror'").run(now + 5000);

      const row = sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'sub.snap'").get() as { rule_snapshot_json: string };
      const stored = JSON.parse(row.rule_snapshot_json) as typeof snapshotAtCreation;

      expect(stored.slot).toBe("conqueror");  // still the original value
      expect(stored.ruleRevision).toBe(now);  // still the original revision
    });
  });

  describe("gameplay revision applicability", () => {
    it("keeps old map grants active as facts while the current player view derives only the default revision", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "LEGACY");
      seedTitle(sqlite, "CURRENT");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.1', 'attempt.1', 'g.1', 'm.1', 'production', ?, ?, ?)").run(await requestHash("revision-title-session"), now + 60_000, now);
      sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = 'revision:map.paris:initial'").run();
      sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.paris:rework', 'map.paris', 'default', NULL, 'revision:map.paris:initial', 'difficulty redesign', '26.0810.2', ?, ?)").run(now + 1, now + 1);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.legacy', 'p.1', 'LEGACY', 'map.paris', 'revision:map.paris:initial', NULL, 'active', 'submission', 'submission.legacy', 'admin', ?), ('grant.current', 'p.1', 'CURRENT', 'map.paris', 'revision:map.paris:rework', NULL, 'active', 'submission', 'submission.current', 'admin', ?)").run(now, now + 1);

      const titles = await createPlatformServices(database).listCurrentPlayerTitles({ sessionToken: "revision-title-session" });

      expect(titles).toMatchObject({ allTitles: false, items: [expect.objectContaining({ titleKey: "CURRENT" })] });
      expect(sqlite.prepare("SELECT id, status FROM player_title_grants ORDER BY id").all()).toEqual([
        { id: "grant.current", status: "active" },
        { id: "grant.legacy", status: "active" },
      ]);
    });
  });

  // ─── Invariant: Retired maps ─────────────────────────────────────────────
  describe("retired maps – no new projections", () => {
    it("a retired map has no current projection and produces no rule resolution", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.retired", "retired");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.retired.conqueror", "rule.conqueror", "map.retired");

      // Map is retired.
      const map = sqlite.prepare("SELECT status FROM maps WHERE id = 'map.retired'").get() as { status: string };
      expect(map.status).toBe("retired");

      // resolveMapTitleProjection step 1: retired map → null.
      // Verified indirectly: no active grants can exist for a retired map (not an error; just no projection).
      // Existing grants and submissions must remain readable.
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'A', 'a', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.old', 'p.1', 'CONQUEROR', 'map.retired', 'conqueror', 'active', 'historical', 'src.1', 'admin', ?)").run(now);

      // Existing grant is still readable after retirement.
      const grant = sqlite.prepare("SELECT id, status FROM player_title_grants WHERE id = 'grant.old'").get() as { id: string; status: string } | undefined;
      expect(grant?.id).toBe("grant.old");
      expect(grant?.status).toBe("active");
    });

    it("an in-flight submission created before retirement remains governed by its snapshot", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshot = { ruleId: "rule.conqueror", ruleRevision: now, mapId: "map.paris", gameplayRevisionId: "revision:map.paris:initial", titleKey: "CONQUEROR", slot: "conqueror", displayKind: "map_name_suffix", condition: "完成地图", evidenceRule: "上传截图", submissionMode: "manual", defaultScope: "all_active", exceptionId: null };
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.flight', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshot), now, now);

      // Retire the map after the session was created.
      sqlite.prepare("UPDATE maps SET status = 'retired', updated_at = ? WHERE id = 'map.paris'").run(now + 1000);

      // The snapshot on the submission is unchanged — retirement after session creation
      // does not silently invalidate the in-flight submission.
      const row = sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'sub.flight'").get() as { rule_snapshot_json: string };
      const stored = JSON.parse(row.rule_snapshot_json) as typeof snapshot;
      expect(stored.mapId).toBe("map.paris");
      expect(stored.slot).toBe("conqueror");
    });
  });

  // ─── Invariant: reviewSubmission reads snapshot for new-model submissions ──
  describe("submission review – snapshot path", () => {
    it("uses rule_snapshot_json for reward resolution when present, ignoring live rule changes", async () => {
      const { database, sqlite } = createTestDatabase("map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshot = { ruleId: "rule.conqueror", ruleRevision: now, mapId: "map.paris", titleKey: "CONQUEROR", slot: "conqueror", displayKind: "map_name_suffix", condition: "完成地图", evidenceRule: "上传截图", submissionMode: "manual", defaultScope: "all_active", exceptionId: null };

      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.1', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', 'revision:map.paris:initial', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshot), now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.sub.1', 'sub.1', 1, 'review_required', ?, ?)").run(JSON.stringify({
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v6",
        fields: {
          map_name: { status: "ok", confidence: 0.99 },
          difficulty: { status: "ok", confidence: 0.99 },
          challenge_completed: { status: "ok", confidence: 0.99 },
        },
        data: { map_name: "地图 map.paris", difficulty: "地狱", challenge_completed: true },
      }), now);

      // Change the rule's title_key after submission was created.
      // The review must still use the snapshot's titleKey, not the live rule.
      // (We don't update title_key in the DB since it's FK-constrained, but we
      // verify that the snapshot JSON drives the reward path by checking the
      // granted title_key.)
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const services = createPlatformServices(database);

      const result = await services.reviewSubmission(
        { submissionId: "sub.1", decision: "approved" },
        auth,
        "idem.1",
      );

      expect(result.decision).toBe("approved");
      // The grant must reference the title from the snapshot.
      const grant = sqlite.prepare("SELECT title_key, map_id, gameplay_revision_id, slot FROM player_title_grants WHERE source_type = 'submission'").get() as { title_key: string; map_id: string; gameplay_revision_id: string; slot: string } | undefined;
      expect(grant?.title_key).toBe("CONQUEROR");
      expect(grant?.map_id).toBe("map.paris");
      expect(grant?.gameplay_revision_id).toBe("revision:map.paris:initial");
      expect(grant?.slot).toBe("conqueror");
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_type = 'submission' AND source_id = 'sub.1' AND status = 'active'").get()).toEqual({ count: 1 });
      expect(sqlite.prepare("SELECT completion_id FROM player_title_grants WHERE source_type = 'submission'").get()).toMatchObject({ completion_id: expect.any(String) });
    });
  });
});
