import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, installSchema } from "./ocr-test-harness";

const fixture = () => {
  const harness = createD1();
  installSchema(harness.sqlite);
  harness.sqlite.exec("CREATE INDEX ocr_results_submission_idx ON ocr_results(submission_id, created_at);");
  let ocrRows = 0;
  let reviewRows = 0;
  const countRows = (sql: string, length: number) => {
    if (/\bocr_results\b/.test(sql)) ocrRows += length;
    if (/\bsubmission_reviews\b/.test(sql)) reviewRows += length;
  };
  const prepare = harness.database.prepare.bind(harness.database);
  harness.database.prepare = (sql: string) => {
    const statement = prepare(sql);
    const all = statement.all.bind(statement);
    const raw = statement.raw.bind(statement);
    statement.all = async <T>() => {
      const result = await all<T>();
      countRows(sql, result.results.length);
      return result;
    };
    statement.raw = async (...args) => {
      const result = await raw(...args);
      countRows(sql, result.length);
      return result;
    };
    return statement;
  };
  harness.sqlite.exec(`
    INSERT INTO player_accounts (id,player_id,player_name,normalized_player_name,created_at,updated_at)
      VALUES ('player-history', '1001', 'History', 'history', 1, 1);
    INSERT INTO submissions (id,player_account_id,status,challenge_type,map_name,source_provider,source_conversation_id,source_message_id,created_at,updated_at)
      VALUES ('submission-a', 'player-history', 'ocr_review_required', 'unknown', 'Alpha', 'portal', 'history', 'message-a', 1, 30),
             ('submission-b', 'player-history', 'approved', 'unknown', 'Beta', 'portal', 'history', 'message-b', 1, 20),
             ('submission-empty', 'player-history', 'ocr_pending', 'unknown', '', 'portal', 'history', 'message-empty', 1, 10);
  `);
  return {
    ...harness,
    services: createPlatformServices(harness.database),
    resetMetrics: () => { ocrRows = 0; reviewRows = 0; harness.resetPreparedStatementCount(); },
    metrics: () => ({ ocrRows, reviewRows, statements: harness.preparedStatementCount() }),
  };
};

const seedHistory = (sqlite: ReturnType<typeof createD1>["sqlite"], count: number) => {
  const ocr = sqlite.prepare("INSERT INTO ocr_results (id,submission_id,attempt,status,response_json,match_json,error_code,created_at) VALUES (?, ?, ?, 'failed', '{\"old\":true}', '{}', 'OLD_ERROR', ?)");
  const review = sqlite.prepare("INSERT INTO submission_reviews (id,submission_id,decision,reason,reviewer,created_at) VALUES (?, ?, 'rejected', 'obsolete', 'admin.old', ?)");
  for (const submissionId of ["submission-a", "submission-b"]) {
    for (let index = 0; index < count; index += 1) {
      ocr.run(`${submissionId}.old-ocr.${index}`, submissionId, index + 1, index + 1);
      review.run(`${submissionId}.old-review.${index}`, submissionId, index + 1);
    }
  }
};

const seedLatest = (sqlite: ReturnType<typeof createD1>["sqlite"]) => {
  sqlite.exec(`
    INSERT INTO ocr_results (id,submission_id,attempt,status,response_json,match_json,created_at) VALUES
      ('ocr-latest-a', 'submission-a', 7, 'review_required', '{"data":{"map_name":"Alpha"},"fields":{"map_name":{"confidence":0.5}}}', '{"outcome":"review","candidates":["candidate-a"]}', 10000),
      ('ocr-latest-b', 'submission-b', 3, 'matched', '{"data":{"map_name":"Beta"}}', '{"outcome":"automatic"}', 10000);
    INSERT INTO ocr_accuracy_feedback (id,submission_id,ocr_result_id,accuracy,marked_by,marked_by_type,created_at,updated_at)
      VALUES ('accuracy-latest', 'submission-a', 'ocr-latest-a', 'inaccurate', 'admin.latest', 'maintainer', 10000, 10000);
    INSERT INTO submission_reviews (id,submission_id,decision,reason,reviewer,created_at) VALUES
      ('z-earlier-tie', 'submission-a', 'approved', 'superseded', 'admin.old', 10000),
      ('a-later-tie', 'submission-a', 'resubmission_required', NULL, 'admin.latest', 10000),
      ('review-latest-b', 'submission-b', 'approved', NULL, 'system:ocr', 10000);
  `);
};

