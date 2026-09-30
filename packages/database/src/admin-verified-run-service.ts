import { and, count, desc, eq, gte, inArray, lte, notExists } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { buildMasteryMapProfile, calculateVerifiedRunXpV2, normalizeMatchCode, verifiedRunDifficulties } from "@owbastion/domain";
import type { AdminVerifiedRunQuery, AuthContext, VerifiedRun, VerifiedRunActor, VerifiedRunConflictField, VerifiedRunDifficulty } from "@owbastion/domain";
import type {
  AdminVerifiedRun,
  AdminVerifiedRunConflict,
  AdminVerifiedRunCorrectionRequest,
  AdminVerifiedRunCorrectionResponse,
  AdminVerifiedRunDetailResponse,
  AdminVerifiedRunProjection,
  AdminVerifiedRunStateResponse,
  AdminVerifiedRunConflictResolutionResponse,
} from "@owbastion/contracts";
import {
  auditEvents,
  gameplayRevisions,
  maps,
  ocrResults,
  playerAccounts,
  submissionOutcomes,
  submissions,
  verifiedRunConflictResolutions,
  verifiedRunLifecycleEvents,
  verifiedRuns,
} from "./schema";
import {
  activeMasteryProfiles,
  asVerifiedRun,
  findConflictingVerifiedRun,
  masteryRevisionLifecycle,
  normalizeVerifiedRunEventCounters,
} from "./mastery-query";
import { normalizeOcrDifficulty, type OcrResponse } from "./ocr-response";

type Database = ReturnType<typeof drizzle>;
type AdminVerifiedRunServicesDependencies = {
  database: D1Database;
  db: Database;
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  conflictFieldsForOutcome: (row: typeof submissionOutcomes.$inferSelect) => VerifiedRunConflictField[];
  loadSourceSubmission: (row: typeof submissions.$inferSelect) => Promise<AdminVerifiedRunDetailResponse["sourceSubmission"]>;
};

