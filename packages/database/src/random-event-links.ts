import { inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { achievementChallenges, titleChallenges } from "./schema";
import type { EventImportRow } from "./random-event-import";

type ChallengeLinks = EventImportRow["challengeLinks"];
type Db = ReturnType<typeof drizzle>;

// chunked so a large import cannot exceed the SQLite variable limit.
const d1InChunk = 500;
export const chunked = <T>(items: T[]): T[][] => { const out: T[][] = []; for (let i = 0; i < items.length; i += d1InChunk) out.push(items.slice(i, i + d1InChunk)); return out; };

export const loadEventLinkIndex = async (db: Db, links: ChallengeLinks) => {
  const mapIds = [...new Set(links.filter((link) => link.family === "map").map((link) => link.challengeId))];
  const titleIds = [...new Set(links.filter((link) => link.family === "achievement").map((link) => link.challengeId))];
  const [mapRows, titleRows] = await Promise.all([
    mapIds.length ? Promise.all(chunked(mapIds).map((ids) => db.select({ id: achievementChallenges.id }).from(achievementChallenges).where(inArray(achievementChallenges.id, ids)))).then((parts) => parts.flat()) : Promise.resolve([] as Array<{ id: string }>),
    titleIds.length ? Promise.all(chunked(titleIds).map((ids) => db.select({ id: titleChallenges.id }).from(titleChallenges).where(inArray(titleChallenges.id, ids)))).then((parts) => parts.flat()) : Promise.resolve([] as Array<{ id: string }>),
  ]);
  return { map: new Set(mapRows.map((row) => row.id)), title: new Set(titleRows.map((row) => row.id)) };
};

export const validateEventLinks = async (db: Db, links: ChallengeLinks) => {
  const index = await loadEventLinkIndex(db, links);
  for (const link of links) {
    const found = link.family === "map" ? index.map.has(link.challengeId) : index.title.has(link.challengeId);
    if (!found) throw new Error("CHALLENGE_NOT_FOUND");
  }
};

export const insertLinkStatement = (database: D1Database, eventId: string, link: ChallengeLinks[number]) => database.prepare(link.family === "map" ? "INSERT INTO random_event_map_challenges (event_id,challenge_id) VALUES (?,?)" : "INSERT INTO random_event_title_challenges (event_id,challenge_id) VALUES (?,?)").bind(eventId, link.challengeId);
export const replaceLinkStatements = (database: D1Database, eventId: string, links: ChallengeLinks) => [
  database.prepare("DELETE FROM random_event_map_challenges WHERE event_id = ?").bind(eventId),
  database.prepare("DELETE FROM random_event_title_challenges WHERE event_id = ?").bind(eventId),
  ...links.map((link) => insertLinkStatement(database, eventId, link)),
];
