import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  let statementCount = 0;
  const wrapStatement = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async first<T>() { statementCount += 1; return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null; },
      async all<T>() {
        statementCount += 1;
        const results = sqlite.prepare(sql).all(...bound) as T[];
        return { results, success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: results.length, rows_written: 0, last_row_id: 0, changed_db: false } };
      },
      async run() {
        statementCount += 1;
        const info = sqlite.prepare(sql).run(...bound);
        return { success: true, meta: { changes: Number(info.changes ?? 0), duration: 0, size_after: 0, rows_read: 0, rows_written: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0), changed_db: true } };
      },
      async raw<T extends unknown[] = unknown[]>() {
        statementCount += 1;
        const prepared = sqlite.prepare(sql);
        prepared.setReturnArrays(true);
        return prepared.all(...bound) as T[];
      },
    };
    return statement;
  };
  const database = {
    prepare(sql: string) { return wrapStatement(sql); },
    async batch(statements: Array<ReturnType<typeof wrapStatement>>) {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
    async exec(sql: string) { statementCount += 1; sqlite.exec(sql); return []; },
    withSession() { return database; },
  } as unknown as D1Database;
  return { database, sqlite, resetCount: () => { statementCount = 0; }, getCount: () => statementCount };
};

const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE player_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    normalized_player_name TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    banned_at INTEGER,
    banned_by TEXT,
    ban_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE maps (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    game_version TEXT NOT NULL,
    status TEXT NOT NULL,
    introduced_version TEXT NOT NULL,
    retired_version TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE random_events (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    rarity TEXT NOT NULL,
    description TEXT NOT NULL,
    duration_seconds INTEGER,
    cooldown_seconds REAL,
    weight REAL,
    game_version TEXT NOT NULL,
    effect_tags_json TEXT NOT NULL DEFAULT '[]',
    release_status TEXT NOT NULL,
    archived_at INTEGER,
    archived_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE reviews (
    id TEXT PRIMARY KEY NOT NULL,
    player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('event', 'map')),
    target_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    comment_status TEXT NOT NULL DEFAULT 'visible',
    anonymous INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    withdrawn_at INTEGER,
    invalidated_at INTEGER,
    invalidated_by TEXT,
    invalidation_reason TEXT,
    UNIQUE (player_account_id, target_type, target_id)
  );
  CREATE TABLE idempotency_keys (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    correlation_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const auth = (subject: string) => ({ actorType: "user" as const, subject, roles: [] as string[], provider: "test" });

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

    await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 5, comment: "很稳", anonymous: true }, auth("1"), "map-1");
    await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 3 }, auth("2"), "map-2");
    await services.upsertReview({ targetType: "event", targetId: "event.test", rating: 4 }, auth("1"), "event-1");

    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test" })).resolves.toMatchObject({ averageRating: 4, reviewCount: 2, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }, sampleInsufficient: true });
    await expect(services.getReviewSummary({ targetType: "event", targetId: "event.test" })).resolves.toMatchObject({ averageRating: 4, reviewCount: 1 });
  });

  it("batches public summaries and filters public comments without exposing private identity", async () => {
    const { database, sqlite, resetCount, getCount } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1), ('account-2', '2', 'Two', 'two', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1), ('map.empty', 'Empty map', '1', 'active', '1', 1, 1);
    `);
    const services = createPlatformServices(database);
    const named = await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 5, comment: "公开评论" }, auth("1"), "public-1");
    await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 3, comment: "匿名评论", anonymous: true }, auth("2"), "public-2");

    resetCount();
    await expect(services.getReviewSummaries({ targetType: "map", targetIds: ["map.test", "map.empty"] })).resolves.toEqual([
      { targetType: "map", targetId: "map.test", averageRating: 4, reviewCount: 2, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 }, sampleInsufficient: true },
      { targetType: "map", targetId: "map.empty", averageRating: null, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sampleInsufficient: true },
    ]);
    const smallBatchCount = getCount();
    expect(smallBatchCount).toBeLessThanOrEqual(3);
    for (let index = 0; index < 40; index += 1) sqlite.prepare("INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, '1', 'active', '1', 1, 1)").run(`map.batch.${index}`, `Batch map ${index}`);
    resetCount();
    await services.getReviewSummaries({ targetType: "map", targetIds: ["map.test", "map.empty", ...Array.from({ length: 40 }, (_, index) => `map.batch.${index}`)] });
    expect(getCount()).toBeLessThanOrEqual(smallBatchCount + 1);

    resetCount();
    const comments = await services.listPublicReviewComments({ targetType: "map", targetId: "map.test", page: 1, pageSize: 20 });
    expect(comments).toMatchObject({ targetType: "map", targetId: "map.test", page: 1, pageSize: 20, total: 2, hasMore: false });
    expect(comments.items).toEqual(expect.arrayContaining([
      { rating: 3, comment: "匿名评论", author: null, createdAt: expect.any(Number) },
      { rating: 5, comment: "公开评论", author: { displayName: "One" }, createdAt: expect.any(Number) },
    ]));
    expect(getCount()).toBeLessThanOrEqual(3);

    await services.hideReviewComment({ reviewId: named.reviewId, reason: "检查" }, auth("admin"), "hide-public");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test" })).resolves.toMatchObject({ reviewCount: 2, averageRating: 4 });
    await expect(services.listPublicReviewComments({ targetType: "map", targetId: "map.test", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ author: null, comment: "匿名评论" }] });

    const anonymous = await services.getPlayerReview({ targetType: "map", targetId: "map.test" }, auth("2"));
    await services.withdrawReview({ reviewId: anonymous!.reviewId }, auth("2"), "withdraw-public");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test" })).resolves.toMatchObject({ reviewCount: 1, averageRating: 5 });
    await services.invalidateReview({ reviewId: named.reviewId, reason: "无效" }, auth("admin"), "invalidate-public");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test" })).resolves.toMatchObject({ reviewCount: 0, averageRating: null });
    await services.restoreReview({ reviewId: named.reviewId }, auth("admin"), "restore-public");
    await services.restoreReviewComment({ reviewId: named.reviewId }, auth("admin"), "restore-comment-public");
    await expect(services.listPublicReviewComments({ targetType: "map", targetId: "map.test", page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1, items: [{ author: { displayName: "One" }, comment: "公开评论" }] });
  });

  it("updates one row, replays idempotently, and preserves the hidden-comment boundary", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1), ('account-2', '2', 'Two', 'two', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1);
    `);
    const services = createPlatformServices(database);
    const first = await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 4, comment: "原评论" }, auth("1"), "same-key");
    await expect(services.getPlayerReview({ targetType: "map", targetId: "map.test" }, auth("2"))).resolves.toBeNull();
    const replay = await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 4, comment: "原评论" }, auth("1"), "same-key");
    expect(replay).toEqual(first);
    const updated = await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 5, comment: "新评论" }, auth("1"), "update-key");
    expect(updated.reviewId).toBe(first.reviewId);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviews").get()).toEqual({ count: 1 });

    const hidden = await services.hideReviewComment({ reviewId: first.reviewId, reason: "需要核对" }, auth("admin"), "hide-key");
    expect(hidden.commentStatus).toBe("hidden");
    await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 3, comment: "更新后的评论" }, auth("1"), "update-hidden");
    await expect(services.getPlayerReview({ targetType: "map", targetId: "map.test" }, auth("1"))).resolves.toMatchObject({ rating: 3, commentStatus: "hidden" });
    await services.restoreReviewComment({ reviewId: first.reviewId }, auth("admin"), "restore-comment");
    await expect(services.getPlayerReview({ targetType: "map", targetId: "map.test" }, auth("1"))).resolves.toMatchObject({ commentStatus: "visible" });
  });

  it("withdraws and restores the same auditable record, while invalidation removes it from aggregates", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1);
    `);
    const services = createPlatformServices(database);
    const review = await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 5, comment: "可追溯" }, auth("1"), "create");
    await services.withdrawReview({ reviewId: review.reviewId }, auth("1"), "withdraw");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test" })).resolves.toMatchObject({ averageRating: null, reviewCount: 0 });
    const restored = await services.upsertReview({ targetType: "map", targetId: "map.test", rating: 4, comment: "重新提交" }, auth("1"), "recreate");
    expect(restored.reviewId).toBe(review.reviewId);
    await services.invalidateReview({ reviewId: review.reviewId, reason: "无效内容" }, auth("admin"), "invalidate");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test" })).resolves.toMatchObject({ averageRating: null, reviewCount: 0, ratingDistribution: { 4: 0 } });
    await services.restoreReview({ reviewId: review.reviewId }, auth("admin"), "restore");
    await expect(services.getReviewSummary({ targetType: "map", targetId: "map.test" })).resolves.toMatchObject({ averageRating: 4, reviewCount: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_type = 'review'").get()).toEqual({ count: 5 });
  });

  it("rejects invalid content, unavailable targets, and idempotency conflicts", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.retired', 'Retired map', '1', 'retired', '1', 1, 1);
      INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, created_at, updated_at) VALUES ('event.dev', 'Dev event', 'test', 'common', 'Test', '1', 'development', 1, 1), ('event.removed', 'Removed event', 'test', 'common', 'Test', '1', 'removed', 1, 1);
    `);
    const services = createPlatformServices(database);
    await expect(services.upsertReview({ targetType: "map", targetId: "missing", rating: 4 }, auth("1"), "missing")).rejects.toThrow("REVIEW_TARGET_NOT_FOUND");
    await expect(services.upsertReview({ targetType: "map", targetId: "map.retired", rating: 4 }, auth("1"), "retired")).rejects.toThrow("REVIEW_TARGET_NOT_RATEABLE");
    await expect(services.upsertReview({ targetType: "event", targetId: "event.dev", rating: 4 }, auth("1"), "dev")).rejects.toThrow("REVIEW_TARGET_NOT_RATEABLE");
    await expect(services.upsertReview({ targetType: "event", targetId: "event.removed", rating: 4 }, auth("1"), "removed")).rejects.toThrow("REVIEW_TARGET_NOT_RATEABLE");
    await expect(services.upsertReview({ targetType: "map", targetId: "map.retired", rating: 6 as 1 }, auth("1"), "rating")).rejects.toThrow("REVIEW_TARGET_NOT_RATEABLE");
    const longComment = "x".repeat(501);
    await expect(services.upsertReview({ targetType: "map", targetId: "missing", rating: 4, comment: longComment }, auth("1"), "long")).rejects.toThrow("REVIEW_TARGET_NOT_FOUND");

    sqlite.exec("INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.active', 'Active map', '1', 'active', '1', 1, 1);");
    await expect(services.upsertReview({ targetType: "map", targetId: "map.active", rating: 6 as 1 }, auth("1"), "invalid-rating")).rejects.toThrow("REVIEW_RATING_INVALID");
    await services.upsertReview({ targetType: "map", targetId: "map.active", rating: 4 }, auth("1"), "conflict");
    await expect(services.upsertReview({ targetType: "map", targetId: "map.active", rating: 5 }, auth("1"), "conflict")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.upsertReview({ targetType: "map", targetId: "map.active", rating: 4, comment: longComment }, auth("1"), "long-valid-target")).rejects.toThrow("REVIEW_COMMENT_TOO_LONG");
  });
});
