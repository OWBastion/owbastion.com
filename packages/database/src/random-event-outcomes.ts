import { eq, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/d1";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { randomEventCompositeCategory, randomEventOutcomeEffectTags, randomEventOutcomesValid } from "@owbastion/domain";
import type { AdminRandomEventBatchRequest, RandomEventOutcome, RandomEventOutcomeInput } from "@owbastion/contracts";
import { randomEvents } from "./schema";

export const randomEventOutcomes = sqliteTable("random_event_outcomes", { eventId: text("event_id").notNull().references(() => randomEvents.id), position: integer("position").notNull(), name: text("name").notNull(), polarity: text("polarity").notNull(), description: text("description").notNull(), effectTagsJson: text("effect_tags_json").notNull().default("[]") }, (table) => ({ primary: primaryKey({ columns: [table.eventId, table.position] }) }));

type OutcomeRow = typeof randomEventOutcomes.$inferSelect;
type Db = ReturnType<typeof drizzle>;

export const outcomeInput = (row: OutcomeRow): RandomEventOutcomeInput => ({ name: row.name, polarity: row.polarity as RandomEventOutcomeInput["polarity"], description: row.description, effectTags: JSON.parse(row.effectTagsJson) as string[] });
export const toOutcome = (row: OutcomeRow): RandomEventOutcome => ({ position: row.position, ...outcomeInput(row) });
export const loadEventOutcomes = async (db: Db, eventId: string) => (await db.select().from(randomEventOutcomes).where(eq(randomEventOutcomes.eventId, eventId)).orderBy(randomEventOutcomes.position)).map(toOutcome);
export const loadEventOutcomeInputs = async (db: Db, eventId: string) => (await db.select().from(randomEventOutcomes).where(eq(randomEventOutcomes.eventId, eventId)).orderBy(randomEventOutcomes.position)).map(outcomeInput);
export const loadAllOutcomeRows = (db: Db) => db.select().from(randomEventOutcomes).orderBy(randomEventOutcomes.eventId, randomEventOutcomes.position);

export const groupOutcomesByEvent = (rows: OutcomeRow[]) => {
  const byEvent = new Map<string, RandomEventOutcome[]>();
  for (const row of rows) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push(toOutcome(row));
    byEvent.set(row.eventId, list);
  }
  return byEvent;
};

const outcomeInsertStatement = (database: D1Database, eventId: string, outcome: RandomEventOutcomeInput, position: number) =>
  database.prepare("INSERT INTO random_event_outcomes (event_id,position,name,polarity,description,effect_tags_json) VALUES (?,?,?,?,?,?)").bind(eventId, position, outcome.name, outcome.polarity, outcome.description, JSON.stringify(outcome.effectTags));
export const outcomeInsertStatements = (database: D1Database, eventId: string, outcomes: RandomEventOutcomeInput[]) => outcomes.map((outcome, position) => outcomeInsertStatement(database, eventId, outcome, position));
export const replaceOutcomeStatements = (database: D1Database, eventId: string, outcomes: RandomEventOutcomeInput[]) => [
  database.prepare("DELETE FROM random_event_outcomes WHERE event_id = ?").bind(eventId),
  ...outcomeInsertStatements(database, eventId, outcomes),
];

// A composite event's stored tags are the union of its outcomes' tags; other
// categories take the request's tags.
export const writeEffectTags = (category: string, effectTags: string[], outcomes: RandomEventOutcomeInput[]) => JSON.stringify([...new Set(category === randomEventCompositeCategory ? randomEventOutcomeEffectTags(outcomes) : effectTags)]);

export const assertEventOutcomes = (category: string, outcomes: RandomEventOutcomeInput[]) => {
  if (!randomEventOutcomesValid(category, outcomes)) throw new Error("EVENT_OUTCOMES_INVALID");
};

// A batch update cannot change outcomes: a category move to or from 复合 must
// not strand the stored outcome set, and effectTags cannot overwrite a
// composite event's outcome-derived union.
export const assertBatchOutcomeUpdate = async (db: Db, updates: AdminRandomEventBatchRequest["updates"], existing: Array<{ id: string; category: string }>) => {
  const patched = updates.filter((update) => update.category !== undefined || update.effectTags !== undefined);
  if (!patched.length) return;
  const polarities = new Map<string, string[]>();
  for (const row of await db.select({ eventId: randomEventOutcomes.eventId, polarity: randomEventOutcomes.polarity }).from(randomEventOutcomes).where(inArray(randomEventOutcomes.eventId, updates.map((update) => update.eventId)))) {
    polarities.set(row.eventId, [...(polarities.get(row.eventId) ?? []), row.polarity]);
  }
  const currentCategory = new Map(existing.map((row) => [row.id, row.category]));
  for (const update of patched) {
    const category = update.category ?? currentCategory.get(update.eventId)!;
    const stored = (polarities.get(update.eventId) ?? []).map((polarity) => ({ polarity: polarity as RandomEventOutcomeInput["polarity"] }));
    if (!randomEventOutcomesValid(category, stored) || (update.effectTags !== undefined && category === randomEventCompositeCategory)) throw new Error("EVENT_OUTCOMES_INVALID");
  }
};
