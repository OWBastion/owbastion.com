import { eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { drizzle } from "drizzle-orm/d1";
import type { PlatformServices } from "@owbastion/domain";
import { playerAccounts } from "./schema";
import type { resolvePortalSession } from "./portal-session";

/** One row per player who changed the preference; no row means map titles are worn. */
export const playerTitleWear = sqliteTable("player_title_wear", {
  playerAccountId: text("player_account_id").primaryKey().references(() => playerAccounts.id),
  wearMapTitles: integer("wear_map_titles").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

type Dependencies = {
  now: () => number;
  hashRequest: (value: unknown) => Promise<string>;
  replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  getCurrentPortalPlayer: (sessionToken: string) => ReturnType<typeof resolvePortalSession>;
  findEquipableGrantIds: (playerAccountId: string, grantIds: string[]) => Promise<Array<{ id: string; titleKey: string }>>;
};

export type EquippedTitleServices = Pick<PlatformServices,
  | "replaceCurrentPlayerEquippedTitles"
  | "replaceAdminPlayerEquippedTitles"
  | "getCurrentPlayerMapTitleWear"
  | "updateCurrentPlayerMapTitleWear"
>;

export const createEquippedTitleServices = (
  database: D1Database,
  db: ReturnType<typeof drizzle>,
  dependencies: Dependencies,
): EquippedTitleServices => {
  const { now, hashRequest, replayOrConflict, getCurrentPortalPlayer, findEquipableGrantIds } = dependencies;

  return {
    async replaceCurrentPlayerEquippedTitles(input, idempotencyKey) {
      const operation = "player.title.equipped.replace";
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      const request = { grantIds: input.grantIds };
      const replay = await replayOrConflict<{ contractVersion: "1"; grantIds: string[] }>(current.player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      if (input.grantIds.length > 10 || new Set(input.grantIds).size !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_LIMIT_EXCEEDED");
      const grants = await findEquipableGrantIds(current.player.id, input.grantIds);
      if (grants.length !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_GRANT_INVALID");
      const timestamp = now(); const response = { contractVersion: "1" as const, grantIds: [...input.grantIds] };
      await database.batch([
        database.prepare("DELETE FROM player_equipped_titles WHERE player_account_id = ?").bind(current.player.id),
        ...response.grantIds.map((grantId) => database.prepare("INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at) VALUES (?, ?, ?)").bind(grantId, current.player.id, timestamp)),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${current.player.id}:${operation}:${idempotencyKey}`, current.player.id, operation, await hashRequest(request), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), "user", current.player.id, operation, "player_equipped_titles", current.player.id, JSON.stringify(request), timestamp),
      ]);
      return response;
    },

    async replaceAdminPlayerEquippedTitles(input, auth, idempotencyKey) {
      const operation = "admin.player.title.equipped.replace";
      const request = { playerAccountId: input.playerAccountId, grantIds: input.grantIds };
      const replay = await replayOrConflict<{ contractVersion: "1"; grantIds: string[] }>(auth.subject, operation, idempotencyKey, request);
      if (replay) return replay;
      const account = await db.select({ id: playerAccounts.id }).from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      if (input.grantIds.length > 10 || new Set(input.grantIds).size !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_LIMIT_EXCEEDED");
      const grants = await findEquipableGrantIds(account.id, input.grantIds);
      if (grants.length !== input.grantIds.length) throw new Error("EQUIPPED_TITLE_GRANT_INVALID");
      const timestamp = now();
      const response = { contractVersion: "1" as const, grantIds: [...input.grantIds] };
      await database.batch([
        database.prepare("DELETE FROM player_equipped_titles WHERE player_account_id = ?").bind(account.id),
        ...response.grantIds.map((grantId) => database.prepare("INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at) VALUES (?, ?, ?)").bind(grantId, account.id, timestamp)),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, await hashRequest(request), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "player_equipped_titles", account.id, JSON.stringify({ grantIds: input.grantIds, recovery: true }), timestamp),
      ]);
      return response;
    },

    async getCurrentPlayerMapTitleWear(input) {
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) return null;
      const row = await db.select({ wear: playerTitleWear.wearMapTitles }).from(playerTitleWear).where(eq(playerTitleWear.playerAccountId, current.player.id)).get();
      return { contractVersion: "1" as const, wearMapTitles: row?.wear !== 0 };
    },

    async updateCurrentPlayerMapTitleWear(input, idempotencyKey) {
      const operation = "player.title.map-wear.update";
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      const request = { wearMapTitles: input.wearMapTitles };
      const replay = await replayOrConflict<{ contractVersion: "1"; wearMapTitles: boolean }>(current.player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      const timestamp = now();
      const response = { contractVersion: "1" as const, wearMapTitles: input.wearMapTitles };
      await database.batch([
        database.prepare("INSERT INTO player_title_wear (player_account_id, wear_map_titles, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_account_id) DO UPDATE SET wear_map_titles = excluded.wear_map_titles, updated_at = excluded.updated_at").bind(current.player.id, input.wearMapTitles ? 1 : 0, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${current.player.id}:${operation}:${idempotencyKey}`, current.player.id, operation, await hashRequest(request), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), "user", current.player.id, operation, "player_title_wear", current.player.id, JSON.stringify(request), timestamp),
      ]);
      return response;
    },
  };
};