export const createAdminVerifiedRunServices = ({
  database,
  db,
  now,
  replayOrConflict,
  recordIdempotency,
  conflictFieldsForOutcome,
  loadSourceSubmission,
}: AdminVerifiedRunServicesDependencies) => {
  const countVerifiedRunConflicts = async (runIds: string[]) => {
    if (!runIds.length) return new globalThis.Map<string, number>();
    const rows = await db.select({ verifiedRunId: submissionOutcomes.entityId }).from(submissionOutcomes).where(and(
      eq(submissionOutcomes.outcomeType, "verified_run"),
      eq(submissionOutcomes.status, "conflict"),
      inArray(submissionOutcomes.entityId, runIds),
    ));
    const counts = new globalThis.Map<string, number>();
    for (const row of rows) if (row.verifiedRunId) counts.set(row.verifiedRunId, (counts.get(row.verifiedRunId) ?? 0) + 1);
    return counts;
  };

  type AdminVerifiedRunJoin = {
    run: typeof verifiedRuns.$inferSelect;
    player: typeof playerAccounts.$inferSelect;
    map: typeof maps.$inferSelect;
    revision: typeof gameplayRevisions.$inferSelect;
  };

  const verifiedRunCorrectionSnapshot = (run: VerifiedRun): AdminVerifiedRunDetailResponse["corrections"][number]["before"] => ({
    mapId: run.mapId,
    gameplayRevisionId: run.gameplayRevisionId,
    mapVariant: run.mapVariant,
    difficulty: run.difficulty,
    gameVersion: run.gameVersion,
    matchCode: run.matchCode,
    completionDurationSeconds: run.completionDurationSeconds,
    deaths: run.deaths,
    skips: run.skips,
    eventCounters: run.eventCounters,
    xpRuleVersion: run.xpRuleVersion,
    xpInputSnapshot: run.xpInputSnapshot,
    awardedXp: run.awardedXp,
  });

  const asAdminVerifiedRun = (row: AdminVerifiedRunJoin, conflictCount: number): AdminVerifiedRun => {
    const run = asVerifiedRun(row.run);
    return {
      ...run,
      playerId: row.player.playerId,
      playerName: row.player.playerName,
      mapName: row.map.name,
      gameplayRevisionLifecycle: masteryRevisionLifecycle(row.revision.lifecycle),
      conflictCount,
    };
  };

  const loadAdminVerifiedRun = async (verifiedRunId: string) => {
    const row = await db.select({ run: verifiedRuns, player: playerAccounts, map: maps, revision: gameplayRevisions }).from(verifiedRuns)
      .innerJoin(playerAccounts, eq(verifiedRuns.playerAccountId, playerAccounts.id))
      .innerJoin(maps, eq(verifiedRuns.mapId, maps.id))
      .innerJoin(gameplayRevisions, eq(verifiedRuns.gameplayRevisionId, gameplayRevisions.id))
      .where(eq(verifiedRuns.id, verifiedRunId)).get();
    if (!row) return null;
    const conflictCounts = await countVerifiedRunConflicts([row.run.id]);
    return { row, view: asAdminVerifiedRun(row, conflictCounts.get(row.run.id) ?? 0) };
  };

  const adminMasteryProjection = async (input: { playerAccountId: string; mapId: string; gameplayRevisionId: string }): Promise<AdminVerifiedRunProjection> => {
    const profile = (await activeMasteryProfiles(db, { playerAccountId: input.playerAccountId, mapId: input.mapId, gameplayRevisionId: input.gameplayRevisionId, recentLimit: 10 }))[0]
      ?? buildMasteryMapProfile(input.mapId, input.gameplayRevisionId, [], 0);
    const { recentRuns: _recentRuns, ...projection } = profile;
    return projection;
  };

  const masteryConflictFacts = (responseJson: string | null): AdminVerifiedRunConflict["facts"] => {
    let data: OcrResponse["data"] | undefined;
    try {
      const parsed = responseJson ? JSON.parse(responseJson) as OcrResponse : null;
      data = parsed?.data;
    } catch {
      data = undefined;
    }
    const asText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
    const asCount = (value: unknown, positive = false) => typeof value === "number" && Number.isInteger(value) && (positive ? value > 0 : value >= 0) ? value : null;
    const normalizedDifficulty = normalizeOcrDifficulty(data?.difficulty);
    let matchCode: string | null = null;
    try { matchCode = normalizeMatchCode(asText(data?.run_code) ?? ""); } catch { matchCode = null; }
    return {
      mapName: asText(data?.map_name),
      mapVariant: data?.map_variant === "classic" ? "classic" : null,
      difficulty: verifiedRunDifficulties.includes(normalizedDifficulty as VerifiedRunDifficulty) ? normalizedDifficulty as VerifiedRunDifficulty : null,
      gameVersion: asText(data?.version),
      matchCode,
      completionDurationSeconds: asCount(data?.duration_seconds, true),
      deaths: asCount(data?.deaths),
      skips: asCount(data?.skips),
    };
  };

  const listAdminVerifiedRunConflicts = async (verifiedRunId: string): Promise<AdminVerifiedRunConflict[]> => {
    const rows = await db.select({ outcome: submissionOutcomes, submission: submissions, player: playerAccounts }).from(submissionOutcomes)
      .innerJoin(submissions, eq(submissionOutcomes.submissionId, submissions.id))
      .innerJoin(playerAccounts, eq(submissions.playerAccountId, playerAccounts.id))
      .where(and(eq(submissionOutcomes.outcomeType, "verified_run"), eq(submissionOutcomes.status, "conflict"), eq(submissionOutcomes.entityId, verifiedRunId)))
      .orderBy(desc(submissionOutcomes.updatedAt));
    if (!rows.length) return [];
    const submissionIds = rows.map(({ submission }) => submission.id);
    const [ocrRows, resolutions] = await Promise.all([
      db.select().from(ocrResults).where(inArray(ocrResults.submissionId, submissionIds)).orderBy(desc(ocrResults.createdAt)),
      db.select().from(verifiedRunConflictResolutions).where(eq(verifiedRunConflictResolutions.verifiedRunId, verifiedRunId)),
    ]);
    const latestOcr = new globalThis.Map<string, typeof ocrResults.$inferSelect>();
    for (const row of ocrRows) if (!latestOcr.has(row.submissionId)) latestOcr.set(row.submissionId, row);
    const resolutionBySubmission = new globalThis.Map(resolutions.map((resolution) => [resolution.conflictSubmissionId, resolution]));
    return rows.map(({ outcome, submission, player }) => {
      const conflictFields = conflictFieldsForOutcome(outcome);
      const resolution = resolutionBySubmission.get(submission.id);
      return {
        submissionId: submission.id,
        submissionStatus: submission.status as AdminVerifiedRunConflict["submissionStatus"],
        playerAccountId: player.id,
        playerName: player.playerName,
        conflictFields,
        facts: masteryConflictFacts(latestOcr.get(submission.id)?.responseJson ?? null),
        resolution: resolution ? {
          action: resolution.action as "keep_existing" | "invalidate_existing",
          actorType: resolution.actorType as "service" | "user",
          actorId: resolution.actorId,
          reason: resolution.reason,
          resolvedAt: resolution.resolvedAt,
        } : null,
      };
    });
  };

  const loadAdminVerifiedRunDetail = async (verifiedRunId: string): Promise<AdminVerifiedRunDetailResponse | null> => {
    const loaded = await loadAdminVerifiedRun(verifiedRunId);
    if (!loaded) return null;
    const sourceRow = await db.select().from(submissions).where(eq(submissions.id, loaded.row.run.sourceSubmissionId)).get();
    if (!sourceRow) throw new Error("VERIFIED_RUN_SUBMISSION_NOT_FOUND");
    const [projection, sourceSubmission, lifecycle, conflicts, correctionEvents] = await Promise.all([
      adminMasteryProjection({ playerAccountId: loaded.row.run.playerAccountId, mapId: loaded.row.run.mapId, gameplayRevisionId: loaded.row.run.gameplayRevisionId }),
      loadSourceSubmission(sourceRow),
      db.select().from(verifiedRunLifecycleEvents).where(eq(verifiedRunLifecycleEvents.verifiedRunId, loaded.row.run.id)).orderBy(desc(verifiedRunLifecycleEvents.createdAt)).limit(50),
      listAdminVerifiedRunConflicts(loaded.row.run.id),
      db.select().from(auditEvents).where(and(eq(auditEvents.entityType, "verified_run"), eq(auditEvents.entityId, loaded.row.run.id), eq(auditEvents.operation, "verified_run.correct"))).orderBy(desc(auditEvents.createdAt)).limit(50),
    ]);
    const corrections = correctionEvents.map((event) => {
      try {
        const payload = JSON.parse(event.payloadJson) as { reason?: unknown; before?: unknown; after?: unknown };
        return {
          correctionId: event.id,
          actorType: event.actorType as "service" | "user",
          actorId: event.actorId,
          reason: typeof payload.reason === "string" ? payload.reason : null,
          createdAt: event.createdAt,
          before: payload.before as AdminVerifiedRunDetailResponse["corrections"][number]["before"],
          after: payload.after as AdminVerifiedRunDetailResponse["corrections"][number]["after"],
        };
      } catch {
        return null;
      }
    }).filter((event): event is NonNullable<typeof event> => event !== null);
    return {
      contractVersion: "1",
      run: loaded.view,
      projection,
      sourceSubmission,
      lifecycle: lifecycle.map((event) => ({
        transition: event.transition as "accepted" | "invalidated" | "restored",
        actorType: event.actorType as "service" | "user",
        actorId: event.actorId,
        reason: event.reason,
        createdAt: event.createdAt,
      })),
      corrections,
      conflicts,
    };
  };

  const correctAdminVerifiedRunFacts = async (input: AdminVerifiedRunCorrectionRequest & { verifiedRunId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminVerifiedRunCorrectionResponse> => {
    const operation = "verified_run.correct";
    const replay = await replayOrConflict<AdminVerifiedRunCorrectionResponse>(auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const loaded = await loadAdminVerifiedRun(input.verifiedRunId);
    if (!loaded) throw new Error("VERIFIED_RUN_NOT_FOUND");

    const previous = asVerifiedRun(loaded.row.run);
    const changes = input.changes;
    const mapId = changes.mapId ?? previous.mapId;
    const gameplayRevisionId = changes.gameplayRevisionId ?? previous.gameplayRevisionId;
    const revision = await db.select({ mapId: gameplayRevisions.mapId, legacyMapVariant: gameplayRevisions.legacyMapVariant }).from(gameplayRevisions).where(eq(gameplayRevisions.id, gameplayRevisionId)).get();
    if (!revision || revision.mapId !== mapId) throw new Error("VERIFIED_RUN_REVISION_MAP_MISMATCH");
    if (revision.legacyMapVariant !== null && revision.legacyMapVariant !== "classic") throw new Error("VERIFIED_RUN_MAP_VARIANT_INVALID");
    const corrected = {
      mapId,
      gameplayRevisionId,
      mapVariant: revision.legacyMapVariant === "classic" ? "classic" as const : null,
      difficulty: changes.difficulty ?? previous.difficulty,
      gameVersion: changes.gameVersion?.trim() ?? previous.gameVersion,
      matchCode: normalizeMatchCode(changes.matchCode ?? previous.matchCode),
      completionDurationSeconds: changes.completionDurationSeconds ?? previous.completionDurationSeconds,
      deaths: changes.deaths === undefined ? previous.deaths : changes.deaths,
      skips: changes.skips === undefined ? previous.skips : changes.skips,
      eventCounters: normalizeVerifiedRunEventCounters(changes.eventCounters ?? previous.eventCounters),
    };
    if (!Number.isInteger(corrected.completionDurationSeconds) || corrected.completionDurationSeconds <= 0) throw new Error("VERIFIED_RUN_COMPLETION_DURATION_INVALID");
    const before = verifiedRunCorrectionSnapshot(previous);
    const sameFacts = before.mapId === corrected.mapId
      && before.gameplayRevisionId === corrected.gameplayRevisionId
      && before.mapVariant === corrected.mapVariant
      && before.difficulty === corrected.difficulty
      && before.gameVersion === corrected.gameVersion
      && before.matchCode === corrected.matchCode
      && before.completionDurationSeconds === corrected.completionDurationSeconds
      && before.deaths === corrected.deaths
      && before.skips === corrected.skips
      && JSON.stringify(before.eventCounters) === JSON.stringify(corrected.eventCounters);
    const oldScope = { playerAccountId: previous.playerAccountId, mapId: previous.mapId, gameplayRevisionId: previous.gameplayRevisionId };
    const nextScope = { playerAccountId: previous.playerAccountId, mapId: corrected.mapId, gameplayRevisionId: corrected.gameplayRevisionId };

    if (!sameFacts) {
      if (await findConflictingVerifiedRun(db, { playerAccountId: previous.playerAccountId, matchCode: corrected.matchCode, exceptRunId: previous.runId })) {
        throw new Error("VERIFIED_RUN_MATCH_CODE_CONFLICT");
      }
      const award = calculateVerifiedRunXpV2({
        difficulty: corrected.difficulty,
        mapFactor: previous.xpInputSnapshot.mapFactor,
        deaths: corrected.deaths,
        skips: corrected.skips,
      });
      const afterRun = { ...previous, ...corrected, xpRuleVersion: award.snapshot.ruleVersion, xpInputSnapshot: award.snapshot, awardedXp: award.awardedXp };
      const after = verifiedRunCorrectionSnapshot(afterRun);
      const correctionId = crypto.randomUUID();
      const timestamp = now();
      const reason = input.reason?.trim() || null;
      const result = await database.batch([
        database.prepare("UPDATE mastery_runs SET map_id = ?, gameplay_revision_id = ?, map_variant = ?, difficulty = ?, game_version = ?, run_code = ?, completion_duration_seconds = ?, deaths = ?, skips = ?, event_counters_json = ?, xp_rule_version = ?, xp_input_snapshot_json = ?, awarded_xp = ? WHERE id = ? AND map_id = ? AND gameplay_revision_id = ? AND map_variant IS ? AND difficulty = ? AND game_version = ? AND run_code = ? AND completion_duration_seconds = ? AND deaths IS ? AND skips IS ? AND event_counters_json = ? AND xp_rule_version = ? AND xp_input_snapshot_json = ? AND awarded_xp = ?")
          .bind(corrected.mapId, corrected.gameplayRevisionId, corrected.mapVariant, corrected.difficulty, corrected.gameVersion, corrected.matchCode, corrected.completionDurationSeconds, corrected.deaths, corrected.skips, JSON.stringify(corrected.eventCounters), award.snapshot.ruleVersion, JSON.stringify(award.snapshot), award.awardedXp, previous.runId, previous.mapId, previous.gameplayRevisionId, previous.mapVariant, previous.difficulty, previous.gameVersion, previous.matchCode, previous.completionDurationSeconds, previous.deaths, previous.skips, loaded.row.run.eventCountersJson, loaded.row.run.xpRuleVersion, loaded.row.run.xpInputSnapshotJson, loaded.row.run.awardedXp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'verified_run.correct', 'verified_run', ?, ?, ? WHERE changes() = 1").bind(correctionId, crypto.randomUUID(), auth.actorType, auth.subject, previous.runId, JSON.stringify({ reason, before, after }), timestamp),
        database.prepare("UPDATE submission_outcomes SET awarded_xp = ?, updated_at = ? WHERE submission_id = ? AND outcome_key = 'verified_run' AND outcome_type = 'verified_run' AND entity_id = ? AND status IN ('created', 'invalidated') AND changes() = 1").bind(award.awardedXp, timestamp, previous.sourceSubmissionId, previous.runId),
      ]);
      const updated = Number(result[0]?.meta?.changes ?? 0);
      if (updated !== 1) throw new Error("VERIFIED_RUN_CORRECTION_CONFLICT");
    }

    const detail = await loadAdminVerifiedRunDetail(previous.runId);
    if (!detail) throw new Error("VERIFIED_RUN_NOT_FOUND");
    const scopes = sameFacts || (oldScope.mapId === nextScope.mapId && oldScope.gameplayRevisionId === nextScope.gameplayRevisionId)
      ? [nextScope]
      : [oldScope, nextScope];
    const affectedProjections = await Promise.all(scopes.map((scope) => adminMasteryProjection(scope)));
    const response: AdminVerifiedRunCorrectionResponse = { contractVersion: "1", detail, affectedProjections };
    await recordIdempotency(auth.subject, operation, idempotencyKey, input, response);
    return response;
  };

  const verifiedRunOutcomeStatusStatement = (input: { run: typeof verifiedRuns.$inferSelect; status: "created" | "invalidated"; timestamp: number }) => database.prepare(
    "UPDATE submission_outcomes SET status = ?, updated_at = ? WHERE submission_id = ? AND outcome_key = 'verified_run' AND entity_id = ? AND status IN ('created', 'invalidated')"
  ).bind(input.status, input.timestamp, input.run.sourceSubmissionId, input.run.id);

  const challengeEvidenceLifecycleStatements = (input: { sourceSubmissionId: string; actorId: string; timestamp: number; reason: string | null; action: "invalidate" | "restore" }) => input.action === "invalidate"
    ? [
      database.prepare("UPDATE challenge_completions SET status = 'invalidated', invalidated_by = ?, invalidated_at = ?, invalidation_reason = ? WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'active'").bind(input.actorId, input.timestamp, input.reason, input.sourceSubmissionId),
      database.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence', revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE status = 'active' AND completion_id IN (SELECT id FROM challenge_completions WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'invalidated')").bind(input.actorId, input.timestamp, input.reason, input.sourceSubmissionId),
    ]
    : [
      database.prepare("UPDATE challenge_completions SET status = 'active', invalidated_by = NULL, invalidated_at = NULL, invalidation_reason = NULL WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'invalidated' AND NOT EXISTS (SELECT 1 FROM challenge_completions active WHERE active.player_account_id = challenge_completions.player_account_id AND active.challenge_id = challenge_completions.challenge_id AND active.gameplay_revision_id IS challenge_completions.gameplay_revision_id AND active.status = 'active')").bind(input.sourceSubmissionId),
      database.prepare("UPDATE player_title_grants SET status = 'active', revocation_type = NULL, revoked_by = NULL, revoked_at = NULL, revoke_reason = NULL WHERE status = 'revoked' AND revocation_type = 'evidence' AND completion_id IN (SELECT id FROM challenge_completions WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'active') AND NOT EXISTS (SELECT 1 FROM player_title_grants active WHERE active.player_account_id = player_title_grants.player_account_id AND active.title_key = player_title_grants.title_key AND active.map_id IS player_title_grants.map_id AND active.gameplay_revision_id IS player_title_grants.gameplay_revision_id AND active.status = 'active')").bind(input.sourceSubmissionId),
    ];

  const prepareVerifiedRunTransitionStatements = (input: {
    row: typeof verifiedRuns.$inferSelect;
    actor: VerifiedRunActor;
    nextStatus: "active" | "invalidated";
    reason?: string;
    timestamp?: number;
  }) => {
    const timestamp = input.timestamp ?? now();
    const reason = input.reason?.trim() || null;
    return [
      database.prepare("UPDATE mastery_runs SET status = ?, invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ?").bind(input.nextStatus, input.nextStatus === "invalidated" ? timestamp : null, input.nextStatus === "invalidated" ? input.actor.actorId : null, input.nextStatus === "invalidated" ? reason : null, input.row.id),
      database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), input.row.id, input.nextStatus === "invalidated" ? "invalidated" : "restored", input.actor.actorType, input.actor.actorId, reason, timestamp),
      verifiedRunOutcomeStatusStatement({ run: input.row, status: input.nextStatus === "invalidated" ? "invalidated" : "created", timestamp }),
      ...challengeEvidenceLifecycleStatements({ sourceSubmissionId: input.row.sourceSubmissionId, actorId: input.actor.actorId, timestamp, reason, action: input.nextStatus === "invalidated" ? "invalidate" : "restore" }),
    ];
  };

  const transitionVerifiedRun = async (input: { verifiedRunId: string; reason?: string }, actor: VerifiedRunActor, nextStatus: "active" | "invalidated"): Promise<VerifiedRun> => {
    const runId = input.verifiedRunId.trim();
    if (!runId) throw new Error("VERIFIED_RUN_NOT_FOUND");
    if (!actor.actorId.trim()) throw new Error("VERIFIED_RUN_ACTOR_INVALID");
    const row = await db.select().from(verifiedRuns).where(eq(verifiedRuns.id, runId)).get();
    if (!row) throw new Error("VERIFIED_RUN_NOT_FOUND");
    if (row.status === nextStatus) return asVerifiedRun(row);
    if (nextStatus === "active") {
      if (await findConflictingVerifiedRun(db, { playerAccountId: row.playerAccountId, matchCode: row.matchCode, exceptRunId: row.id, activeOnly: true })) {
        throw new Error("VERIFIED_RUN_MATCH_CODE_CONFLICT");
      }
    }
    await database.batch(prepareVerifiedRunTransitionStatements({ row, actor, nextStatus, reason: input.reason }));
    return asVerifiedRun((await db.select().from(verifiedRuns).where(eq(verifiedRuns.id, row.id)).get())!);
  };

  const transitionAdminVerifiedRunState = async (input: { verifiedRunId: string; action: "invalidate" | "restore"; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminVerifiedRunStateResponse> => {
    const operation = input.action === "invalidate" ? "mastery_run.invalidate" : "mastery_run.restore";
    const replay = await replayOrConflict<AdminVerifiedRunStateResponse>(auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const loaded = await loadAdminVerifiedRun(input.verifiedRunId);
    if (!loaded) throw new Error("VERIFIED_RUN_NOT_FOUND");
    const nextStatus = input.action === "invalidate" ? "invalidated" : "active";
    if (loaded.row.run.status !== nextStatus) {
      if (nextStatus === "active") {
        if (await findConflictingVerifiedRun(db, { playerAccountId: loaded.row.run.playerAccountId, matchCode: loaded.row.run.matchCode, exceptRunId: loaded.row.run.id, activeOnly: true })) {
          throw new Error("VERIFIED_RUN_MATCH_CODE_CONFLICT");
        }
      }
      const timestamp = now();
      const reason = input.reason?.trim() || null;
      await database.batch([
        database.prepare("UPDATE mastery_runs SET status = ?, invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ?").bind(nextStatus, nextStatus === "invalidated" ? timestamp : null, nextStatus === "invalidated" ? auth.subject : null, nextStatus === "invalidated" ? reason : null, loaded.row.run.id),
        database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), loaded.row.run.id, nextStatus === "invalidated" ? "invalidated" : "restored", auth.actorType, auth.subject, reason, timestamp),
        verifiedRunOutcomeStatusStatement({ run: loaded.row.run, status: nextStatus === "invalidated" ? "invalidated" : "created", timestamp }),
        ...challengeEvidenceLifecycleStatements({ sourceSubmissionId: loaded.row.run.sourceSubmissionId, actorId: auth.subject, timestamp, reason, action: nextStatus === "invalidated" ? "invalidate" : "restore" }),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'verified_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, loaded.row.run.id, JSON.stringify({ playerAccountId: loaded.row.run.playerAccountId, sourceSubmissionId: loaded.row.run.sourceSubmissionId, previousStatus: loaded.row.run.status, status: nextStatus, reason }), timestamp),
      ]);
    }
    const updated = await loadAdminVerifiedRun(input.verifiedRunId);
    if (!updated) throw new Error("VERIFIED_RUN_NOT_FOUND");
    const response: AdminVerifiedRunStateResponse = {
      contractVersion: "1",
      run: updated.view,
      projection: await adminMasteryProjection({ playerAccountId: updated.row.run.playerAccountId, mapId: updated.row.run.mapId, gameplayRevisionId: updated.row.run.gameplayRevisionId }),
    };
    await recordIdempotency(auth.subject, operation, idempotencyKey, input, response);
    return response;
  };

  const resolveAdminVerifiedRunConflictAction = async (input: { verifiedRunId: string; submissionId: string; action: "keep_existing" | "invalidate_existing"; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminVerifiedRunConflictResolutionResponse> => {
    const operation = "mastery_run.conflict.resolve";
    const replay = await replayOrConflict<AdminVerifiedRunConflictResolutionResponse>(auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const loaded = await loadAdminVerifiedRun(input.verifiedRunId);
    if (!loaded) throw new Error("VERIFIED_RUN_NOT_FOUND");
    const conflict = await db.select({ id: submissionOutcomes.id }).from(submissionOutcomes).where(and(
      eq(submissionOutcomes.submissionId, input.submissionId),
      eq(submissionOutcomes.outcomeKey, "verified_run"),
      eq(submissionOutcomes.status, "conflict"),
      eq(submissionOutcomes.entityId, loaded.row.run.id),
    )).get();
    if (!conflict) throw new Error("VERIFIED_RUN_CONFLICT_NOT_FOUND");
    const timestamp = now();
    const reason = input.reason?.trim() || null;
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT INTO mastery_run_conflict_resolutions (id, mastery_run_id, conflict_submission_id, action, actor_type, actor_id, reason, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mastery_run_id, conflict_submission_id) DO UPDATE SET action = excluded.action, actor_type = excluded.actor_type, actor_id = excluded.actor_id, reason = excluded.reason, resolved_at = excluded.resolved_at").bind(crypto.randomUUID(), loaded.row.run.id, input.submissionId, input.action, auth.actorType, auth.subject, reason, timestamp),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'verified_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, loaded.row.run.id, JSON.stringify({ conflictSubmissionId: input.submissionId, sourceSubmissionId: loaded.row.run.sourceSubmissionId, action: input.action, reason }), timestamp),
    ];
    if (input.action === "invalidate_existing" && loaded.row.run.status === "active") {
      statements.unshift(
        database.prepare("UPDATE mastery_runs SET status = 'invalidated', invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ? AND status = 'active'").bind(timestamp, auth.subject, reason, loaded.row.run.id),
        database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, 'invalidated', ?, ?, ?, ?)").bind(crypto.randomUUID(), loaded.row.run.id, auth.actorType, auth.subject, reason, timestamp),
        verifiedRunOutcomeStatusStatement({ run: loaded.row.run, status: "invalidated", timestamp }),
        ...challengeEvidenceLifecycleStatements({ sourceSubmissionId: loaded.row.run.sourceSubmissionId, actorId: auth.subject, timestamp, reason, action: "invalidate" }),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'mastery_run.invalidate', 'verified_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, loaded.row.run.id, JSON.stringify({ playerAccountId: loaded.row.run.playerAccountId, sourceSubmissionId: loaded.row.run.sourceSubmissionId, previousStatus: "active", status: "invalidated", reason, resolutionSubmissionId: input.submissionId }), timestamp),
      );
    }
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    const updated = await loadAdminVerifiedRun(input.verifiedRunId);
    if (!updated) throw new Error("VERIFIED_RUN_NOT_FOUND");
    const response: AdminVerifiedRunConflictResolutionResponse = {
      contractVersion: "1",
      action: input.action,
      run: updated.view,
      projection: await adminMasteryProjection({ playerAccountId: updated.row.run.playerAccountId, mapId: updated.row.run.mapId, gameplayRevisionId: updated.row.run.gameplayRevisionId }),
    };
    await recordIdempotency(auth.subject, operation, idempotencyKey, input, response);
    return response;
  };

  return {
    prepareVerifiedRunTransitionStatements,
    transitionVerifiedRun,
    async listAdminVerifiedRuns(input: AdminVerifiedRunQuery, _auth: AuthContext) {
      const unresolvedConflictRunIds = db.select({ runId: submissionOutcomes.entityId })
        .from(submissionOutcomes)
        .where(and(
          eq(submissionOutcomes.outcomeType, "verified_run"),
          eq(submissionOutcomes.status, "conflict"),
          notExists(db.select({ id: verifiedRunConflictResolutions.id }).from(verifiedRunConflictResolutions).where(and(
            eq(verifiedRunConflictResolutions.verifiedRunId, submissionOutcomes.entityId),
            eq(verifiedRunConflictResolutions.conflictSubmissionId, submissionOutcomes.submissionId),
          ))),
        ))
        .groupBy(submissionOutcomes.entityId);
      const condition = and(
        input.playerAccountId ? eq(verifiedRuns.playerAccountId, input.playerAccountId) : undefined,
        input.mapId ? eq(verifiedRuns.mapId, input.mapId) : undefined,
        input.gameplayRevisionId ? eq(verifiedRuns.gameplayRevisionId, input.gameplayRevisionId) : undefined,
        input.difficulty ? eq(verifiedRuns.difficulty, input.difficulty) : undefined,
        input.status ? eq(verifiedRuns.status, input.status) : undefined,
        input.unresolvedConflictsOnly ? inArray(verifiedRuns.id, unresolvedConflictRunIds) : undefined,
        input.acceptanceSource ? eq(verifiedRuns.acceptanceSource, input.acceptanceSource) : undefined,
        input.matchCode ? eq(verifiedRuns.matchCode, input.matchCode) : undefined,
        input.from !== undefined ? gte(verifiedRuns.acceptedAt, input.from) : undefined,
        input.to !== undefined ? lte(verifiedRuns.acceptedAt, input.to) : undefined,
      );
      const [rows, totalRows] = await Promise.all([
        db.select({ run: verifiedRuns, player: playerAccounts, map: maps, revision: gameplayRevisions }).from(verifiedRuns)
          .innerJoin(playerAccounts, eq(verifiedRuns.playerAccountId, playerAccounts.id))
          .innerJoin(maps, eq(verifiedRuns.mapId, maps.id))
          .innerJoin(gameplayRevisions, eq(verifiedRuns.gameplayRevisionId, gameplayRevisions.id))
          .where(condition)
          .orderBy(desc(verifiedRuns.acceptedAt), desc(verifiedRuns.id))
          .limit(input.pageSize + 1)
          .offset((input.page - 1) * input.pageSize),
        db.select({ total: count() }).from(verifiedRuns).where(condition),
      ]);
      const visibleRows = rows.slice(0, input.pageSize);
      const conflictCounts = await countVerifiedRunConflicts(visibleRows.map(({ run }) => run.id));
      return {
        contractVersion: "1" as const,
        items: visibleRows.map((row) => asAdminVerifiedRun(row, conflictCounts.get(row.run.id) ?? 0)),
        page: input.page,
        pageSize: input.pageSize,
        total: Number(totalRows[0]?.total ?? 0),
        hasMore: rows.length > input.pageSize,
      };
    },

    async getAdminVerifiedRun(input: { verifiedRunId: string }, _auth: AuthContext): Promise<AdminVerifiedRunDetailResponse> {
      const detail = await loadAdminVerifiedRunDetail(input.verifiedRunId);
      if (!detail) throw new Error("VERIFIED_RUN_NOT_FOUND");
      return detail;
    },

    correctAdminVerifiedRun: correctAdminVerifiedRunFacts,
    transitionAdminVerifiedRun: transitionAdminVerifiedRunState,
    resolveAdminVerifiedRunConflict: resolveAdminVerifiedRunConflictAction,

  };
};
