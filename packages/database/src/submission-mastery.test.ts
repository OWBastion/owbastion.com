import { describe, expect, it, vi } from "vitest";
import { assessVerifiedRunOcrEvidence, createPlatformServices } from "./index";
import { hashRequest as requestHash } from "./portal-session";
import {
  createD1, createTestDatabase, fakeEvidenceBucket, installSchema, localVerifiedRunEvidenceCompatibility, now,
  masteryOcr, seedClassicGameplayRevision, seedMap, seedMasteryPlayer, seedMasterySubmission,
  seedRevisionAssignment, seedSelectableGameplayRevision, seedTitle, synchronizeConcurrentBatches, uploadHash,
} from "../test/map-title-rule-fixtures";

const automaticRunFacts = {
  mapId: "map.mastery",
  gameplayRevisionId: "revision:map.mastery:initial",
  mapVariant: null,
  difficulty: "困难",
  gameVersion: "99.0101.1",
  matchCode: "1234-5678-9012",
  completionDurationSeconds: 600,
  deaths: 1,
  skips: 0,
  eventCounters: {},
  acceptanceSource: "submission_automatic",
  acceptedAt: now,
} as const;

describe("submission mastery outcomes", () => {
  it("keeps the version, layout, and run-code gate platform-owned", () => {
    expect(assessVerifiedRunOcrEvidence(masteryOcr())).toEqual({ outcome: "ineligible", reason: "mastery_rollout_disabled" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr(), localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible", matchCode: "1234-5678-9012", gameVersion: "99.0101.1" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ viewerPlayer: null }), localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ viewerPlayer: "Misread#9999" }), localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ matchCode: null }), localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ layoutVersion: "test-layout-v0" }), localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unsupported_layout" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ version: "99.0100.9" }), localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unsupported_game_version" });
    const weakRunCode = masteryOcr();
    weakRunCode.fields.run_code = { status: "low_confidence", confidence: 0.89 };
    expect(assessVerifiedRunOcrEvidence(weakRunCode, localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
  });

  it("restores the completed upload to an actionable state when queue send fails, then lets the player retry", async () => {
    const { database, sqlite } = createTestDatabase();
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    const sessionToken = "replay-player-one";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
      .run("session.player.one", "attempt.player.one", "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
    const stored = new Map<string, ArrayBuffer>();
    const queued: unknown[] = [];
    let failNextSend = true;
    const services = createPlatformServices(
      database,
      { put: async (key: string, value: ArrayBuffer) => { stored.set(key, value); } } as unknown as R2Bucket,
      "https://api.example.com", undefined, undefined,
      { send: async (message: unknown) => { if (failNextSend) { failNextSend = false; throw new Error("queue unavailable"); } queued.push(message); } } as Queue,
    );
    const body = new TextEncoder().encode("replayed-image").buffer as ArrayBuffer;
    const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, sessionToken);
    await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, sessionToken);

    await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.first")).rejects.toThrow("queue unavailable");
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(upload.submissionId)).toEqual({ status: "upload_pending" });

    await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.retry")).resolves.toEqual({ submissionId: upload.submissionId, status: "processing" });
    expect(queued).toEqual([expect.objectContaining({ submissionId: upload.submissionId, requestId: "request.retry" })]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submissions").get()).toEqual({ count: 1 });
  });

  it("lets only one concurrent player completion enqueue, so a competing send failure cannot undo it", async () => {
    const { database, sqlite } = createTestDatabase();
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    const sessionToken = "concurrent-completion-player-one";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
      .run("session.player.one", "attempt.player.one", "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
    let sendCount = 0;
    let releaseQueueSend!: () => void;
    let markQueueSendStarted!: () => void;
    const queueSendStarted = new Promise<void>((resolve) => { markQueueSendStarted = resolve; });
    const queueSendGate = new Promise<void>((resolve) => { releaseQueueSend = resolve; });
    const queue = {
      send: vi.fn(async () => {
        sendCount += 1;
        markQueueSendStarted();
        if (sendCount === 2) throw new Error("competing queue send rejected");
        await queueSendGate;
      }),
    } as unknown as Queue;
    const services = createPlatformServices(
      synchronizeConcurrentBatches(database, 2),
      { put: async () => undefined } as unknown as R2Bucket,
      "https://api.example.com", undefined, undefined, queue,
    );
    const body = new TextEncoder().encode("concurrent-image").buffer as ArrayBuffer;
    const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, sessionToken);
    await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, sessionToken);

    const first = services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.concurrent.first");
    const second = services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.concurrent.second");
    const settle = (promise: Promise<unknown>) => promise.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    const firstSettled = settle(first);
    const secondSettled = settle(second);
    await queueSendStarted;
    const earlyOutcome = await Promise.race([firstSettled, secondSettled]);
    releaseQueueSend();
    const outcomes = await Promise.all([firstSettled, secondSettled]);

    expect(earlyOutcome).toMatchObject({ status: "rejected", reason: new Error("UPLOAD_COMPLETION_IN_PROGRESS") });
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toMatchObject([
      { status: "rejected", reason: new Error("UPLOAD_COMPLETION_IN_PROGRESS") },
    ]);
    expect(queue.send).toHaveBeenCalledOnce();
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(upload.submissionId)).toEqual({ status: "ocr_pending" });
  });

  it("repairs a completed upload session whose submission never left upload_pending", async () => {
    const { database, sqlite } = createTestDatabase();
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    const sessionToken = "repair-player-one";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
      .run("session.player.one", "attempt.player.one", "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
    const queued: unknown[] = [];
    const services = createPlatformServices(
      database,
      { put: async () => undefined } as unknown as R2Bucket,
      "https://api.example.com", undefined, undefined,
      { send: async (message: unknown) => { queued.push(message); } } as Queue,
    );
    const body = new TextEncoder().encode("partial-image").buffer as ArrayBuffer;
    const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, sessionToken);
    await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, sessionToken);
    sqlite.prepare("UPDATE upload_sessions SET status = 'completed' WHERE id = ?").run(upload.uploadId);

    await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.repair")).resolves.toEqual({ submissionId: upload.submissionId, status: "processing" });
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(upload.submissionId)).toEqual({ status: "ocr_pending" });
    expect(queued).toEqual([expect.objectContaining({ submissionId: upload.submissionId })]);
  });

  it("covers the authenticated upload, unlisted CDN screenshot, OCR, mastery-only, and combined-title paths with local fakes", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasteryPlayer(sqlite, "player.two", "binding.two", "Other");

    const playerOneSession = "integration-player-one";
    const playerTwoSession = "integration-player-two";
    for (const [playerId, token] of [["player.one", playerOneSession], ["player.two", playerTwoSession]] as const) {
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
        .run(`session.${playerId}`, `attempt.${playerId}`, `group.${playerId}`, `member.${playerId}`, await requestHash(token), now + 60_000, now);
    }

    const storedObjects = new Map<string, ArrayBuffer>();
    const queued: Array<{ version: number; submissionId: string; objectKey: string; requestId?: string }> = [];
    const ocrRequests: Array<{ url: string; contentType: string; size: number; formFields: string[] }> = [];
    const ocrResponses: Array<ReturnType<typeof masteryOcr>> = [];
    const evidenceBucket = {
      put: async (key: string, value: ArrayBuffer) => { storedObjects.set(key, value); },
      get: async (key: string) => {
        const body = storedObjects.get(key);
        return body ? { size: body.byteLength, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => body } : null;
      },
    } as unknown as R2Bucket;
    const queue = {
      send: async (message: unknown) => { queued.push(message as (typeof queued)[number]); },
    } as Queue;
    const services = createPlatformServices(
      database,
      evidenceBucket,
      "https://api.example.com",
      "https://ocr.example.com",
      "token",
      queue,
      undefined,
      undefined,
      1,
      0,
      localVerifiedRunEvidenceCompatibility,
    );

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as FormData;
      const file = body.get("file");
      if (!(file instanceof Blob)) throw new Error("missing multipart image");
      ocrRequests.push({ url: String(url), contentType: file.type, size: file.size, formFields: [...body.keys()] });
      const response = ocrResponses.shift();
      if (!response) throw new Error("missing OCR response fixture");
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const submit = async (input: { sessionToken: string; bytes: string; ocr: ReturnType<typeof masteryOcr>; requestId: string }) => {
      const body = new TextEncoder().encode(input.bytes).buffer as ArrayBuffer;
      const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, input.sessionToken);
      await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, input.sessionToken);
      await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, input.sessionToken, input.requestId)).resolves.toEqual({ submissionId: upload.submissionId, status: "processing" });
      const job = queued.shift();
      if (!job) throw new Error("missing OCR queue job");
      ocrResponses.push(input.ocr);
      await services.processOcrJob({ ...job, attempt: 1 });
      return { submissionId: upload.submissionId, objectKey: job.objectKey };
    };

    try {
      const first = await submit({ sessionToken: playerOneSession, bytes: "same-image", ocr: masteryOcr(), requestId: "request.first" });
      expect(first.objectKey).toMatch(/^uploads\/submissions\/[^/]+\/[0-9a-f]{64}\.png$/);
      const exactReplay = await submit({ sessionToken: playerOneSession, bytes: "same-image", ocr: masteryOcr(), requestId: "request.exact" });
      const reencodedReplay = await submit({ sessionToken: playerOneSession, bytes: "changed-image", ocr: masteryOcr(), requestId: "request.reencoded" });
      const otherPlayer = await submit({ sessionToken: playerTwoSession, bytes: "other-player-image", ocr: masteryOcr({ viewerPlayer: "Misread#9999" }), requestId: "request.other" });
      const conflict = await submit({ sessionToken: playerOneSession, bytes: "conflicting-image", ocr: masteryOcr({ difficulty: "传奇" }), requestId: "request.conflict" });

      expect(sqlite.prepare("SELECT submission_id, status, awarded_xp FROM submission_outcomes WHERE outcome_key = 'verified_run' ORDER BY submission_id").all()).toEqual([
        { submission_id: conflict.submissionId, status: "conflict", awarded_xp: 0 },
        { submission_id: exactReplay.submissionId, status: "reused", awarded_xp: 0 },
        { submission_id: first.submissionId, status: "created", awarded_xp: 236 },
        { submission_id: otherPlayer.submissionId, status: "created", awarded_xp: 236 },
        { submission_id: reencodedReplay.submissionId, status: "reused", awarded_xp: 0 },
      ].sort((left, right) => left.submission_id.localeCompare(right.submission_id)));
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(conflict.submissionId)).toEqual({ status: "ocr_review_required" });

      const firstProfile = await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 });
      expect(firstProfile).toMatchObject({
        profiles: [{ mapId: "map.mastery", totalXp: 236, verifiedRunCount: 1, difficultyStats: [{ difficulty: "困难", verifiedRunCount: 1, fastestCompletionSeconds: 600 }], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 236, highestCompletedDifficulty: "困难" }],
        total: 1,
        hasMore: false,
      });
      expect(JSON.stringify(firstProfile)).not.toMatch(/playerAccountId|sourceSubmissionId|matchCode|1234-5678-9012|gameVersion|eventCounters|acceptanceSource|xpInputSnapshot|invalidation/);

      const publicServices = createPlatformServices(database);
      const publicFirst = await publicServices.getSubmission({ submissionId: first.submissionId }, {} as never);
      const playerFirst = await services.getPlayerSubmission({ submissionId: first.submissionId }, playerOneSession);
      expect(publicFirst.verifiedRunOutcome).toEqual({ status: "created", awardedXp: 236 });
      expect(playerFirst.verifiedRunOutcome).toEqual({ status: "created", awardedXp: 236 });
      expect(JSON.stringify({ publicFirst, playerFirst })).not.toMatch(/1234-5678-9012|player\.one|integration-evidence|uploads\/submissions|verifiedRunId|object_key/);

      const adminConflict = await services.getAdminSubmission({ submissionId: conflict.submissionId }, {} as never);
      const verifiedRunId = adminConflict.verifiedRunOutcome?.verifiedRunId;
      if (!verifiedRunId) throw new Error("missing mastery conflict target");
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await services.resolveAdminVerifiedRunConflict({ verifiedRunId, submissionId: conflict.submissionId, action: "invalidate_existing", reason: "local integration invalidation" }, maintainer, "integration-invalidate");
      expect(await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 })).toMatchObject({ profiles: [], total: 1, runs: [{ status: "invalidated" }] });
      await services.transitionAdminVerifiedRun({ verifiedRunId, action: "restore", reason: "local integration restoration" }, maintainer, "integration-restore");
      expect(await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 })).toMatchObject({ profiles: [{ totalXp: 236, verifiedRunCount: 1 }], total: 1, runs: [{ status: "active" }] });

      seedTitle(sqlite, "CONQUEROR");
      sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.combined', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.combined" });
      const combined = await submit({ sessionToken: playerOneSession, bytes: "combined-image", ocr: masteryOcr({ matchCode: "2345-6789-1234", durationSeconds: 599, layoutVersion: "1280x720-v6" }), requestId: "request.combined" });
      expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = ? ORDER BY outcome_type").all(combined.submissionId)).toEqual([
        { outcome_type: "challenge", status: "created" },
        { outcome_type: "title_grant", status: "created" },
        { outcome_type: "verified_run", status: "created" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.one' AND title_key = 'CONQUEROR' AND status = 'active'").get()).toEqual({ count: 1 });

      // Rejecting and re-approving a Submission that produced both a Title and a Verified Run reports the retained Title too.
      const combinedGrant = sqlite.prepare("SELECT id FROM player_title_grants WHERE source_id = ?").get(combined.submissionId) as { id: string };
      await services.reviewSubmission({ submissionId: combined.submissionId, decision: "rejected" }, maintainer, "combined.reject");
      expect(await services.getAdminSubmission({ submissionId: combined.submissionId }, maintainer)).toMatchObject({ status: "rejected", activeTitleGrants: [{ grantId: combinedGrant.id, titleKey: "CONQUEROR" }], verifiedRunOutcome: { status: "created" } });
      expect(await services.previewSubmissionReview({ submissionId: combined.submissionId }, maintainer)).toMatchObject({ approvable: true, blockingCode: null, verifiedRun: { status: "recorded" }, titles: [{ titleKey: "CONQUEROR", alreadyOwned: true }] });
      await expect(services.reviewSubmission({ submissionId: combined.submissionId, decision: "approved" }, maintainer, "combined.reapprove")).resolves.toMatchObject({
        decision: "approved", grantId: combinedGrant.id, titleKey: "CONQUEROR", alreadyOwned: true, grants: [{ grantId: combinedGrant.id, alreadyOwned: true }], verifiedRunOutcome: { status: "created" },
      });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = ?").get(combined.submissionId)).toEqual({ count: 1 });
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = ?").get(combined.submissionId)).toEqual({ status: "approved", grant_id: combinedGrant.id });

      expect(storedObjects.size).toBe(6);
      expect([...storedObjects.keys()].every((key) => key.startsWith("uploads/submissions/"))).toBe(true);
      expect(ocrRequests).toHaveLength(6);
      expect(ocrRequests.every(({ url, contentType, formFields }) => url === "https://ocr.example.com/api/v1/ocr/challenge" && contentType === "image/png" && formFields.length === 1 && formFields[0] === "file")).toBe(true);
      expect(queued).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("completes a Run-only Submission when an unrelated Challenge has no matching evidence", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedTitle(sqlite, "FLAWLESS");
    sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'FLAWLESS'").run();
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.flawless', 'FLAWLESS', '全成就完成', '成就列表', 'manual', '99.0101.1', 'active', '99.0101.1', 'global', ?, ?)").run(now, now);
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.run-only-review", "binding.one", "Tester");

    const ocr = masteryOcr({ matchCode: "3456-7890-1234", layoutVersion: "1280x720-v6" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.run-only-review", objectKey: "evidence/submission.run-only-review.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.run-only-review'").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = 'submission.run-only-review'").all()).toEqual([{ outcome_type: "verified_run", status: "created" }]);
    expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.run-only-review'").get()).toEqual({ status: "active" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.run-only-review'").get()).toEqual({ count: 0 });
  });

  it("commits a corrected review Run and its Submission outcome atomically", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.review-atomic", "binding.review-atomic", "Review Atomic");
    seedMasterySubmission(sqlite, "submission.review-atomic", "binding.review-atomic", "Review Atomic");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", "submission.review-atomic");
    const ocr = masteryOcr();
    ocr.data.map_name = "地图 unknown";
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.review-atomic', 'submission.review-atomic', 1, 'review_required', ?, ?)").run(JSON.stringify(ocr), now);
    sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES ('outcome.review-atomic', 'submission.review-atomic', 'verified_run', 'verified_run', 'ineligible', NULL, 0, ?, ?, ?)").run(JSON.stringify({ reason: "submission_map_mismatch", conflictFields: [] }), now, now);
    const sessionToken = "review-atomic-player-session";
    const tokenHash = await requestHash(sessionToken);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.review-atomic', 'player.review-atomic', ?, ?, ?)").run(tokenHash, Date.now() + 60_000, now);
    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const input = {
      submissionId: "submission.review-atomic",
      decision: "approved" as const,
      fieldCorrections: [{ fieldKey: "map_name" as const, reviewedValue: "地图 map.mastery" }],
    };
    const preview = await services.previewSubmissionReview(input, maintainer);
    expect(preview).toMatchObject({ approvable: true, blockingCode: null, verifiedRun: { status: "eligible", reason: null } });

    const originalBatch = database.batch.bind(database);
    let failNextBatch = true;
    database.batch = async (statements) => {
      if (!failNextBatch) return originalBatch(statements);
      failNextBatch = false;
      return originalBatch([...statements, database.prepare("INSERT INTO missing_review_table (id) VALUES ('force rollback')")]);
    };
    await expect(services.reviewSubmission(input, maintainer, "review-atomic")).rejects.toThrow();
    expect(sqlite.prepare("SELECT status, gameplay_revision_id FROM submissions WHERE id = 'submission.review-atomic'").get()).toEqual({ status: "ocr_review_required", gameplay_revision_id: null });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.review-atomic' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.review-atomic'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_run_lifecycle_events").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.review-atomic'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE id = 'admin:submission.review:review-atomic'").get()).toEqual({ count: 0 });

    database.batch = originalBatch;
    const approved = await services.reviewSubmission(input, maintainer, "review-atomic");
    expect(approved).toMatchObject({ decision: "approved", verifiedRunOutcome: { status: "created", awardedXp: expect.any(Number) } });
    await expect(services.reviewSubmission(input, maintainer, "review-atomic")).resolves.toEqual(approved);
    expect(sqlite.prepare("SELECT status, gameplay_revision_id FROM submissions WHERE id = 'submission.review-atomic'").get()).toEqual({ status: "approved", gameplay_revision_id: "revision:map.mastery:initial" });
    expect(sqlite.prepare("SELECT status, awarded_xp FROM submission_outcomes WHERE submission_id = 'submission.review-atomic' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created", awarded_xp: approved.verifiedRunOutcome?.awardedXp });
    expect(sqlite.prepare("SELECT status, acceptance_source FROM mastery_runs WHERE source_submission_id = 'submission.review-atomic'").get()).toEqual({ status: "active", acceptance_source: "submission_review" });
    expect(sqlite.prepare("SELECT transition, actor_id FROM mastery_run_lifecycle_events WHERE mastery_run_id = (SELECT id FROM mastery_runs WHERE source_submission_id = 'submission.review-atomic')").all()).toEqual([{ transition: "accepted", actor_id: "submission_review" }]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.review-atomic'").get()).toEqual({ count: 1 });
    expect(await services.getAdminSubmission({ submissionId: input.submissionId }, maintainer)).toMatchObject({ verifiedRunOutcome: { status: "created", awardedXp: approved.verifiedRunOutcome?.awardedXp } });
    expect(await services.getPlayerSubmission({ submissionId: input.submissionId }, sessionToken)).toMatchObject({ verifiedRunOutcome: { status: "created", awardedXp: approved.verifiedRunOutcome?.awardedXp } });
    expect(await services.previewSubmissionReview(input, maintainer)).toMatchObject({ approvable: true, blockingCode: null, verifiedRun: { status: "recorded", reason: null } });
  });

  it("plans the same complete Verified Run checks that approval records", async () => {
    const scenarios = [
      { submissionId: "submission.preview-ambiguous", mapName: "地图 map.mastery", extraMap: true, expectedReason: "ambiguous_map", expectedOutcome: "ineligible" },
      { submissionId: "submission.preview-mismatch", mapName: "地图 map.other", extraMap: false, expectedReason: "submission_map_mismatch", expectedOutcome: "ineligible" },
      { submissionId: "submission.preview-conflict", mapName: "地图 map.mastery", extraMap: false, expectedReason: "conflicting_run_code_evidence", expectedOutcome: "conflict" },
      { submissionId: "submission.preview-clean", mapName: "地图 map.mastery", extraMap: false, expectedReason: null, expectedOutcome: "created" },
    ] as const;

    for (const scenario of scenarios) {
      const { database, sqlite } = createTestDatabase("map.mastery");
      if (scenario.extraMap) {
        sqlite.prepare("INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.mastery.duplicate', '地图 map.mastery', '2026.07.15', 'active', '2026.07.15', ?, ?)").run(now, now);
      }
      if (scenario.mapName === "地图 map.other") seedMap(sqlite, "map.other");
      seedMasteryPlayer(sqlite, "player.preview", "binding.preview", "Preview Player");
      seedMasterySubmission(sqlite, scenario.submissionId, "binding.preview", "Preview Player");
      sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", scenario.submissionId);
      const ocr = masteryOcr({ difficulty: scenario.expectedOutcome === "conflict" ? "传奇" : "困难" });
      ocr.data.map_name = scenario.mapName;
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES (?, ?, 1, 'review_required', ?, ?)").run(`ocr.${scenario.submissionId}`, scenario.submissionId, JSON.stringify(ocr), now);
      sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES (?, ?, 'verified_run', 'verified_run', 'ineligible', NULL, 0, '{}', ?, ?)").run(`outcome.${scenario.submissionId}`, scenario.submissionId, now, now);
      const retainedTitleKey = `RETAINED_${scenario.submissionId.replaceAll(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
      seedTitle(sqlite, retainedTitleKey);
      const retainedGrantId = `grant.${scenario.submissionId}`;
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, status, source_type, source_id, granted_by, granted_at) VALUES (?, 'player.preview', ?, NULL, NULL, 'active', 'submission', ?, 'admin', ?)").run(retainedGrantId, retainedTitleKey, scenario.submissionId, now);
      sqlite.prepare("UPDATE submissions SET grant_id = ? WHERE id = ?").run(retainedGrantId, scenario.submissionId);

      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      if (scenario.expectedOutcome === "conflict") {
        seedMasterySubmission(sqlite, `submission.existing-${scenario.submissionId}`, "binding.preview", "Preview Player");
        await services.recordVerifiedRun({ playerAccountId: "player.preview", sourceSubmissionId: `submission.existing-${scenario.submissionId}`, mapId: "map.mastery", gameplayRevisionId: "revision:map.mastery:initial", mapVariant: null, difficulty: "困难", gameVersion: "99.0101.1", matchCode: "1234-5678-9012", completionDurationSeconds: 600, deaths: 1, skips: 0, eventCounters: {}, acceptanceSource: "submission_automatic" });
      }
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const preview = await services.previewSubmissionReview({ submissionId: scenario.submissionId }, maintainer);
      expect(preview, scenario.submissionId).toMatchObject({
        approvable: true,
        blockingCode: null,
        verifiedRun: scenario.expectedOutcome === "created"
          ? { status: "eligible", reason: null }
          : { status: "ineligible", reason: scenario.expectedReason },
      });
      const approval = await services.reviewSubmission({ submissionId: scenario.submissionId, decision: "approved" }, maintainer, `review.${scenario.submissionId}`);
      const storedOutcome = sqlite.prepare("SELECT status, details_json FROM submission_outcomes WHERE submission_id = ? AND outcome_key = 'verified_run'").get(scenario.submissionId) as { status: string; details_json: string };
      expect(storedOutcome.status, scenario.submissionId).toBe(scenario.expectedOutcome);
      expect(JSON.parse(storedOutcome.details_json).reason, scenario.submissionId).toBe(scenario.expectedReason);
      expect(approval.decision, scenario.submissionId).toBe("approved");
      if (scenario.expectedOutcome === "created") expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = ?").get(scenario.submissionId)).toEqual({ count: 1 });
      if (scenario.expectedOutcome !== "created") expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = ?").get(scenario.submissionId)).toEqual({ count: 0 });
    }
  });

  it("rolls back review approval when a concurrent Run insert wins, then retries against that Run", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.review-race", "binding.review-race", "Review Race");
    seedMasterySubmission(sqlite, "submission.review-race", "binding.review-race", "Review Race");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", "submission.review-race");
    const ocr = masteryOcr();
    ocr.data.map_name = "地图 unknown";
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.review-race', 'submission.review-race', 1, 'review_required', ?, ?)").run(JSON.stringify(ocr), now);
    sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES ('outcome.review-race', 'submission.review-race', 'verified_run', 'verified_run', 'ineligible', NULL, 0, '{}', ?, ?)").run(now, now);

    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const input = {
      submissionId: "submission.review-race",
      decision: "approved" as const,
      fieldCorrections: [{ fieldKey: "map_name" as const, reviewedValue: "地图 map.mastery" }],
    };
    const originalBatch = database.batch.bind(database);
    let concurrentRunId: string | null = null;
    database.batch = async (statements) => {
      database.batch = originalBatch;
      const concurrentRun = await services.recordVerifiedRun({
        ...automaticRunFacts,
        playerAccountId: "player.review-race",
        sourceSubmissionId: "submission.review-race",
      });
      concurrentRunId = concurrentRun.run.runId;
      return originalBatch(statements);
    };

    await expect(services.reviewSubmission(input, maintainer, "review-race")).rejects.toThrow();
    database.batch = originalBatch;
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.review-race'").get()).toEqual({ status: "ocr_review_required" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.review-race'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.review-race' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible" });
    expect(sqlite.prepare("SELECT id FROM mastery_runs WHERE source_submission_id = 'submission.review-race'").get()).toEqual({ id: concurrentRunId });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE id = 'admin:submission.review:review-race'").get()).toEqual({ count: 0 });

    await expect(services.reviewSubmission(input, maintainer, "review-race")).resolves.toMatchObject({ decision: "approved", verifiedRunOutcome: { status: "created" } });
    expect(sqlite.prepare("SELECT status, entity_id FROM submission_outcomes WHERE submission_id = 'submission.review-race' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created", entity_id: concurrentRunId });
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.review-race'").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.review-race'").get()).toEqual({ count: 1 });
  });

  it("does not show a stale recorded Run when corrected preview evidence conflicts", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.preview-stale", "binding.preview-stale", "Preview Stale");
    seedMasterySubmission(sqlite, "submission.preview-stale", "binding.preview-stale", "Preview Stale");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", "submission.preview-stale");
    const ocr = masteryOcr();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.preview-stale', 'submission.preview-stale', 1, 'review_required', ?, ?)").run(JSON.stringify(ocr), now);
    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const run = await services.recordVerifiedRun({
      ...automaticRunFacts,
      playerAccountId: "player.preview-stale",
      sourceSubmissionId: "submission.preview-stale",
    });
    sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES ('outcome.preview-stale', 'submission.preview-stale', 'verified_run', 'verified_run', 'created', ?, ?, '{}', ?, ?)").run(run.run.runId, run.run.awardedXp, now, now);

    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const preview = await services.previewSubmissionReview({
      submissionId: "submission.preview-stale",
      fieldCorrections: [{ fieldKey: "difficulty", reviewedValue: "传奇" }],
    }, maintainer);

    expect(preview).toMatchObject({
      approvable: false,
      blockingCode: "SUBMISSION_OUTCOME_NOT_CONFIGURED",
      verifiedRun: { status: "ineligible", reason: "conflicting_run_code_evidence" },
    });
  });

  it("matches map Challenges only on the exact Gameplay Revision identified by the evidence", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedTitle(sqlite, "CONQUEROR");
    const otherRevisionId = seedSelectableGameplayRevision(sqlite, "map.mastery");
    sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.revision-scoped', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.revision-scoped" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: otherRevisionId, mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.revision-scoped" });
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.revision-scoped", "binding.one", "Tester");

    const ocr = masteryOcr({ layoutVersion: "1280x720-v6" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.revision-scoped", objectKey: "evidence/submission.revision-scoped.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT title_key, gameplay_revision_id FROM player_title_grants WHERE source_id = 'submission.revision-scoped'").all()).toEqual([
      { title_key: "CONQUEROR", gameplay_revision_id: "revision:map.mastery:initial" },
    ]);
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM submissions WHERE id = 'submission.revision-scoped'").get()).toEqual({ gameplay_revision_id: "revision:map.mastery:initial" });
  });

  it("keeps player-profile and maintainer-list reads bounded as mastery history grows", async () => {
    const measure = async (runCount: number) => {
      const { database, sqlite, preparedStatementCount, resetPreparedStatementCount } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.mastery");
      seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
      const sessionToken = `query-budget-${runCount}`;
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
        .run(`session.${runCount}`, `attempt.${runCount}`, "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
      const services = createPlatformServices(database);

      for (let index = 0; index < runCount; index += 1) {
        const submissionId = `submission.query-budget.${runCount}.${index}`;
        seedMasterySubmission(sqlite, submissionId, "binding.one", "Tester");
        const recorded = await services.recordVerifiedRun({
          playerAccountId: "player.one",
          sourceSubmissionId: submissionId,
          mapId: "map.mastery",
          gameplayRevisionId: "revision:map.mastery:initial",
          mapVariant: null,
          difficulty: "困难",
          gameVersion: "99.0101.1",
          matchCode: `${String(1000 + index).padStart(4, "0")}-5678-9012`,
          completionDurationSeconds: 600 + index,
          deaths: 1,
          skips: 0,
          acceptanceSource: "submission_automatic",
          acceptedAt: now + index,
        });
        expect(recorded.outcome).toBe("created");
      }

      resetPreparedStatementCount();
      const profile = await services.getCurrentPlayerMastery({ sessionToken, mapId: "map.mastery", page: 1, pageSize: 20 });
      const profileStatements = preparedStatementCount();
      resetPreparedStatementCount();
      const list = await services.listAdminVerifiedRuns({ page: 1, pageSize: 20 }, {} as never);
      const listStatements = preparedStatementCount();
      return { profile, list, profileStatements, listStatements };
    };

    const oneRun = await measure(1);
    const fortyRuns = await measure(40);
    expect(oneRun.profile).toMatchObject({ profiles: [{ verifiedRunCount: 1 }], total: 1, hasMore: false });
    expect(fortyRuns.profile).toMatchObject({ profiles: [{ verifiedRunCount: 40 }], total: 40, hasMore: true });
    expect(oneRun.list).toMatchObject({ total: 1, hasMore: false });
    expect(fortyRuns.list).toMatchObject({ total: 40, hasMore: true });
    expect(fortyRuns.profileStatements).toBe(oneRun.profileStatements);
    expect(fortyRuns.listStatements).toBe(oneRun.listStatements);
    expect(fortyRuns.profileStatements).toBeLessThanOrEqual(6);
    expect(fortyRuns.listStatements).toBeLessThanOrEqual(3);
  });

  it("shows recent challenge completions and a bounded verified-run summary on the admin player detail", async () => {
    const { database, sqlite } = createTestDatabase();
    const playerAccountId = "player.admin-context";
    const mapId = "map.admin-context";
    const revisionId = `revision:${mapId}:initial`;
    seedMap(sqlite, mapId);
    seedMasteryPlayer(sqlite, playerAccountId, "binding.admin-context", "Context Player");
    seedMasterySubmission(sqlite, "submission.admin-context", "binding.admin-context", "Context Player", false);
    seedTitle(sqlite, "ADMIN_CONTEXT");
    sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, map_id, gameplay_revision_id, status, manual, condition, created_at, updated_at) VALUES (?, 'title', ?, 'ADMIN_CONTEXT', 'v1', ?, ?, 'active', 1, '管理员手动授予', ?, ?)")
      .run("challenge.admin-context", "title.ADMIN_CONTEXT", mapId, revisionId, now, now);
    sqlite.prepare("INSERT INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) VALUES (?, ?, ?, ?, 'active', 'manual', ?, ?, ?)")
      .run("completion.admin-context", playerAccountId, "challenge.admin-context", revisionId, "manual:admin-context", now, now);
    sqlite.prepare("INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES (?, ?, ?, ?, ?, NULL, '困难', '2026.07.15', '1234-5678-9012', 600, 1, 0, '{}', 'submission_automatic', ?, 'active', 'v2', '{}', 120, ?)")
      .run("run.admin-context", playerAccountId, "submission.admin-context", mapId, revisionId, now + 3, now);
    sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = ?").run(revisionId);
    const currentRevisionId = `revision:${mapId}:rework`;
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'default', NULL, ?, 'revision reset', '2026.08.10', ?, ?)")
      .run(currentRevisionId, mapId, revisionId, now, now);
    const selectableRevisionId = seedSelectableGameplayRevision(sqlite, mapId, "selectable");
    const insertRun = (runId: string, submissionId: string, runRevisionId: string, acceptedAt: number, matchCode: string) => {
      seedMasterySubmission(sqlite, submissionId, "binding.admin-context", "Context Player", false);
      sqlite.prepare("INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES (?, ?, ?, ?, ?, NULL, '困难', '2026.08.10', ?, 600, 1, 0, '{}', 'submission_automatic', ?, 'active', 'v2', '{}', 120, ?)")
        .run(runId, playerAccountId, submissionId, mapId, runRevisionId, matchCode, acceptedAt, now);
    };
    insertRun("run.admin-context.default", "submission.admin-context.default", currentRevisionId, now + 2, "2345-6789-1234");
    insertRun("run.admin-context.selectable", "submission.admin-context.selectable", selectableRevisionId, now + 1, "3456-7891-2345");

    const detail = await createPlatformServices(database).getAdminPlayer({ playerAccountId }, {} as never);

    expect(detail.recentCompletions).toEqual([expect.objectContaining({
      completionId: "completion.admin-context",
      challengeId: "challenge.admin-context",
      titleKey: "ADMIN_CONTEXT",
      titleName: "称号 ADMIN_CONTEXT",
      mapName: `地图 ${mapId}`,
      gameplayRevisionId: revisionId,
      gameVersion: "2026.07.15",
      status: "active",
      sourceType: "manual",
    })]);
    expect(detail.progression).toEqual({
      activeVerifiedRunCount: 2,
      recentVerifiedRuns: expect.arrayContaining([expect.objectContaining({
        runId: "run.admin-context.default",
        mapName: `地图 ${mapId}`,
        gameplayRevisionId: currentRevisionId,
        gameVersion: "2026.08.10",
        difficulty: "困难",
        awardedXp: 120,
      })]),
    });
    expect(detail.progression.recentVerifiedRuns.map(({ runId }) => runId)).toEqual([
      "run.admin-context.default",
      "run.admin-context.selectable",
    ]);
    expect(JSON.stringify(detail.progression)).not.toContain("1234-5678-9012");
  });

  it("requires and preserves a classic map variant when the submission contract distinguishes it", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedClassicGameplayRevision(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-missing", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-present", "binding.one", "Tester");
    for (const submissionId of ["submission.classic-missing", "submission.classic-present"]) {
      sqlite.prepare("UPDATE submissions SET rule_snapshot_json = ? WHERE id = ?").run(JSON.stringify({ ruleId: "challenge:classic", mapVariant: "classic" }), submissionId);
    }

    let ocr = masteryOcr({ matchCode: "2345-6789-1234" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.classic-missing", objectKey: "evidence/submission.classic-missing.png", attempt: 1 });
      ocr = masteryOcr({ matchCode: "3456-7891-2345", mapVariant: "classic" });
      await services.processOcrJob({ submissionId: "submission.classic-present", objectKey: "evidence/submission.classic-present.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.classic-missing' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible" });
    expect(sqlite.prepare("SELECT map_variant FROM mastery_runs WHERE source_submission_id = 'submission.classic-present'").get()).toEqual({ map_variant: "classic" });
  });

  it("does not let an OCR queue key select evidence outside its submission attachment", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.bound", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.other", "binding.one", "Tester", false);
    sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'portal', ?, 'image/png', 1, 'hash', ?, 'stored', ?)")
      .run("attachment.other", "submission.other", "external.other", "evidence/other-submission.png", now);
    const get = vi.fn(async () => ({ size: 1, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => new Uint8Array([1]).buffer }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      const services = createPlatformServices(database, { get } as unknown as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token");
      await expect(services.processOcrJob({ submissionId: "submission.bound", objectKey: "evidence/other-submission.png", attempt: 1 })).rejects.toThrow("OCR_EVIDENCE_UNAVAILABLE");
      expect(get).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("credits one player run once across exact and changed screenshots, keeps players independent, and surfaces conflicts", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasteryPlayer(sqlite, "player.two", "binding.two", "Other");
    for (const submissionId of ["submission.first", "submission.exact", "submission.reencoded", "submission.conflict"]) seedMasterySubmission(sqlite, submissionId, "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.other", "binding.two", "Other");

    let ocr = masteryOcr();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.first", objectKey: "evidence/submission.first.png", attempt: 1 });
      await services.processOcrJob({ submissionId: "submission.exact", objectKey: "evidence/submission.exact.png", attempt: 1 });
      await services.processOcrJob({ submissionId: "submission.reencoded", objectKey: "evidence/submission.reencoded.png", attempt: 1 });
      ocr = masteryOcr({ viewerPlayer: "Other#5678" });
      await services.processOcrJob({ submissionId: "submission.other", objectKey: "evidence/submission.other.png", attempt: 1 });
      ocr = masteryOcr({ difficulty: "传奇" });
      await services.processOcrJob({ submissionId: "submission.conflict", objectKey: "evidence/submission.conflict.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT player_account_id, run_code, awarded_xp FROM mastery_runs ORDER BY player_account_id").all()).toEqual([
      { player_account_id: "player.one", run_code: "1234-5678-9012", awarded_xp: 236 },
      { player_account_id: "player.two", run_code: "1234-5678-9012", awarded_xp: 236 },
    ]);
    expect(sqlite.prepare("SELECT submission_id, status, awarded_xp FROM submission_outcomes WHERE outcome_key = 'verified_run' ORDER BY submission_id").all()).toEqual([
      { submission_id: "submission.conflict", status: "conflict", awarded_xp: 0 },
      { submission_id: "submission.exact", status: "reused", awarded_xp: 0 },
      { submission_id: "submission.first", status: "created", awarded_xp: 236 },
      { submission_id: "submission.other", status: "created", awarded_xp: 236 },
      { submission_id: "submission.reencoded", status: "reused", awarded_xp: 0 },
    ]);
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.conflict'").get()).toEqual({ status: "ocr_review_required" });
    expect(JSON.parse((sqlite.prepare("SELECT details_json FROM submission_outcomes WHERE submission_id = 'submission.conflict'").get() as { details_json: string }).details_json)).toMatchObject({ conflictFields: ["difficulty"] });

    const firstEvidenceKey = `uploads/submissions/submission.first/${"a".repeat(64)}.png`;
    sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, object_key, upload_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("attachment.first", "submission.first", "portal", "upload.first", "image/png", firstEvidenceKey, "stored", now + 1);
    const publicServices = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, 0.02, "https://evidence.owbastion.codes");
    const publicOutcomes = await Promise.all([
      "submission.first",
      "submission.exact",
      "submission.conflict",
    ].map((submissionId) => publicServices.getSubmission({ submissionId }, {} as never)));
    expect(publicOutcomes.map((submission) => submission.verifiedRunOutcome)).toEqual([
      { status: "created", awardedXp: 236 },
      { status: "reused", awardedXp: 0 },
      undefined,
    ]);
    expect(publicOutcomes[2].reason).toBeUndefined();
    expect(JSON.stringify(publicOutcomes)).not.toMatch(/conflicting_run_code_evidence|conflictFields|verifiedRunId|1234-5678-9012/);

    const sessionToken = "mastery-player-session";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("mastery-player-session", "attempt.player.one", "group.player.one", "member.player.one", "test", await requestHash(sessionToken), now + 60_000, now);
    const playerConflict = await publicServices.getPlayerSubmission({ submissionId: "submission.conflict" }, sessionToken);
    expect(playerConflict.verifiedRunOutcome).toBeUndefined();
    expect(playerConflict.reason).toBeUndefined();
    // Only a player's own request is described to them as a submitted request.
    sqlite.prepare("UPDATE submissions SET status = 'resubmission_required', ocr_fail_count = 1 WHERE id = 'submission.exact'").run();
    await publicServices.requestManualReview({ submissionId: "submission.exact" }, sessionToken);
    expect((await publicServices.getPlayerSubmission({ submissionId: "submission.exact" }, sessionToken)).reason).toBe("已提交处理申请，请稍后查看结果。");
    const player = await publicServices.getCurrentPlayer({ sessionToken });
    const currentConflict = player?.recentSubmissions.find((submission) => submission.submissionId === "submission.conflict");
    expect(currentConflict?.status).toBe("needs_review");
    expect(currentConflict?.verifiedRunOutcome).toBeUndefined();
    expect(currentConflict?.reason).toBeUndefined();

    const adminConflict = await publicServices.getAdminSubmission({ submissionId: "submission.conflict" }, {} as never);
    expect(adminConflict.verifiedRunOutcome).toMatchObject({
      status: "conflict",
      reason: "conflicting_run_code_evidence",
      conflictFields: ["difficulty"],
      verifiedRunId: expect.any(String),
    });

    const verifiedRunId = adminConflict.verifiedRunOutcome?.verifiedRunId;
    if (!verifiedRunId) throw new Error("missing mastery conflict target");
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const listed = await publicServices.listAdminVerifiedRuns({ playerAccountId: "player.one", mapId: "map.mastery", difficulty: "困难", acceptanceSource: "submission_automatic", status: "active", matchCode: "1234-5678-9012", page: 1, pageSize: 20 }, maintainer);
    expect(listed).toMatchObject({ total: 1, items: [{ runId: verifiedRunId, conflictCount: 1, playerAccountId: "player.one", mapName: "地图 map.mastery", matchCode: "1234-5678-9012" }] });
    const pendingConflicts = await publicServices.listAdminVerifiedRuns({ unresolvedConflictsOnly: true, page: 1, pageSize: 20 }, maintainer);
    expect(pendingConflicts).toMatchObject({ total: 1, items: [{ runId: verifiedRunId }] });

    const inspected = await publicServices.getAdminVerifiedRun({ verifiedRunId }, maintainer);
    expect(inspected).toMatchObject({
      run: { sourceSubmissionId: "submission.first", acceptanceSource: "submission_automatic", xpRuleVersion: "v2", xpInputSnapshot: { ruleVersion: "v2" } },
      projection: { mapId: "map.mastery", verifiedRunCount: 1 },
      sourceSubmission: { submissionId: "submission.first", evidenceUrl: null },
      lifecycle: [{ transition: "accepted", actorType: "service" }],
      conflicts: [{ submissionId: "submission.conflict", conflictFields: ["difficulty"], facts: { mapName: "地图 map.mastery", difficulty: "传奇", matchCode: "1234-5678-9012" }, resolution: null }],
    });
    expect((await publicServices.getAdminSubmission({ submissionId: "submission.first" })).evidenceUrl).toBe(`https://evidence.owbastion.codes/${firstEvidenceKey}`);

    const invalidated = await publicServices.resolveAdminVerifiedRunConflict({ verifiedRunId, submissionId: "submission.conflict", action: "invalidate_existing", reason: "以修正截图为准" }, maintainer, "mastery-conflict-invalidate");
    expect(invalidated).toMatchObject({ action: "invalidate_existing", run: { status: "invalidated", invalidationReason: "以修正截图为准" }, projection: { totalXp: 0, verifiedRunCount: 0 } });
    expect(await publicServices.listAdminVerifiedRuns({ unresolvedConflictsOnly: true, page: 1, pageSize: 20 }, maintainer)).toMatchObject({ total: 0, items: [] });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.first' AND outcome_key = 'verified_run'").get()).toEqual({ status: "invalidated" });
    expect(await publicServices.resolveAdminVerifiedRunConflict({ verifiedRunId, submissionId: "submission.conflict", action: "invalidate_existing", reason: "以修正截图为准" }, maintainer, "mastery-conflict-invalidate")).toEqual(invalidated);
    expect(sqlite.prepare("SELECT action, actor_type, actor_id, reason FROM mastery_run_conflict_resolutions").all()).toEqual([{ action: "invalidate_existing", actor_type: "user", actor_id: "admin", reason: "以修正截图为准" }]);
    expect(sqlite.prepare("SELECT operation, COUNT(*) AS count FROM audit_events WHERE entity_type = 'verified_run' GROUP BY operation ORDER BY operation").all()).toEqual([
      { operation: "mastery_run.conflict.resolve", count: 1 },
      { operation: "mastery_run.invalidate", count: 1 },
    ]);

    const restored = await publicServices.transitionAdminVerifiedRun({ verifiedRunId, action: "restore", reason: "保留原始记录" }, maintainer, "mastery-run-restore");
    expect(restored).toMatchObject({ run: { status: "active", invalidatedAt: null, invalidationReason: null }, projection: { verifiedRunCount: 1 } });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.first' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT transition, actor_type, actor_id, reason FROM mastery_run_lifecycle_events WHERE mastery_run_id = ? ORDER BY created_at, rowid").all(verifiedRunId)).toEqual([
      { transition: "accepted", actor_type: "service", actor_id: "submission_automatic", reason: null },
      { transition: "invalidated", actor_type: "user", actor_id: "admin", reason: "以修正截图为准" },
      { transition: "restored", actor_type: "user", actor_id: "admin", reason: "保留原始记录" },
    ]);
  });

  it("keeps title-only administration separate from mastery and blocks acquisition after an admin revoke", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedTitle(sqlite, "CONQUEROR");
    sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.mastery', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.mastery" });
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.combined", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.legacy", "binding.one", "Tester");

    let ocr = masteryOcr({ layoutVersion: "1280x720-v6" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.combined", objectKey: "evidence/submission.combined.png", attempt: 1 });
      const combined = sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.combined'").get() as { status: string; grant_id: string | null };
      expect(combined.status).toBe("approved");
      expect(combined.grant_id).not.toBeNull();
      expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = 'submission.combined' ORDER BY outcome_type").all()).toEqual([
        { outcome_type: "challenge", status: "created" },
        { outcome_type: "title_grant", status: "created" },
        { outcome_type: "verified_run", status: "created" },
      ]);

      await services.revokeAdminTitleGrant({ grantId: combined.grant_id!, reason: "称号专项修复" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "title-only-revoke");
      expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.combined'").get()).toEqual({ status: "active" });

      ocr = masteryOcr({ matchCode: null, layoutVersion: "1280x720-v6" });
      await services.processOcrJob({ submissionId: "submission.legacy", objectKey: "evidence/submission.legacy.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy'").get()).toEqual({ status: "resubmission_required", grant_id: null });
    expect(sqlite.prepare("SELECT status, awarded_xp FROM submission_outcomes WHERE submission_id = 'submission.legacy' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible", awarded_xp: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.legacy'").get()).toEqual({ count: 0 });
    expect((await createPlatformServices(database).getSubmission({ submissionId: "submission.legacy" }, {} as never)).verifiedRunOutcome).toEqual({ status: "ineligible", awardedXp: 0 });
  });

  it("invalidates and restores the source run exactly once through the existing spot-check and OCR-retry path", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.lifecycle", "binding.one", "Tester", true);
    const queued: unknown[] = [];
    const queue = { send: async (message: unknown) => { queued.push(message); } } as Queue;
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const ocr = masteryOcr({ layoutVersion: "1280x720-v6" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue, undefined, undefined, 1, 1, localVerifiedRunEvidenceCompatibility);
      await services.processOcrJob({ submissionId: "submission.lifecycle", objectKey: "evidence/submission.lifecycle.png", attempt: 1 });
      const revoked = await services.resolveAdminSubmissionSpotCheck({ submissionId: "submission.lifecycle", decision: "revoked", reason: "证据无效" }, auth, "spot-check-revoke");
      expect(revoked).toMatchObject({ grantId: null, verifiedRunId: expect.any(String), status: "revoked" });
      expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.lifecycle'").get()).toEqual({ status: "invalidated" });
      expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.lifecycle' AND outcome_key = 'verified_run'").get()).toEqual({ status: "invalidated" });

      await services.requestAdminOcr({ submissionId: "submission.lifecycle" }, auth, "ocr-revalidate", "request-revalidate");
      await services.processOcrJob({ ...(queued[0] as { submissionId: string; objectKey: string; manual: boolean; requestId: string }), attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.lifecycle'").get()).toEqual({ status: "active" });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.lifecycle' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT transition, COUNT(*) AS count FROM mastery_run_lifecycle_events GROUP BY transition ORDER BY transition").all()).toEqual([
      { transition: "accepted", count: 1 },
      { transition: "invalidated", count: 1 },
      { transition: "restored", count: 1 },
    ]);
    // The retry re-decides the already-reviewed Submission instead of leaving it waiting for OCR.
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.lifecycle'").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.lifecycle'").get()).toEqual({ count: 2 });
  });
});
