import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type {
  AdminReviewDetail,
  AdminReviewQuery,
  AuthContext,
  PlatformServices,
  PublicReviewCommentPage,
  PublicReviewCommentQuery,
  ReviewRating,
  ReviewRecord,
  ReviewSummary,
  ReviewSummaryBatchInput,
  ReviewTarget,
  ReviewTargetType,
  ReviewUpsertInput,
} from "@owbastion/domain";
import type { AdminReview } from "@owbastion/contracts";
import { gameplayRevisions, maps, playerAccounts, randomEvents, reviews } from "./schema";

export const maxReviewCommentLength = 500;
export const reviewSampleThreshold = 3;

type ReviewServices = Pick<PlatformServices,
  | "listAdminReviews"
  | "getAdminReview"
  | "getReviewSummary"
  | "getReviewSummaries"
  | "listPublicReviewComments"
  | "getPlayerReview"
  | "upsertReview"
  | "withdrawReview"
  | "hideReviewComment"
  | "restoreReviewComment"
  | "invalidateReview"
  | "restoreReview"
>;

type AdminReviewRow = {
  review_id: string;
  target_type: string;
  target_id: string;
  gameplay_revision_id: string | null;
  target_name: string | null;
  player_account_id: string;
  player_id: string;
  player_name: string;
  rating: number;
  comment: string | null;
  anonymous: number;
  comment_status: string;
  status: string;
  created_at: number;
  updated_at: number;
  withdrawn_at: number | null;
  invalidated_at: number | null;
  invalidated_by: string | null;
  invalidation_reason: string | null;
};

type AggregateRow = {
  target_id: string;
  gameplay_revision_id: string | null;
  review_count: number;
  average_rating: number | null;
  rating_1: number | null;
  rating_2: number | null;
  rating_3: number | null;
  rating_4: number | null;
  rating_5: number | null;
};

type ReviewDependencies = {
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
};

