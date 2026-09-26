import { and, eq, gt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { playerAccounts, portalSessions } from "./schema";

const now = () => Date.now();

export const hashRequest = async (value: unknown) => {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const resolvePortalSession = async (
  databaseOrDb: D1Database | ReturnType<typeof drizzle>,
  sessionToken: string,
) => {
  const db = "prepare" in databaseOrDb ? drizzle(databaseOrDb) : databaseOrDb;
  const row = await db
    .select({
      player: playerAccounts,
    })
    .from(portalSessions)
    .innerJoin(playerAccounts, eq(playerAccounts.id, portalSessions.playerAccountId))
    .where(
      and(
        eq(portalSessions.tokenHash, await hashRequest(sessionToken)),
        gt(portalSessions.expiresAt, now()),
        ne(playerAccounts.status, "banned"),
      ),
    )
    .get();
  if (!row) return null;
  return { player: row.player };
};
