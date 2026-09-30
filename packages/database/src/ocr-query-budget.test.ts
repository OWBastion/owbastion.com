import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, createOcrDifficultyResponse, fakeEvidenceBucket, installSchema, seedMap, seedRevisionAssignment, seedTitle } from "./ocr-test-harness";

const now = Date.now();

/**
 * N distinct, automatic, non-matching map-achievement candidates on one map. Each
 * candidate is a real Title + Challenge + revision assignment — the same shape
 * `fetchAllAutoMatchChallenges` and `prepareCanonicalAutoMatchChallenges` scan in
 * production, just scaled up to stand in for a growing catalog.
 */
const seedScaledCandidates = (sqlite: DatabaseSync, mapId: string, count: number) => {
  for (let i = 0; i < count; i += 1) {
    const titleKey = `SCALE_TITLE_${i}`;
    const challengeId = `challenge.scale.${mapId}.${i}`;
    seedTitle(sqlite, titleKey);
    sqlite.prepare(
      "INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, 'difficulty_completion', ?, '困难', '完成通关', '上传截图', 'automatic', ?, '2026.07.15', 'active', '2026.07.15', ?, ?)",
    ).run(challengeId, mapId, `候选 ${i}`, titleKey, now, now);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "map_challenge", challengeId });
  }
};

const seedSubmissionPlayer = (sqlite: DatabaseSync, playerId: string, bindingId: string) => {
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, 'Tester', 'tester', 0, 'active', ?, ?)").run(playerId, playerId, now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', ?, ?, 'active', ?)").run(bindingId, `identity.${playerId}`, playerId, `group.${playerId}`, `member.${playerId}`, now);
};

const seedOcrPendingSubmission = (sqlite: DatabaseSync, submissionId: string, bindingId: string) => {
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, `message.${submissionId}`, now, now);
  sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'portal', ?, 'image/png', 1, 'hash', ?, 'stored', ?)").run(`attachment.${submissionId}`, submissionId, `external.${submissionId}`, `evidence/${submissionId}.png`, now);
};

const seedReviewableSubmission = (sqlite: DatabaseSync, submissionId: string, bindingId: string, ocrResponse: unknown) => {
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, `message.${submissionId}`, now, now);
  sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES (?, ?, 1, 'review_required', ?, '{}', ?)").run(`ocr.${submissionId}`, submissionId, JSON.stringify(ocrResponse), now);
};

// Evidence that recognizes the real map (so the full seeded candidate set is still
// scanned) but never satisfies a required-difficulty condition, so every scale keeps
// the same "review"/"resubmit" outcome and never crosses into "automatic" — the one
// path that materializes `challenges` rows.
const nonMatchingOcrResponse = () => createOcrDifficultyResponse("地图 map.scale", "简单");

const matchingOcrResponse = () => createOcrDifficultyResponse("地图 map.scale", "困难");