describe("submission detail history reads", () => {
  it("preserves indexed OCR and review tie selection on single- and multiple-submission pages", async () => {
    const { sqlite, services, resetMetrics, metrics } = fixture();
    seedHistory(sqlite, 50);
    seedLatest(sqlite);
    sqlite.exec(`
      INSERT INTO ocr_results (id,submission_id,attempt,status,response_json,match_json,created_at)
        VALUES ('ocr-tied-a', 'submission-a', 8, 'failed', '{"tied":true}', '{"outcome":"resubmit"}', 10000);
    `);
    for (const pageSize of [1, 3]) {
      const submissionIds = pageSize === 1 ? ["submission-a"] : ["submission-a", "submission-b", "submission-empty"];
      const placeholders = submissionIds.map(() => "?").join(",");
      const formerOcrRows = sqlite.prepare(`SELECT id,submission_id FROM ocr_results WHERE submission_id IN (${placeholders}) ORDER BY created_at DESC`)
        .all(...submissionIds);
      const formerReviews = sqlite.prepare(`SELECT submission_id,decision,reason,reviewer,created_at FROM submission_reviews WHERE submission_id IN (${placeholders}) ORDER BY created_at, rowid`)
        .all(...submissionIds);
      const formerLatestReview = new Map(formerReviews.map((review) => [review.submission_id, review]));
      expect(formerOcrRows.find((ocr) => ocr.submission_id === "submission-a")!.id).toBe("ocr-tied-a");
      resetMetrics();
      const result = await services.listAdminSubmissions({ page: 1, pageSize });
      for (const submissionId of submissionIds.filter((id) => id !== "submission-empty")) {
        const item = result.items.find((item) => item.submissionId === submissionId)!;
        expect(item.ocrResultId).toBe(formerOcrRows.find((ocr) => ocr.submission_id === submissionId)!.id);
        const previous = formerLatestReview.get(submissionId)!;
        expect(item.review).toEqual({ decision: previous.decision, reason: previous.reason, automatic: String(previous.reviewer).startsWith("system:"), reviewedAt: previous.created_at });
      }
      expect(metrics().ocrRows).toBe(pageSize === 1 ? 1 : 2);
      expect(metrics().reviewRows).toBe(pageSize === 1 ? 1 : 2);
    }
    const detail = await services.getAdminSubmission({ submissionId: "submission-a" }, { actorType: "user", subject: "admin.latest", provider: "test", roles: ["maintainer"] });
    expect(detail).toMatchObject({ ocrResultId: "ocr-tied-a", ocrAttempt: 8, ocrStatus: "failed", ocr: { tied: true }, match: { outcome: "resubmit" }, ocrAccuracy: null });
  });

  it("retains the latest OCR payload, accuracy and review, including insertion order for tied reviews", async () => {
    const { sqlite, services } = fixture();
    seedHistory(sqlite, 3);
    seedLatest(sqlite);
    const result = await services.listAdminSubmissions({ page: 1, pageSize: 3 });
    expect(result).toMatchObject({ total: 3, hasMore: false });
    expect(result.items[0]).toMatchObject({
      submissionId: "submission-a", ocrStatus: "review_required", ocrAttempt: 7, ocrResultId: "ocr-latest-a",
      ocrErrorCode: null, ocrAccuracy: "inaccurate",
      ocr: { data: { map_name: "Alpha" }, fields: { map_name: { confidence: 0.5 } } },
      match: { outcome: "review", candidates: ["candidate-a"] },
      review: { decision: "resubmission_required", automatic: false, reason: null, reviewedAt: 10000 },
    });
    expect(result.items[1]).toMatchObject({
      submissionId: "submission-b", ocrResultId: "ocr-latest-b", ocrStatus: "matched", ocrAccuracy: null,
      ocr: { data: { map_name: "Beta" } }, match: { outcome: "automatic" },
      review: { decision: "approved", automatic: true, reason: null, reviewedAt: 10000 },
    });
    expect(result.items[2]).toMatchObject({ submissionId: "submission-empty", ocrStatus: "pending", ocrAttempt: null, ocrResultId: null, ocr: null, match: null, review: null });
  });

  it("keeps detail rows transferred bounded as OCR and review histories grow", async () => {
    const measure = async (historyCount: number) => {
      const harness = fixture();
      seedHistory(harness.sqlite, historyCount);
      seedLatest(harness.sqlite);
      harness.resetMetrics();
      const result = await harness.services.listAdminSubmissions({ page: 1, pageSize: 3 });
      return { result, metrics: harness.metrics() };
    };
    const small = await measure(50);
    const large = await measure(200);
    expect(large.result).toEqual(small.result);
    expect(large.metrics).toEqual(small.metrics);
    expect(large.metrics.ocrRows).toBe(2);
    expect(large.metrics.reviewRows).toBe(2);
  });

  it("treats a malformed latest OCR payload as missing instead of failing the page", async () => {
    const { sqlite, services } = fixture();
    sqlite.exec(`
      INSERT INTO ocr_results (id,submission_id,attempt,status,response_json,match_json,error_code,created_at) VALUES
        ('ocr-bad-a', 'submission-a', 9, 'error', 'not-json', 'also-not-json', 'MALFORMED', 99999);
    `);
    const result = await services.listAdminSubmissions({ page: 1, pageSize: 3 });
    const item = result.items.find((entry) => entry.submissionId === "submission-a")!;
    expect(item).toMatchObject({ ocrStatus: "error", ocrResultId: "ocr-bad-a", ocr: null, match: null });
    const detail = await services.getAdminSubmission({ submissionId: "submission-a" }, { actorType: "user", subject: "admin.latest", provider: "test", roles: ["maintainer"] });
    expect(detail).toMatchObject({ ocrResultId: "ocr-bad-a", ocr: null });
  });

  it("does not load another submission's history for an empty result page", async () => {
    const { sqlite, services, resetMetrics, metrics } = fixture();
    seedHistory(sqlite, 50);
    seedLatest(sqlite);
    resetMetrics();
    expect(await services.listAdminSubmissions({ page: 1, pageSize: 3, statuses: ["rejected"] })).toMatchObject({ items: [], total: 0, hasMore: false });
    expect(metrics()).toMatchObject({ ocrRows: 0, reviewRows: 0 });
  });
});
