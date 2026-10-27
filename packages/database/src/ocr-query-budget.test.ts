import { seedScaledCandidates, seedSubmissionPlayer, seedOcrPendingSubmission, seedReviewableSubmission, nonMatchingOcrResponse, matchingOcrResponse } from "../test/ocr-catalog-fixtures";
import { deliverOcrFixture } from "./ocr-test-harness";
import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, fakeEvidenceBucket, installSchema, seedMap } from "./ocr-test-harness";

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
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.job", objectKey: "evidence/submission.job.png", attempt: 1, requestId: "request.job" });
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
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.review-routed", objectKey: "evidence/submission.review-routed.png", attempt: 1, requestId: "request.review-routed" });
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