describe("OCR auto-match query budgets (issue #241)", () => {
  const buildFixture = (candidateCount: number) => {
    const { database, sqlite, preparedStatementCount, resetPreparedStatementCount } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.scale");
    seedScaledCandidates(sqlite, "map.scale", candidateCount);
    return { database, sqlite, preparedStatementCount, resetPreparedStatementCount };
  };

  it("keeps processOcrJob's D1 statement count flat as candidates grow from 10 to 100", async () => {
    const measure = async (candidateCount: number) => {
      const { database, sqlite, preparedStatementCount, resetPreparedStatementCount } = buildFixture(candidateCount);
      seedSubmissionPlayer(sqlite, "player.job", "binding.job");
      seedOcrPendingSubmission(sqlite, "submission.job", "binding.job");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(nonMatchingOcrResponse()), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        resetPreparedStatementCount();
        await services.processOcrJob({ submissionId: "submission.job", objectKey: "evidence/submission.job.png", attempt: 1, requestId: "request.job" });
        const matchJson = (sqlite.prepare("SELECT match_json FROM ocr_results WHERE submission_id = 'submission.job'").get() as { match_json: string }).match_json;
        return { count: preparedStatementCount(), matchJson: JSON.parse(matchJson) as { outcome: string; candidates: unknown[] } };
      } finally {
        vi.unstubAllGlobals();
      }
    };

    const small = await measure(10);
    const large = await measure(100);
    expect(large.count).toBeLessThanOrEqual(small.count + 5);
    expect(small.matchJson).toMatchObject({ mode: "canonical_conditions", outcome: "review" });
    expect(small.matchJson.candidates).toHaveLength(10);
    expect(large.matchJson.candidates).toHaveLength(100);
    expect(small.matchJson.candidates[0]).toMatchObject({
      challengeId: "challenge.scale.map.scale.0",
      challengeType: "difficulty_completion",
      targetMapName: "地图 map.scale",
      targetDifficulty: "困难",
      titleName: "候选 0",
      matched: false,
      conditionsSupported: true,
    });
    expect(large.matchJson.candidates.slice(0, 10)).toEqual(small.matchJson.candidates);
  });

  it("keeps previewSubmissionReview's D1 statement count flat as candidates grow from 10 to 100", async () => {
    const measure = async (candidateCount: number) => {
      const { database, sqlite, preparedStatementCount, resetPreparedStatementCount } = buildFixture(candidateCount);
      seedSubmissionPlayer(sqlite, "player.preview", "binding.preview");
      seedReviewableSubmission(sqlite, "submission.preview", "binding.preview", nonMatchingOcrResponse());
      const services = createPlatformServices(database);
      resetPreparedStatementCount();
      await services.previewSubmissionReview({ submissionId: "submission.preview", fieldCorrections: [], confirmedChallengeIds: [] }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
      return preparedStatementCount();
    };

    const small = await measure(10);
    const large = await measure(100);
    expect(large).toBeLessThanOrEqual(small + 5);
  });

  it("keeps preview query count flat when every scaled candidate matches and completion chains are planned", async () => {
    const measure = async (candidateCount: number) => {
      const { database, sqlite, preparedStatementCount, resetPreparedStatementCount } = buildFixture(candidateCount);
      seedSubmissionPlayer(sqlite, "player.preview.matches", "binding.preview.matches");
      seedReviewableSubmission(sqlite, "submission.preview.matches", "binding.preview.matches", matchingOcrResponse());
      const services = createPlatformServices(database);
      resetPreparedStatementCount();
      const preview = await services.previewSubmissionReview({ submissionId: "submission.preview.matches", fieldCorrections: [], confirmedChallengeIds: [] }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
      return { count: preparedStatementCount(), preview };
    };

    const small = await measure(10);
    const large = await measure(100);
    expect(large.count).toBeLessThanOrEqual(small.count + 5);
    expect(small.preview.evidenceOutcome).toBe("automatic");
    expect(large.preview.evidenceOutcome).toBe("automatic");
    expect(small.preview.completions).toHaveLength(10);
    expect(large.preview.completions).toHaveLength(100);
  });

  it("writes no `challenges` rows for a rejected/review-routed OCR outcome even as candidates grow", async () => {
    const { database, sqlite } = buildFixture(100);
    seedSubmissionPlayer(sqlite, "player.review-routed", "binding.review-routed");
    seedOcrPendingSubmission(sqlite, "submission.review-routed", "binding.review-routed");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(nonMatchingOcrResponse()), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
      await services.processOcrJob({ submissionId: "submission.review-routed", objectKey: "evidence/submission.review-routed.png", attempt: 1, requestId: "request.review-routed" });
    } finally {
      vi.unstubAllGlobals();
    }

    const submission = sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.review-routed'").get() as { status: string };
    expect(["ocr_review_required", "resubmission_required"]).toContain(submission.status);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM challenges").get() as { count: number }).count).toBe(0);
  });

  it("writes no `challenges` rows from a read-only preview even when candidates match and would need materializing", async () => {
    const { database, sqlite } = buildFixture(10);
    seedSubmissionPlayer(sqlite, "player.preview-write", "binding.preview-write");
    seedReviewableSubmission(sqlite, "submission.preview-write", "binding.preview-write", matchingOcrResponse());
    const services = createPlatformServices(database);
    const preview = await services.previewSubmissionReview({ submissionId: "submission.preview-write", fieldCorrections: [], confirmedChallengeIds: [] }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
    expect(preview.candidates.some((candidate) => candidate.evidence === "matched")).toBe(true);
    expect((sqlite.prepare("SELECT COUNT(*) AS count FROM challenges").get() as { count: number }).count).toBe(0);
  });
});
