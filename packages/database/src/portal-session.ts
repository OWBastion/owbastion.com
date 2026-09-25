import { and, eq, gt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { bindings, playerAccounts, qqSessions } from "./schema";

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
      binding: bindings,
      player: playerAccounts,
    })
    .from(qqSessions)
    .innerJoin(
      bindings,
      and(
        eq(bindings.provider, "qq"),
        eq(bindings.memberOpenId, qqSessions.memberOpenId),
        eq(bindings.status, "active"),
      ),
    )
    .innerJoin(
      playerAccounts,
      eq(playerAccounts.id, bindings.playerAccountId),
    )
    .where(
      and(
        eq(qqSessions.tokenHash, await hashRequest(sessionToken)),
        gt(qqSessions.expiresAt, now()),
        ne(playerAccounts.status, "banned"),
      ),
    )
    .get();
  if (!row) return null;
  return { binding: row.binding, player: row.player };
};