export const createReviewServices = (database: D1Database, db: ReturnType<typeof drizzle>, dependencies: ReviewDependencies): ReviewServices => {
  const { now, replayOrConflict, recordIdempotency, recordAudit } = dependencies;
  const findReviewAccount = (subject: string) => db.select().from(playerAccounts)
    .where(or(eq(playerAccounts.id, subject), eq(playerAccounts.playerId, subject)))
    .get();
  const findReviewTarget = (input: ReviewTarget) => input.targetType === "event"
    ? db.select().from(randomEvents).where(eq(randomEvents.id, input.targetId)).get()
    : db.select({ map: maps, revision: gameplayRevisions }).from(maps)
      .innerJoin(gameplayRevisions, and(eq(gameplayRevisions.mapId, maps.id), eq(gameplayRevisions.id, input.gameplayRevisionId)))
      .where(eq(maps.id, input.targetId)).get();

  const getReviewSummaries = async (input: ReviewSummaryBatchInput): Promise<ReviewSummary[]> => {
    const toSummary = (target: { targetId: string; gameplayRevisionId: string | null }, aggregate: AggregateRow | undefined): ReviewSummary => {
      const reviewCount = Number(aggregate?.review_count ?? 0);
      return {
        targetType: input.targetType,
        targetId: target.targetId,
        gameplayRevisionId: target.gameplayRevisionId,
        averageRating: aggregate?.average_rating == null ? null : Number(Number(aggregate.average_rating).toFixed(2)),
        reviewCount,
        ratingDistribution: { 1: Number(aggregate?.rating_1 ?? 0), 2: Number(aggregate?.rating_2 ?? 0), 3: Number(aggregate?.rating_3 ?? 0), 4: Number(aggregate?.rating_4 ?? 0), 5: Number(aggregate?.rating_5 ?? 0) },
        sampleInsufficient: reviewCount < reviewSampleThreshold,
      };
    };

    if (input.targetType === "event") {
      const targetIds = [...new Set(input.targetIds)];
      if (!targetIds.length || targetIds.length > 100) throw new Error("REVIEW_TARGET_BATCH_INVALID");
      const targetRows = await db.select({ id: randomEvents.id }).from(randomEvents).where(inArray(randomEvents.id, targetIds));
      if (targetRows.length !== targetIds.length) throw new Error("REVIEW_TARGET_NOT_FOUND");
      const placeholders = targetIds.map(() => "?").join(", ");
      const aggregateResult = await database.prepare(`
        SELECT target_id, NULL AS gameplay_revision_id, COUNT(*) AS review_count, AVG(rating) AS average_rating,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS rating_1,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS rating_2,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS rating_3,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS rating_4,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS rating_5
        FROM reviews
        WHERE target_type = 'event' AND target_id IN (${placeholders}) AND status = 'active'
        GROUP BY target_id
      `).bind(...targetIds).all<AggregateRow>();
      const aggregates = new Map(aggregateResult.results.map((row) => [row.target_id, row]));
      return targetIds.map((targetId) => toSummary({ targetId, gameplayRevisionId: null }, aggregates.get(targetId)));
    }

    const targets = [...new Map(input.targets.map((target) => [`${target.targetId}:${target.gameplayRevisionId}`, target])).values()];
    if (!targets.length || targets.length > 100) throw new Error("REVIEW_TARGET_BATCH_INVALID");
    const serializedTargets = JSON.stringify(targets);
    const targetCount = await database.prepare(`
      SELECT COUNT(*) AS count FROM json_each(?)
      WHERE EXISTS (
        SELECT 1 FROM gameplay_revisions revision
        WHERE revision.id = json_extract(json_each.value, '$.gameplayRevisionId')
          AND revision.map_id = json_extract(json_each.value, '$.targetId')
      )
    `).bind(serializedTargets).first<{ count: number }>();
    if (Number(targetCount?.count ?? 0) !== targets.length) throw new Error("REVIEW_TARGET_NOT_FOUND");
    const aggregateResult = await database.prepare(`
      WITH requested AS (
        SELECT json_extract(value, '$.targetId') AS target_id,
               json_extract(value, '$.gameplayRevisionId') AS gameplay_revision_id
        FROM json_each(?)
      )
      SELECT review.target_id, review.gameplay_revision_id, COUNT(*) AS review_count, AVG(review.rating) AS average_rating,
        SUM(CASE WHEN review.rating = 1 THEN 1 ELSE 0 END) AS rating_1,
        SUM(CASE WHEN review.rating = 2 THEN 1 ELSE 0 END) AS rating_2,
        SUM(CASE WHEN review.rating = 3 THEN 1 ELSE 0 END) AS rating_3,
        SUM(CASE WHEN review.rating = 4 THEN 1 ELSE 0 END) AS rating_4,
        SUM(CASE WHEN review.rating = 5 THEN 1 ELSE 0 END) AS rating_5
      FROM reviews AS review
      INNER JOIN requested ON requested.target_id = review.target_id AND requested.gameplay_revision_id = review.gameplay_revision_id
      WHERE review.target_type = 'map' AND review.status = 'active'
      GROUP BY review.target_id, review.gameplay_revision_id
    `).bind(serializedTargets).all<AggregateRow>();
    const aggregates = new Map(aggregateResult.results.map((row) => [`${row.target_id}:${row.gameplay_revision_id}`, row]));
    return targets.map((target) => toSummary(target, aggregates.get(`${target.targetId}:${target.gameplayRevisionId}`)));
  };

  const asRating = (value: number): ReviewRating => {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("REVIEW_RATING_INVALID");
    return value as ReviewRating;
  };
  const asReviewRecord = (row: typeof reviews.$inferSelect): ReviewRecord => ({
    reviewId: row.id,
    playerAccountId: row.playerAccountId,
    targetType: row.targetType as ReviewTargetType,
    targetId: row.targetId,
    gameplayRevisionId: row.gameplayRevisionId,
    rating: asRating(row.rating),
    comment: row.comment,
    commentStatus: row.commentStatus as ReviewRecord["commentStatus"],
    anonymous: row.anonymous === 1,
    status: row.status as ReviewRecord["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    withdrawnAt: row.withdrawnAt,
    invalidatedAt: row.invalidatedAt,
    invalidatedBy: row.invalidatedBy,
    invalidationReason: row.invalidationReason,
  });
  const normalizeComment = (value: string | null | undefined) => {
    const comment = value?.trim() ?? "";
    if (Array.from(comment).length > maxReviewCommentLength) throw new Error("REVIEW_COMMENT_TOO_LONG");
    return comment || null;
  };
  const asAdminReview = (row: AdminReviewRow): AdminReview => {
    if (!row.target_name) throw new Error("REVIEW_TARGET_NOT_FOUND");
    return {
      reviewId: row.review_id,
      targetType: row.target_type as AdminReview["targetType"],
      targetId: row.target_id,
      gameplayRevisionId: row.gameplay_revision_id,
      targetName: row.target_name,
      playerAccountId: row.player_account_id,
      playerId: row.player_id,
      playerName: row.player_name,
      rating: asRating(row.rating),
      comment: row.comment,
      anonymous: row.anonymous === 1,
      commentStatus: row.comment_status as AdminReview["commentStatus"],
      status: row.status as AdminReview["status"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      withdrawnAt: row.withdrawn_at,
      invalidatedAt: row.invalidated_at,
      invalidatedBy: row.invalidated_by,
      invalidationReason: row.invalidation_reason,
    };
  };
  const adminReviewQuery = `
    FROM reviews r
    INNER JOIN player_accounts p ON p.id = r.player_account_id
    WHERE 1 = 1`;
  const adminReviewSelect = `
    SELECT r.id AS review_id, r.target_type, r.target_id, r.gameplay_revision_id,
      CASE WHEN r.target_type = 'event' THEN (SELECT name FROM random_events WHERE id = r.target_id)
           ELSE (SELECT name FROM maps WHERE id = r.target_id) END AS target_name,
      r.player_account_id, p.player_id, p.player_name, r.rating, r.comment,
      r.anonymous, r.comment_status, r.status, r.created_at, r.updated_at,
      r.withdrawn_at, r.invalidated_at, r.invalidated_by, r.invalidation_reason
    ${adminReviewQuery}`;

  const mutateComment = async (input: { reviewId: string; reason?: string }, auth: AuthContext, key: string, nextStatus: "visible" | "hidden"): Promise<ReviewRecord> => {
    const operation = nextStatus === "hidden" ? "review.comment.hide" : "review.comment.restore";
    const replay = await replayOrConflict<ReviewRecord>(auth.subject, operation, key, input);
    if (replay) return replay;
    const row = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).get();
    if (!row) throw new Error("REVIEW_NOT_FOUND");
    if (!row.comment) throw new Error("REVIEW_COMMENT_NOT_FOUND");
    const timestamp = now();
    if (row.commentStatus !== nextStatus) await db.update(reviews).set({ commentStatus: nextStatus, updatedAt: timestamp }).where(eq(reviews.id, row.id));
    const response = asReviewRecord((await db.select().from(reviews).where(eq(reviews.id, row.id)).get())!);
    await recordIdempotency(auth.subject, operation, key, input, response);
    await recordAudit(auth, operation, "review", row.id, { reason: input.reason ?? null, previousCommentStatus: row.commentStatus, commentStatus: response.commentStatus });
    return response;
  };

  const mutateState = async (input: { reviewId: string; reason?: string }, auth: AuthContext, key: string, nextStatus: "active" | "invalidated"): Promise<ReviewRecord> => {
    const operation = nextStatus === "invalidated" ? "review.invalidate" : "review.restore";
    const replay = await replayOrConflict<ReviewRecord>(auth.subject, operation, key, input);
    if (replay) return replay;
    const row = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).get();
    if (!row) throw new Error("REVIEW_NOT_FOUND");
    if (nextStatus === "invalidated" ? row.status === "invalidated" : row.status !== "invalidated") {
      const response = asReviewRecord(row);
      await recordIdempotency(auth.subject, operation, key, input, response);
      return response;
    }
    const timestamp = now();
    await db.update(reviews).set(nextStatus === "invalidated"
      ? { status: "invalidated", invalidatedAt: timestamp, invalidatedBy: auth.subject, invalidationReason: input.reason ?? null, updatedAt: timestamp }
      : { status: "active", invalidatedAt: null, invalidatedBy: null, invalidationReason: null, updatedAt: timestamp }).where(eq(reviews.id, row.id));
    const response = asReviewRecord((await db.select().from(reviews).where(eq(reviews.id, row.id)).get())!);
    await recordIdempotency(auth.subject, operation, key, input, response);
    await recordAudit(auth, operation, "review", row.id, { reason: input.reason ?? null, previousStatus: row.status, status: response.status });
    return response;
  };

  return {
    async listAdminReviews(input: AdminReviewQuery, _auth: AuthContext) {
      const clauses: string[] = [];
      const values: unknown[] = [];
      const add = (clause: string, value: unknown) => { clauses.push(` AND ${clause}`); values.push(value); };
      if (input.targetType) add("r.target_type = ?", input.targetType);
      if (input.targetId) add("r.target_id = ?", input.targetId);
      if (input.status) add("r.status = ?", input.status);
      if (input.commentStatus) add("r.comment_status = ?", input.commentStatus);
      if (input.rating) add("r.rating = ?", input.rating);
      if (input.from !== undefined) add("r.created_at >= ?", input.from);
      if (input.to !== undefined) add("r.created_at <= ?", input.to);
      const page = Math.max(1, Math.floor(input.page));
      const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize)));
      const where = clauses.join("");
      const [totalRow, result] = await Promise.all([
        database.prepare(`SELECT COUNT(*) AS total ${adminReviewQuery}${where}`).bind(...values).first<{ total: number }>(),
        database.prepare(`${adminReviewSelect}${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`).bind(...values, pageSize + 1, (page - 1) * pageSize).all<AdminReviewRow>(),
      ]);
      return {
        contractVersion: "1" as const,
        items: result.results.slice(0, pageSize).map(asAdminReview),
        page,
        pageSize,
        total: Number(totalRow?.total ?? 0),
        hasMore: result.results.length > pageSize,
      };
    },

    async getAdminReview(input: { reviewId: string }, _auth: AuthContext): Promise<AdminReviewDetail> {
      const row = await database.prepare(`${adminReviewSelect} AND r.id = ?`).bind(input.reviewId).first<AdminReviewRow>();
      if (!row) throw new Error("REVIEW_NOT_FOUND");
      const auditRows = await database.prepare("SELECT operation, actor_type, actor_id, payload_json, created_at FROM audit_events WHERE entity_type = 'review' AND entity_id = ? ORDER BY created_at DESC LIMIT 50").bind(input.reviewId).all<{
        operation: string;
        actor_type: string;
        actor_id: string;
        payload_json: string;
        created_at: number;
      }>();
      return {
        contractVersion: "1",
        review: asAdminReview(row),
        audit: auditRows.results.map((audit) => {
          let reason: string | null = null;
          try {
            const payload = JSON.parse(audit.payload_json) as { reason?: unknown };
            if (typeof payload.reason === "string") reason = payload.reason;
          } catch { /* Ignore malformed historical audit payloads. */ }
          return { operation: audit.operation, actorType: audit.actor_type, actorId: audit.actor_id, reason, createdAt: audit.created_at };
        }),
      };
    },

    async getReviewSummary(input: ReviewTarget): Promise<ReviewSummary> {
      const summaries = input.targetType === "event"
        ? await getReviewSummaries({ targetType: "event", targetIds: [input.targetId] })
        : await getReviewSummaries({ targetType: "map", targets: [{ targetId: input.targetId, gameplayRevisionId: input.gameplayRevisionId }] });
      return summaries[0]!;
    },

    getReviewSummaries,

    async listPublicReviewComments(input: PublicReviewCommentQuery): Promise<PublicReviewCommentPage> {
      if (!await findReviewTarget(input)) throw new Error("REVIEW_TARGET_NOT_FOUND");
      const page = Math.max(1, Math.floor(input.page));
      const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize)));
      const result = await database.prepare(`
        SELECT r.rating, r.comment, r.anonymous, r.created_at, p.player_name,
          COUNT(*) OVER () AS total_count
        FROM reviews r
        INNER JOIN player_accounts p ON p.id = r.player_account_id
        WHERE r.target_type = ? AND r.target_id = ? AND r.gameplay_revision_id IS ?
          AND r.status = 'active' AND r.comment_status = 'visible' AND r.comment IS NOT NULL
        ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?
      `).bind(input.targetType, input.targetId, input.targetType === "map" ? input.gameplayRevisionId : null, pageSize, (page - 1) * pageSize).all<{
        rating: number;
        comment: string;
        anonymous: number;
        created_at: number;
        player_name: string;
        total_count: number;
      }>();
      const total = Number(result.results[0]?.total_count ?? 0);
      return {
        targetType: input.targetType,
        targetId: input.targetId,
        gameplayRevisionId: input.targetType === "map" ? input.gameplayRevisionId : null,
        items: result.results.map((row) => ({
          rating: asRating(row.rating),
          comment: row.comment,
          author: row.anonymous === 1 ? null : { displayName: row.player_name },
          createdAt: row.created_at,
        })),
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      };
    },

    async getPlayerReview(input: ReviewTarget, auth: AuthContext): Promise<ReviewRecord | null> {
      const account = await findReviewAccount(auth.subject);
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      if (!await findReviewTarget(input)) throw new Error("REVIEW_TARGET_NOT_FOUND");
      const row = await db.select().from(reviews).where(and(
        eq(reviews.playerAccountId, account.id),
        eq(reviews.targetType, input.targetType),
        eq(reviews.targetId, input.targetId),
        input.targetType === "map" ? eq(reviews.gameplayRevisionId, input.gameplayRevisionId) : isNull(reviews.gameplayRevisionId),
      )).get();
      return row ? asReviewRecord(row) : null;
    },

    async upsertReview(input: ReviewUpsertInput, auth: AuthContext, key: string): Promise<ReviewRecord> {
      const operation = "review.upsert";
      const replay = await replayOrConflict<ReviewRecord>(auth.subject, operation, key, input);
      if (replay) return replay;
      const account = await findReviewAccount(auth.subject);
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      if (account.status === "banned") throw new Error("PLAYER_BANNED");
      const target = await findReviewTarget(input);
      if (!target) throw new Error("REVIEW_TARGET_NOT_FOUND");
      const canAccept = input.targetType === "event"
        ? "archivedAt" in target && target.releaseStatus === "implemented" && target.archivedAt === null
        : "map" in target && target.map.status === "active" && target.revision.lifecycle === "default";
      if (!canAccept) throw new Error("REVIEW_TARGET_NOT_RATEABLE");
      const rating = asRating(input.rating);
      const comment = normalizeComment(input.comment);
      const existing = await db.select().from(reviews).where(and(
        eq(reviews.playerAccountId, account.id),
        eq(reviews.targetType, input.targetType),
        eq(reviews.targetId, input.targetId),
        input.targetType === "map" ? eq(reviews.gameplayRevisionId, input.gameplayRevisionId) : isNull(reviews.gameplayRevisionId),
      )).get();
      if (existing?.status === "invalidated") throw new Error("REVIEW_INVALIDATED");
      const timestamp = now();
      const reviewId = existing?.id ?? crypto.randomUUID();
      await database.prepare(`
        INSERT INTO reviews (
          id, player_account_id, target_type, target_id, gameplay_revision_id, rating, comment,
          comment_status, anonymous, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT DO UPDATE SET rating = excluded.rating, comment = excluded.comment,
          anonymous = excluded.anonymous, status = 'active', updated_at = excluded.updated_at,
          withdrawn_at = NULL
      `).bind(reviewId, account.id, input.targetType, input.targetId, input.targetType === "map" ? input.gameplayRevisionId : null,
        rating, comment, existing?.commentStatus ?? "visible", input.anonymous ? 1 : 0, existing?.createdAt ?? timestamp, timestamp).run();
      const row = await db.select().from(reviews).where(and(
        eq(reviews.playerAccountId, account.id),
        eq(reviews.targetType, input.targetType),
        eq(reviews.targetId, input.targetId),
        input.targetType === "map" ? eq(reviews.gameplayRevisionId, input.gameplayRevisionId) : isNull(reviews.gameplayRevisionId),
      )).get();
      if (!row || row.status === "invalidated") throw new Error("REVIEW_INVALIDATED");
      const response = asReviewRecord(row);
      await recordIdempotency(auth.subject, operation, key, input, response);
      await recordAudit(auth, existing ? "review.update" : "review.create", "review", response.reviewId, { targetType: response.targetType, targetId: response.targetId, rating: response.rating, commentProvided: Boolean(response.comment), anonymous: response.anonymous, previousStatus: existing?.status ?? null });
      return response;
    },

    async withdrawReview(input, auth, key): Promise<ReviewRecord> {
      const operation = "review.withdraw";
      const replay = await replayOrConflict<ReviewRecord>(auth.subject, operation, key, input);
      if (replay) return replay;
      const account = await findReviewAccount(auth.subject);
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      const row = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).get();
      if (!row) throw new Error("REVIEW_NOT_FOUND");
      if (row.playerAccountId !== account.id) throw new Error("REVIEW_NOT_OWNED");
      if (row.status === "invalidated") throw new Error("REVIEW_INVALIDATED");
      const timestamp = now();
      if (row.status === "active") await db.update(reviews).set({ status: "withdrawn", withdrawnAt: timestamp, updatedAt: timestamp }).where(and(eq(reviews.id, row.id), eq(reviews.status, "active")));
      const response = asReviewRecord((await db.select().from(reviews).where(eq(reviews.id, row.id)).get())!);
      await recordIdempotency(auth.subject, operation, key, input, response);
      await recordAudit(auth, operation, "review", row.id, { previousStatus: row.status, status: response.status });
      return response;
    },

    async hideReviewComment(input, auth, key) { return mutateComment(input, auth, key, "hidden"); },
    async restoreReviewComment(input, auth, key) { return mutateComment(input, auth, key, "visible"); },
    async invalidateReview(input, auth, key) { return mutateState(input, auth, key, "invalidated"); },
    async restoreReview(input, auth, key) { return mutateState(input, auth, key, "active"); },
  };
};
