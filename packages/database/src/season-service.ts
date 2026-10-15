import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AdminSeason, AdminSeasonWriteRequest, SeasonStatus } from "@owbastion/contracts";
import { seasonPhase, seasonsOverlap, type AuthContext, type PlatformServices } from "@owbastion/domain";
import { hashRequest } from "./portal-session";
import { seasons, verifiedRuns } from "./schema";

type SeasonServices = Pick<PlatformServices,
  | "listAdminSeasons"
  | "createAdminSeason"
  | "updateAdminSeason"
  | "endAdminSeason"
  | "listPublicSeasons"
>;

type SeasonServicesDependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
};

type SeasonRow = typeof seasons.$inferSelect;

export const createSeasonServices = ({ database, db, now, replayOrConflict }: SeasonServicesDependencies): SeasonServices => {
  const playerCounts = async (seasonId?: string) => {
    const rows = await db.select({ seasonId: seasons.id, count: sql<number>`count(distinct ${verifiedRuns.playerAccountId})` })
      .from(seasons)
      .innerJoin(verifiedRuns, and(eq(verifiedRuns.status, "active"), gte(verifiedRuns.acceptedAt, seasons.startsAt), lte(verifiedRuns.acceptedAt, seasons.endsAt)))
      .where(and(ne(seasons.status, "draft"), seasonId ? eq(seasons.id, seasonId) : undefined))
      .groupBy(seasons.id);
    return new Map(rows.map((row) => [row.seasonId, row.count]));
  };

  const asAdminSeason = (row: SeasonRow, timestamp: number, counts: Map<string, number>): AdminSeason => ({
    seasonId: row.id,
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status as SeasonStatus,
    public: row.public === 1,
    phase: seasonPhase({ ...row, status: row.status as SeasonStatus }, timestamp),
    playerCount: counts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const loadAdminSeason = async (seasonId: string) => {
    const row = await db.select().from(seasons).where(eq(seasons.id, seasonId)).get();
    return asAdminSeason(row!, now(), await playerCounts(seasonId));
  };

  const loadExisting = async (seasonId: string) => {
    const row = await db.select().from(seasons).where(eq(seasons.id, seasonId)).get();
    if (!row) throw new Error("SEASON_NOT_FOUND");
    return row;
  };

  const validateWrite = async (input: AdminSeasonWriteRequest, timestamp: number, existing?: SeasonRow) => {
    if (input.endsAt <= input.startsAt || (input.status === "active" && input.endsAt < timestamp)) throw new Error("SEASON_RANGE_INVALID");
    const others = (await db.select().from(seasons)).filter((season) => season.id !== existing?.id);
    if (others.some((season) => seasonsOverlap(season, input))) throw new Error("SEASON_OVERLAP");
    if (existing && existing.status !== "draft" && existing.startsAt <= timestamp && (input.startsAt !== existing.startsAt || input.status === "draft")) throw new Error("SEASON_STARTED");
  };

  const recordStatements = async (operation: string, input: unknown, response: unknown, auth: AuthContext, idempotencyKey: string, seasonId: string, payload: unknown, timestamp: number) => [
    database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, await hashRequest(input), JSON.stringify(response), timestamp),
    database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "season", seasonId, JSON.stringify(payload), timestamp),
  ];

  const snapshot = (season: Pick<SeasonRow, "name" | "startsAt" | "endsAt" | "status" | "public">) => ({ name: season.name, startsAt: season.startsAt, endsAt: season.endsAt, status: season.status, public: season.public === 1 });

  return {
    async listAdminSeasons() {
      const timestamp = now();
      const [rows, counts] = await Promise.all([db.select().from(seasons).orderBy(desc(seasons.startsAt)), playerCounts()]);
      return { contractVersion: "1" as const, now: timestamp, items: rows.map((row) => asAdminSeason(row, timestamp, counts)) };
    },

    async createAdminSeason(input, auth, idempotencyKey) {
      const operation = "admin.season.create";
      const replay = await replayOrConflict<{ seasonId: string }>(auth.subject, operation, idempotencyKey, input);
      if (replay) return loadAdminSeason(replay.seasonId);
      const timestamp = now();
      if (input.status === "archived") throw new Error("SEASON_RANGE_INVALID");
      await validateWrite(input, timestamp);
      const seasonId = crypto.randomUUID();
      await database.batch([
        database.prepare("INSERT INTO seasons (id, name, starts_at, ends_at, status, public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(seasonId, input.name, input.startsAt, input.endsAt, input.status, input.public ? 1 : 0, timestamp, timestamp),
        ...await recordStatements(operation, input, { seasonId }, auth, idempotencyKey, seasonId, { after: { name: input.name, startsAt: input.startsAt, endsAt: input.endsAt, status: input.status, public: input.public } }, timestamp),
      ] as [D1PreparedStatement, ...D1PreparedStatement[]]);
      return loadAdminSeason(seasonId);
    },

    async updateAdminSeason(input, auth, idempotencyKey) {
      const operation = "admin.season.update";
      const replay = await replayOrConflict<{ seasonId: string }>(auth.subject, operation, idempotencyKey, input);
      if (replay) return loadAdminSeason(replay.seasonId);
      const existing = await loadExisting(input.seasonId);
      const timestamp = now();
      if (seasonPhase({ ...existing, status: existing.status as SeasonStatus }, timestamp) === "ended") {
        if (input.name !== existing.name || input.startsAt !== existing.startsAt || input.endsAt !== existing.endsAt || input.status !== existing.status) throw new Error("SEASON_ENDED");
      } else {
        if (input.status === "archived") throw new Error("SEASON_RANGE_INVALID");
        await validateWrite(input, timestamp, existing);
      }
      await database.batch([
        database.prepare("UPDATE seasons SET name = ?, starts_at = ?, ends_at = ?, status = ?, public = ?, updated_at = ? WHERE id = ?").bind(input.name, input.startsAt, input.endsAt, input.status, input.public ? 1 : 0, timestamp, existing.id),
        ...await recordStatements(operation, input, { seasonId: existing.id }, auth, idempotencyKey, existing.id, { before: snapshot(existing), after: { name: input.name, startsAt: input.startsAt, endsAt: input.endsAt, status: input.status, public: input.public } }, timestamp),
      ] as [D1PreparedStatement, ...D1PreparedStatement[]]);
      return loadAdminSeason(existing.id);
    },

    async endAdminSeason(input, auth, idempotencyKey) {
      const operation = "admin.season.end";
      const replay = await replayOrConflict<{ seasonId: string }>(auth.subject, operation, idempotencyKey, input);
      if (replay) return loadAdminSeason(replay.seasonId);
      const existing = await loadExisting(input.seasonId);
      const timestamp = now();
      if (seasonPhase({ ...existing, status: existing.status as SeasonStatus }, timestamp) !== "running") throw new Error("SEASON_NOT_RUNNING");
      await database.batch([
        database.prepare("UPDATE seasons SET ends_at = ?, status = 'archived', updated_at = ? WHERE id = ?").bind(timestamp, timestamp, existing.id),
        ...await recordStatements(operation, input, { seasonId: existing.id }, auth, idempotencyKey, existing.id, { before: snapshot(existing), endedAt: timestamp }, timestamp),
      ] as [D1PreparedStatement, ...D1PreparedStatement[]]);
      return loadAdminSeason(existing.id);
    },

    async listPublicSeasons() {
      const timestamp = now();
      const rows = await db.select().from(seasons)
        .where(and(ne(seasons.status, "draft"), eq(seasons.public, 1), lte(seasons.startsAt, timestamp)))
        .orderBy(desc(seasons.startsAt));
      return {
        contractVersion: "1" as const,
        items: rows.map((row) => ({ seasonId: row.id, name: row.name, startsAt: row.startsAt, endsAt: row.endsAt, phase: seasonPhase({ ...row, status: row.status as SeasonStatus }, timestamp) === "running" ? "running" as const : "ended" as const })),
      };
    },
  };
};
