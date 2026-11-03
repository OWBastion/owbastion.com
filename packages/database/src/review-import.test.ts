import { describe, expect, it } from "vitest";
import { adminReviewListResponseSchema } from "@owbastion/contracts";
import { createTestD1 } from "../test/d1";
import { createPlatformServices } from "./index";
import { auth, createD1, installSchema } from "./review-test-harness";

describe("survey review import", () => {
  it("imports survey ratings as anonymous accountless event reviews, including removed events", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES
        ('event.live', '足力健', 'test', 'common', 'Test', '1', 'implemented', 1, 1),
        ('event.gone', '有点松弛', 'test', 'common', 'Test', '1', 'removed', 1, 1);
    `);
    const services = createPlatformServices(database);
    const csv = [
      "ID,提交时间,提交人,评分事件,评分,评论",
      "20260403068,2026/04/03,Teakowa,足力健,5,夯",
      "20260403050,2026/04/03,Teakowa,足力健,4,人上人",
      "20260630200,2026/06/30,访客 1,足力健,1,",
      "20260403058,2026/04/03,Teakowa,有点松弛,5,回来吧",
    ].join("\n");
    const input = { contractVersion: "1" as const, fileName: "survey.csv", csv };

    await expect(services.previewAdminReviewImport(input, auth("admin"))).resolves.toEqual({ contractVersion: "1", sourceHash: expect.any(String), rowCount: 4, importCount: 4, errors: [] });
    await expect(services.previewAdminReviewImport({ ...input, csv: csv.replace("有点松弛,5", "不存在,5") }, auth("admin"))).resolves.toMatchObject({ importCount: 0, errors: [{ row: 0, message: "未找到事件：不存在" }] });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviews").get()).toEqual({ count: 0 });

    await expect(services.importAdminReviews(input, auth("admin"), "import-1")).resolves.toEqual({ contractVersion: "1", importedCount: 4 });
    await expect(services.importAdminReviews(input, auth("admin"), "import-1")).resolves.toEqual({ contractVersion: "1", importedCount: 4 });
    await expect(services.previewAdminReviewImport({ ...input, csv: csv.replace("20260403050", "20260403068") }, auth("admin"))).resolves.toMatchObject({ importCount: 0, errors: [{ row: 3, message: "ID 重复" }] });
    await expect(services.importAdminReviews(input, auth("admin"), "import-2")).rejects.toThrow("REVIEW_IMPORT_DUPLICATE");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviews WHERE player_account_id IS NULL AND anonymous = 1").get()).toEqual({ count: 4 });

    await expect(services.getReviewSummary({ targetType: "event", targetId: "event.live" })).resolves.toMatchObject({ reviewCount: 3, averageRating: 3.33, ratingDistribution: { 1: 1, 4: 1, 5: 1 } });
    await expect(services.getReviewSummary({ targetType: "event", targetId: "event.gone" })).resolves.toMatchObject({ reviewCount: 1, averageRating: 5 });
    const comments = await services.listPublicReviewComments({ targetType: "event", targetId: "event.gone", page: 1, pageSize: 20 });
    expect(comments.items).toEqual([{ rating: 5, comment: "回来吧", author: null, createdAt: Date.UTC(2026, 3, 2, 16) }]);

    const list = await services.listAdminReviews({ targetId: "event.live", page: 1, pageSize: 20 }, auth("admin"));
    expect(adminReviewListResponseSchema.parse(list).items).toEqual(expect.arrayContaining([expect.objectContaining({ playerAccountId: null, playerName: null, sourceLabel: "Teakowa", anonymous: true, rating: 5 }), expect.objectContaining({ sourceLabel: "Teakowa", rating: 4 })]));
    await services.hideReviewComment({ reviewId: list.items.find((item) => item.comment === "夯")!.reviewId }, auth("admin"), "hide-imported");
    await expect(services.upsertReview({ targetType: "event", targetId: "event.gone", rating: 5 }, auth("1"), "rate-removed")).rejects.toThrow();
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.review.import'").get()).toEqual({ count: 1 });
  });


  it("reports unusable import files in the preview and handles large and ambiguous event sets", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const insertEvent = sqlite.prepare("INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES (?, ?, 'test', 'common', 'Test', '1', 'implemented', 1, 1)");
    for (let index = 0; index < 150; index += 1) insertEvent.run(`event.${index}`, `事件${index}`);
    insertEvent.run("event.twin-a", "重名");
    insertEvent.run("event.twin-b", "重名");
    const services = createPlatformServices(database);
    const header = "ID,提交时间,提交人,评分事件,评分,评论";
    const preview = (csv: string) => services.previewAdminReviewImport({ contractVersion: "1", fileName: "survey.csv", csv }, auth("admin"));

    await expect(preview(`${header}\n1,2026/04/03,访客,"未闭合,5,`)).resolves.toMatchObject({ importCount: 0, errors: [{ row: 1, message: "CSV 引号未闭合" }] });
    const ambiguous = await preview(`${header}\n1,2026/04/03,访客,重名,5,`);
    expect(ambiguous).toMatchObject({ importCount: 0, errors: [{ message: expect.stringContaining("事件名称不唯一：重名") }] });
    expect(ambiguous.errors[0]!.message).toEqual(expect.stringContaining("event.twin-a（implemented，版本 1）"));
    expect(ambiguous.errors[0]!.message).toEqual(expect.stringContaining("event.twin-b"));
    await expect(preview(`${header},事件ID\n1,2026/04/03,访客,重名,5,,event.twin-b`)).resolves.toMatchObject({ importCount: 1, errors: [] });
    await expect(preview(`${header},事件ID\n1,2026/04/03,访客,重名,5,,event.missing`)).resolves.toMatchObject({ importCount: 0, errors: [{ message: "未找到事件ID：event.missing" }] });
    await expect(preview("ID,评分\n1,5")).resolves.toMatchObject({ importCount: 0, errors: [{ row: 1 }] });

    const many = `${header}\n${Array.from({ length: 150 }, (_, index) => `${index + 1},2026/04/03,访客,事件${index},4,`).join("\n")}`;
    await expect(preview(many)).resolves.toMatchObject({ rowCount: 150, importCount: 150, errors: [] });
    await services.importAdminReviews({ contractVersion: "1", fileName: "survey.csv", csv: many }, auth("admin"), "many");
    await expect(preview(many)).resolves.toMatchObject({ importCount: 0, errors: [{ row: 0, message: "该文件已导入" }] });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviews").get()).toEqual({ count: 150 });
  });


  it("writes the import, its idempotency record and its audit event together", async () => {
    const { database, sqlite } = createTestD1({ foreignKeys: true, batchMode: "transactional" });
    installSchema(sqlite);
    sqlite.exec("INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES ('event.live', '足力健', 'test', 'common', 'Test', '1', 'implemented', 1, 1);");
    const services = createPlatformServices(database);
    const input = { contractVersion: "1" as const, fileName: "survey.csv", csv: "ID,提交时间,提交人,评分事件,评分,评论\n1,2026/04/03,访客,足力健,5,夯" };
    sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'audit down'); END;");
    await expect(services.importAdminReviews(input, auth("admin"), "atomic")).rejects.toThrow();
    expect(sqlite.prepare("SELECT (SELECT COUNT(*) FROM reviews) AS reviews, (SELECT COUNT(*) FROM review_imports) AS imports, (SELECT COUNT(*) FROM idempotency_keys) AS keys").get()).toEqual({ reviews: 0, imports: 0, keys: 0 });
    sqlite.exec("DROP TRIGGER fail_audit");
    await expect(services.importAdminReviews(input, auth("admin"), "atomic")).resolves.toEqual({ contractVersion: "1", importedCount: 1 });
  });

  it("imports a row with an event ID into that event even when the name is shared", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES
        ('event.early', '我独自闯关', 'test', 'common', 'Test', '1', 'removed', 1, 1),
        ('event.late', '我独自闯关', 'test', 'common', 'Test', '2', 'removed', 2, 2),
        ('event.renamed', '任务：钢铁防线', 'test', 'common', 'Test', '1', 'implemented', 1, 1);
    `);
    const services = createPlatformServices(database);
    const csv = ["ID,提交时间,提交人,评分事件,评分,评论,事件ID", "1,2026/04/03,Teakowa,我独自闯关,5,牢大,event.early", "2,2026/04/03,Teakowa,任务：钢铁防线,5,夯,"].join("\n");
    await services.importAdminReviews({ contractVersion: "1", fileName: "survey.csv", csv }, auth("admin"), "pinned");
    expect(sqlite.prepare("SELECT target_id, source_id FROM reviews ORDER BY source_id").all()).toEqual([{ target_id: "event.early", source_id: 1 }, { target_id: "event.renamed", source_id: 2 }]);
  });
});
