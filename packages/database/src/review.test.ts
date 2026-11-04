import { describe, expect, it } from "vitest";
import { adminReviewDetailResponseSchema, adminReviewListResponseSchema, playerReviewResponseSchema, publicReviewCommentPageSchema, publicReviewSummaryResponseSchema } from "@owbastion/contracts";
import { createPlatformServices } from "./index";
import { auth, createD1, installSchema } from "./review-test-harness";

const playerReviewView = (review: Awaited<ReturnType<ReturnType<typeof createPlatformServices>["getPlayerReview"]>>) => review && {
  reviewId: review.reviewId,
  targetType: review.targetType,
  targetId: review.targetId,
  gameplayRevisionId: review.gameplayRevisionId,
  rating: review.rating,
  comment: review.comment,
  anonymous: review.anonymous,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
};

describe("review persistence and domain rules", () => {
  it("accepts active event/map targets and aggregates valid ratings", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1), ('account-2', '2', 'Two', 'two', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1);
      INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES ('event.test', 'Test event', 'test', 'common', 'Test', '1', 'implemented', 1, 1);
    `);
    const services = createPlatformServices(database);

    await services.upsertReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 5, comment: "很稳", anonymous: true }, auth("1"), "map-1");
    await services.upsertReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 3 }, auth("2"), "map-2");
    await services.upsertReview({ targetType: "event", targetId: "event.test", rating: 4 }, auth("1"), "event-1");

    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ averageRating: 4, reviewCount: 2, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }, sampleInsufficient: true });
    await expect(services.getReviewSummary({ targetType: "event", targetId: "event.test" })).resolves.toMatchObject({ averageRating: 4, reviewCount: 1 });
  });

  it("keeps legacy map reviews unscoped while isolating each Revision and stable Event reviews", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1), ('account-2', '2', 'Two', 'two', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1);
      INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES ('event.test', 'Test event', 'test', 'common', 'Test', '1', 'implemented', 1, 1);
      INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at) VALUES ('revision:map.test:previous', 'map.test', 'historical', '0', 1, 1);
      INSERT INTO reviews (id, player_account_id, target_type, target_id, rating, comment, created_at, updated_at) VALUES ('review.legacy', 'account-1', 'map', 'map.test', 1, 'unscoped legacy', 1, 1);
      INSERT INTO reviews (id, player_account_id, target_type, target_id, gameplay_revision_id, rating, comment, created_at, updated_at) VALUES
        ('review.current', 'account-1', 'map', 'map.test', 'revision:map.test:initial', 5, 'current revision', 2, 2),
        ('review.previous', 'account-2', 'map', 'map.test', 'revision:map.test:previous', 3, 'previous revision', 3, 3),
        ('review.event', 'account-1', 'event', 'event.test', NULL, 4, 'stable event', 4, 4);
    `);
    const services = createPlatformServices(database);

    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ gameplayRevisionId: "revision:map.test:initial", averageRating: 5, reviewCount: 1 });
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:previous" })).resolves.toMatchObject({ gameplayRevisionId: "revision:map.test:previous", averageRating: 3, reviewCount: 1 });
    await expect(services.getReviewSummaries({ targetType: "map", targets: [
      { targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" },
      { targetId: "map.test", gameplayRevisionId: "revision:map.test:previous" },
    ] })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", averageRating: 5, reviewCount: 1 }),
      expect.objectContaining({ targetId: "map.test", gameplayRevisionId: "revision:map.test:previous", averageRating: 3, reviewCount: 1 }),
    ]));
    await expect(services.getReviewSummary({ targetType: "event", targetId: "event.test" })).resolves.toMatchObject({ gameplayRevisionId: null, averageRating: 4, reviewCount: 1 });
    await expect(services.listPublicReviewComments({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20 })).resolves.toMatchObject({ gameplayRevisionId: "revision:map.test:initial", total: 1, items: [{ comment: "current revision" }] });
    await expect(services.getPlayerReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" }, auth("1"))).resolves.toMatchObject({ reviewId: "review.current", gameplayRevisionId: "revision:map.test:initial" });
    await expect(services.getPlayerReview({ targetType: "event", targetId: "event.test" }, auth("1"))).resolves.toMatchObject({ reviewId: "review.event", gameplayRevisionId: null });
    await expect(services.listAdminReviews({ targetType: "map", targetId: "map.test", page: 1, pageSize: 20 }, auth("admin"))).resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ reviewId: "review.legacy", gameplayRevisionId: null })]) });
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM reviews WHERE id = 'review.legacy'").get()).toEqual({ gameplay_revision_id: null });
  });

  it("batches public summaries and filters public comments without exposing private identity", async () => {
    const { database, sqlite, resetCount, getCount } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1), ('account-2', '2', 'Two', 'two', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1), ('map.empty', 'Empty map', '1', 'active', '1', 1, 1);
    `);
    const services = createPlatformServices(database);
    const named = await services.upsertReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 5, comment: "公开评论" }, auth("1"), "public-1");
    await services.upsertReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 3, comment: "匿名评论", anonymous: true }, auth("2"), "public-2");

    resetCount();
    await expect(services.getReviewSummaries({ targetType: "map", targets: [{ targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" }, { targetId: "map.empty", gameplayRevisionId: "revision:map.empty:initial" }] })).resolves.toEqual([
      { targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", averageRating: 4, reviewCount: 2, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }, sampleInsufficient: true },
      { targetType: "map", targetId: "map.empty", gameplayRevisionId: "revision:map.empty:initial", averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true },
    ]);
    const smallBatchCount = getCount();
    expect(smallBatchCount).toBeLessThanOrEqual(3);
    for (let index = 0; index < 40; index += 1) sqlite.prepare("INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, '1', 'active', '1', 1, 1)").run(`map.batch.${index}`, `Batch map ${index}`);
    resetCount();
    await services.getReviewSummaries({ targetType: "map", targets: ["map.test", "map.empty", ...Array.from({ length: 40 }, (_, index) => `map.batch.${index}`)].map((targetId) => ({ targetId, gameplayRevisionId: `revision:${targetId}:initial` })) });
    expect(getCount()).toBeLessThanOrEqual(smallBatchCount + 1);

    resetCount();
    const comments = await services.listPublicReviewComments({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20 });
    expect(comments).toMatchObject({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20, total: 2, hasMore: false });
    expect(comments.items).toEqual(expect.arrayContaining([
      { rating: 3, comment: "匿名评论", author: null, createdAt: expect.any(Number) },
      { rating: 5, comment: "公开评论", author: { displayName: "One" }, createdAt: expect.any(Number) },
    ]));
    expect(getCount()).toBeLessThanOrEqual(3);

    await services.hideReviewComment({ reviewId: named.reviewId, reason: "检查" }, auth("admin"), "hide-public");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ reviewCount: 2, averageRating: 4 });
    await expect(services.listPublicReviewComments({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ author: null, comment: "匿名评论" }] });

    const anonymous = await services.getPlayerReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" }, auth("2"));
    await services.withdrawReview({ reviewId: anonymous!.reviewId }, auth("2"), "withdraw-public");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ reviewCount: 1, averageRating: 5 });
    await services.invalidateReview({ reviewId: named.reviewId, reason: "无效" }, auth("admin"), "invalidate-public");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ reviewCount: 0, averageRating: null });
    await services.restoreReview({ reviewId: named.reviewId }, auth("admin"), "restore-public");
    await services.restoreReviewComment({ reviewId: named.reviewId }, auth("admin"), "restore-comment-public");
    await expect(services.listPublicReviewComments({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ author: { displayName: "One" }, comment: "公开评论" }] });
  });

  it("withdraws and restores the same auditable record, while invalidation removes it from aggregates", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1);
    `);
    const services = createPlatformServices(database);
    const review = await services.upsertReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 5, comment: "可追溯" }, auth("1"), "create");
    await services.withdrawReview({ reviewId: review.reviewId }, auth("1"), "withdraw");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ averageRating: null, reviewCount: 0 });
    const restored = await services.upsertReview({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial", rating: 4, comment: "重新提交" }, auth("1"), "recreate");
    expect(restored.reviewId).toBe(review.reviewId);
    await services.invalidateReview({ reviewId: review.reviewId, reason: "无效内容" }, auth("admin"), "invalidate");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ averageRating: null, reviewCount: 0, ratingDistribution: { 4: 0 } });
    await services.restoreReview({ reviewId: review.reviewId }, auth("admin"), "restore");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" })).resolves.toMatchObject({ averageRating: 4, reviewCount: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_type = 'review'").get()).toEqual({ count: 5 });
  });

});
