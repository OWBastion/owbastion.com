import { count, desc, eq, and, inArray, isNull, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { randomEventRarityForWeight } from "@owbastion/domain";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminRandomEventBatchRequest, AdminRandomEventVersionListResponse, Challenge, RandomEvent, RandomEventOutcome, RandomEventVersion } from "@owbastion/contracts";
import { effectGlossaryTerms, randomEventImports, randomEventMapChallenges, randomEvents, randomEventTitleChallenges, randomEventVersions } from "./schema";
import { parseEventImport } from "./random-event-import";
import { chunked, insertLinkStatement, loadEventLinkIndex, replaceLinkStatements, validateEventLinks } from "./random-event-links";
import { assertBatchOutcomeUpdate, assertEventOutcomes, groupOutcomesByEvent, loadAllOutcomeRows, loadEventOutcomeInputs, loadEventOutcomes, outcomeInsertStatements, replaceOutcomeStatements, writeEffectTags } from "./random-event-outcomes";
import type { PlatformCache } from "./platform-cache";
type RandomEventPlatformServices = Pick<PlatformServices,
  | "listRandomEvents"
  | "getRandomEvent"
  | "listAdminRandomEventVersions"
  | "updateAdminRandomEventVersion"
  | "createAdminRandomEvent"
  | "updateAdminRandomEvent"
  | "batchUpdateAdminRandomEvents"
  | "archiveAdminRandomEvent"
  | "previewAdminRandomEventImport"
  | "importAdminRandomEvents"
>;

type RandomEventDependencies = {
  now: () => number;
  platformCache: PlatformCache;
  hashRequest: (value: unknown) => Promise<string>;
  replayOrConflict: <T>(db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (db: ReturnType<typeof drizzle>, auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
  publicEventChallenges: (eventId: string) => Promise<Challenge[]>;
  fetchAllPublicChallenges: () => Promise<Challenge[]>;
};

export const createRandomEventServices = (database: D1Database, db: ReturnType<typeof drizzle>, dependencies: RandomEventDependencies) => {
  const { now, platformCache, hashRequest, replayOrConflict, recordIdempotency, recordAudit, publicEventChallenges, fetchAllPublicChallenges } = dependencies;

  const glossary = async () => (await platformCache.cached("catalog", "glossary-terms", () => db.select().from(effectGlossaryTerms))).map((term) => ({ key: term.key, nameZh: term.nameZh, aliases: JSON.parse(term.aliasesJson) as string[], category: term.category, summary: term.summary, definition: term.definition, rules: JSON.parse(term.rulesJson) as string[], sourceVersion: term.sourceVersion }));
  type GlossaryTerm = Awaited<ReturnType<typeof glossary>>[number];
  type EffectAnnotation = { tag: string; term: GlossaryTerm };
  const effectTermLookup = (terms: GlossaryTerm[]) => {
    const byLabel = new Map(terms.flatMap((term) => [term.nameZh, ...term.aliases].map((label) => [label, term] as const)));
    return (tag: string): GlossaryTerm | undefined => byLabel.get(tag);
  };
  const annotateEffectTags = (tags: string[], termForTag: (tag: string) => GlossaryTerm | undefined): EffectAnnotation[] => tags.flatMap((tag) => {
    const term = termForTag(tag);
    return term ? [{ tag, term }] : [];
  });
  const annotateEffects = async (tags: string[]) => annotateEffectTags(tags, effectTermLookup(await glossary()));
  const toRandomEvent = (
    row: typeof randomEvents.$inferSelect,
    effectTags: string[],
    effectAnnotations: EffectAnnotation[],
    challenges: Challenge[],
    outcomes: RandomEventOutcome[],
  ): RandomEvent => ({
    eventId: row.id,
    name: row.name,
    category: row.category,
    rarity: row.rarity,
    description: row.description,
    durationSeconds: row.durationSeconds,
    cooldownSeconds: row.cooldownSeconds,
    weight: row.weight,
    gameVersion: row.gameVersion,
    eventGroup: row.eventGroup,
    effectTags,
    effectAnnotations,
    releaseStatus: row.releaseStatus as RandomEvent["releaseStatus"],
    archived: row.archivedAt !== null,
    challenges,
    outcomes,
  });
  const asRandomEvent = async (row: typeof randomEvents.$inferSelect): Promise<RandomEvent> => {
    const effectTags = JSON.parse(row.effectTagsJson) as string[];
    return toRandomEvent(row, effectTags, await annotateEffects(effectTags), await publicEventChallenges(row.id), await loadEventOutcomes(db, row.id));
  };
  const suspendedEventVersions = async () => new Set((await platformCache.cached("catalog", "suspended-event-versions", () => db.select({ gameVersion: randomEventVersions.gameVersion }).from(randomEventVersions).where(eq(randomEventVersions.availability, "suspended")))).map((row) => row.gameVersion));

  return {
    services: {
      async listRandomEvents(input) {
        const filters = [input.includeArchived ? undefined : isNull(randomEvents.archivedAt), input.status ? eq(randomEvents.releaseStatus, input.status) : input.includeArchived === undefined ? inArray(randomEvents.releaseStatus, ["implemented", "removed"]) : undefined, input.category ? eq(randomEvents.category, input.category) : undefined, input.rarity ? eq(randomEvents.rarity, input.rarity) : undefined, input.query ? like(randomEvents.name, `%${input.query}%`) : undefined].filter(Boolean) as any[];
        const rows = await db.select().from(randomEvents).where(and(...filters)).orderBy(randomEvents.name);
        if (!rows.length) return [];
          // Batch path: 3 parallel queries regardless of event count, then in-memory assembly.
          // Cold-cache cost: O(1) queries instead of O(4N).
          const eventIds = rows.map((row) => row.id);
          const [mapLinks, titleLinks, allChallenges, terms, outcomeRows] = await Promise.all([
            // D1 limits bound SQL parameters. Read the small catalog link tables once
            // and discard links outside the selected public event IDs below.
            platformCache.cached("catalog", "event-map-links:all", () => db.select().from(randomEventMapChallenges)),
            platformCache.cached("catalog", "event-title-links:all", () => db.select().from(randomEventTitleChallenges)),
            fetchAllPublicChallenges(),
            glossary(),
            platformCache.cached("catalog", "event-outcomes:all", () => loadAllOutcomeRows(db)),
          ]);
          const termForTag = effectTermLookup(terms);
          const challengeById = new Map(allChallenges.map((c) => [c.challengeId, c]));
          const challengesByEvent = new Map<string, Challenge[]>(eventIds.map((id) => [id, []]));
          for (const links of [mapLinks, titleLinks]) {
            for (const link of links) {
              const challenge = challengeById.get(link.challengeId);
              if (challenge) challengesByEvent.get(link.eventId)?.push(challenge);
            }
          }
          const outcomesByEvent = groupOutcomesByEvent(outcomeRows);
        return rows.map((row) => {
          const effectTags = JSON.parse(row.effectTagsJson) as string[];
          return toRandomEvent(row, effectTags, annotateEffectTags(effectTags, termForTag), challengesByEvent.get(row.id) ?? [], outcomesByEvent.get(row.id) ?? []);
        });
      },
      async getRandomEvent(input) {
        const row = await db.select().from(randomEvents).where(and(eq(randomEvents.id, input.eventId), input.includeArchived ? undefined : isNull(randomEvents.archivedAt), input.status ? eq(randomEvents.releaseStatus, input.status) : input.includeArchived === undefined ? inArray(randomEvents.releaseStatus, ["implemented", "removed"]) : undefined)).get();
        return row ? asRandomEvent(row) : null;
      },
      async listAdminRandomEventVersions(_auth): Promise<AdminRandomEventVersionListResponse> {
        const rows = await db.select({
          gameVersion: randomEvents.gameVersion,
          eventCount: count(randomEvents.id),
          availability: sql<string>`coalesce(${randomEventVersions.availability}, 'available')`,
          mode: randomEventVersions.mode,
        }).from(randomEvents).leftJoin(randomEventVersions, eq(randomEventVersions.gameVersion, randomEvents.gameVersion))
          .groupBy(randomEvents.gameVersion, randomEventVersions.availability, randomEventVersions.mode)
          .orderBy(desc(randomEvents.gameVersion));
        return { contractVersion: "1", items: rows.map((row) => ({ gameVersion: row.gameVersion, availability: row.availability as RandomEventVersion["availability"], mode: row.mode ?? null, eventCount: Number(row.eventCount) })) };
      },
      async updateAdminRandomEventVersion(input, auth, idempotencyKey): Promise<RandomEventVersion> {
        const operation = "admin.random-event-version.availability";
        const replay = await replayOrConflict<RandomEventVersion>(db, auth.subject, operation, idempotencyKey, input);
        if (replay) return replay;
        const eventCount = Number((await db.select({ count: count(randomEvents.id) }).from(randomEvents).where(eq(randomEvents.gameVersion, input.gameVersion)))[0]?.count ?? 0);
        if (!eventCount) throw new Error("EVENT_VERSION_NOT_FOUND");
        const previous = await db.select().from(randomEventVersions).where(eq(randomEventVersions.gameVersion, input.gameVersion)).get();
        const timestamp = now();
        // The pool's standalone mode is set from that mode, never here.
        const response: RandomEventVersion = { gameVersion: input.gameVersion, availability: input.availability, mode: previous?.mode ?? null, eventCount };
        const requestHash = await hashRequest(input);
        await database.batch([
          database.prepare("INSERT INTO random_event_versions (game_version, availability, suspended_at, suspended_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(game_version) DO UPDATE SET availability = excluded.availability, suspended_at = excluded.suspended_at, suspended_by = excluded.suspended_by, updated_at = excluded.updated_at").bind(input.gameVersion, input.availability, input.availability === "suspended" ? timestamp : null, input.availability === "suspended" ? auth.subject : null, timestamp, timestamp),
          database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, requestHash, JSON.stringify(response), timestamp),
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "random_event_version", input.gameVersion, JSON.stringify({ previousAvailability: previous?.availability ?? "available", availability: input.availability, eventCount }), timestamp),
        ]);
        return response;
      },
      async createAdminRandomEvent(input, auth, idempotencyKey) {
        const replay = await replayOrConflict<RandomEvent>(db, auth.subject, "admin.random-event.create", idempotencyKey, input); if (replay) return replay;
        const outcomes = input.outcomes ?? [];
        assertEventOutcomes(input.category, outcomes);
        await validateEventLinks(db, input.challengeLinks); const timestamp = now(); const eventId = `event.${crypto.randomUUID()}`;
        // One batch keeps the event row, challenge links, and outcome rows atomic.
        await database.batch([
          database.prepare("INSERT INTO random_events (id,name,category,rarity,description,duration_seconds,cooldown_seconds,weight,game_version,event_group,effect_tags_json,release_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId, input.name, input.category, randomEventRarityForWeight(input.weight), input.description, input.durationSeconds, input.cooldownSeconds, input.weight, input.gameVersion, input.eventGroup ?? null, writeEffectTags(input.category, input.effectTags, outcomes), input.releaseStatus, timestamp, timestamp),
          ...input.challengeLinks.map((link) => insertLinkStatement(database, eventId, link)),
          ...outcomeInsertStatements(database, eventId, outcomes),
        ]);
        const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, eventId)).get())!);
        await recordIdempotency(db, auth.subject, "admin.random-event.create", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.create", "random_event", eventId, input); return response;
      },
      async updateAdminRandomEvent(input, auth, idempotencyKey) {
        const replay = await replayOrConflict<RandomEvent>(db, auth.subject, "admin.random-event.update", idempotencyKey, input); if (replay) return replay;
        const existing = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!existing) throw new Error("EVENT_NOT_FOUND");
        // An omitted outcomes field keeps the stored set; a present one replaces it.
        const outcomes = input.outcomes ?? await loadEventOutcomeInputs(db, input.eventId);
        assertEventOutcomes(input.category, outcomes);
        await validateEventLinks(db, input.challengeLinks);
        const sets = ["name = ?", "category = ?", "rarity = ?", "description = ?", "duration_seconds = ?", "cooldown_seconds = ?", "weight = ?", "game_version = ?", "effect_tags_json = ?", "release_status = ?"];
        const values: unknown[] = [input.name, input.category, randomEventRarityForWeight(input.weight), input.description, input.durationSeconds, input.cooldownSeconds, input.weight, input.gameVersion, writeEffectTags(input.category, input.effectTags, outcomes), input.releaseStatus];
        if (input.eventGroup !== undefined) { sets.push("event_group = ?"); values.push(input.eventGroup); }
        await database.batch([
          database.prepare(`UPDATE random_events SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).bind(...values, now(), input.eventId),
          ...replaceLinkStatements(database, input.eventId, input.challengeLinks),
          ...(input.outcomes === undefined ? [] : replaceOutcomeStatements(database, input.eventId, input.outcomes)),
        ]);
        const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get())!); await recordIdempotency(db, auth.subject, "admin.random-event.update", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.update", "random_event", input.eventId, input); return response;
      },
      async batchUpdateAdminRandomEvents(input: AdminRandomEventBatchRequest, auth, idempotencyKey): Promise<RandomEvent[]> {
        const operation = "admin.random-event.batch-update";
        const replay = await replayOrConflict<RandomEvent[]>(db, auth.subject, operation, idempotencyKey, input); if (replay) return replay;
        const ids = input.updates.map((update) => update.eventId);
        const existing = await db.select({ id: randomEvents.id, category: randomEvents.category }).from(randomEvents).where(inArray(randomEvents.id, ids));
        if (existing.length !== ids.length) throw new Error("EVENT_NOT_FOUND");
        await assertBatchOutcomeUpdate(db, input.updates, existing);
        const timestamp = now();
        const columns: Record<string, string> = { name: "name", category: "category", description: "description", durationSeconds: "duration_seconds", cooldownSeconds: "cooldown_seconds", weight: "weight", gameVersion: "game_version", eventGroup: "event_group", releaseStatus: "release_status" };
        const statements = input.updates.map(({ eventId, ...patch }) => {
          const sets: string[] = []; const values: unknown[] = [];
          for (const [field, column] of Object.entries(columns)) { const value = (patch as Record<string, unknown>)[field]; if (value === undefined) continue; sets.push(`${column} = ?`); values.push(value); }
          if (patch.weight !== undefined) { sets.push("rarity = ?"); values.push(randomEventRarityForWeight(patch.weight)); }
          if (patch.effectTags !== undefined) { sets.push("effect_tags_json = ?"); values.push(JSON.stringify([...new Set(patch.effectTags)])); }
          sets.push("updated_at = ?"); values.push(timestamp);
          return database.prepare(`UPDATE random_events SET ${sets.join(", ")} WHERE id = ?`).bind(...values, eventId);
        });
        statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "random_event", "batch", JSON.stringify({ eventCount: ids.length, updates: input.updates }), timestamp));
        await database.batch(statements);
        const rows = await db.select().from(randomEvents).where(inArray(randomEvents.id, ids));
        const byId = new globalThis.Map(rows.map((row) => [row.id, row]));
        const response = await Promise.all(ids.map((id) => asRandomEvent(byId.get(id)!)));
        await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response); return response;
      },
      async archiveAdminRandomEvent(input, auth, idempotencyKey) {
        const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.random-event.archive", idempotencyKey, input); if (replay) return;
        const event = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!event) throw new Error("EVENT_NOT_FOUND"); await db.update(randomEvents).set({ archivedAt: now(), archivedBy: auth.subject, updatedAt: now() }).where(eq(randomEvents.id, input.eventId)); await recordIdempotency(db, auth.subject, "admin.random-event.archive", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.random-event.archive", "random_event", input.eventId, {});
      },
      async previewAdminRandomEventImport(input) {
        const parsed = await parseEventImport(input, hashRequest); for (const item of parsed.rows) { try { await validateEventLinks(db, item.challengeLinks); } catch { parsed.errors.push({ row: 0, message: `未知挑战关联：${item.name}` }); } }
        return { sourceHash: parsed.sourceHash, validRowCount: parsed.errors.length ? 0 : parsed.rows.length, errors: parsed.errors, rows: parsed.rows.slice(0, 20).map((row) => ({ name: row.name, category: row.category, releaseStatus: row.releaseStatus })) };
      },
      async importAdminRandomEvents(input, auth, idempotencyKey) {
        const replay = await replayOrConflict<{ importedCount: number }>(db, auth.subject, "admin.random-event.import", idempotencyKey, input); if (replay) return replay;
        const parsed = await parseEventImport(input, hashRequest); if (parsed.errors.length) throw new Error("EVENT_IMPORT_INVALID"); const duplicate = await db.select().from(randomEventImports).where(eq(randomEventImports.sourceHash, parsed.sourceHash)).get(); if (duplicate) throw new Error("EVENT_IMPORT_DUPLICATE");
        // Validate every row's links and name conflicts up front: the import
        // aborts on the first error, so a single batched membership check per
        // family plus one name lookup preserves semantics with O(1) queries
        // instead of O(rows × links).
        const importLinkIndex = await loadEventLinkIndex(db, parsed.rows.flatMap((item) => item.challengeLinks));
        const importNames = [...new Set(parsed.rows.map((item) => item.name))];
        const existingNames = new Set((await Promise.all(chunked(importNames).map((names) => db.select({ name: randomEvents.name }).from(randomEvents).where(inArray(randomEvents.name, names))))).flat().map((row) => row.name));
        for (const item of parsed.rows) { for (const link of item.challengeLinks) { if (!(link.family === "map" ? importLinkIndex.map.has(link.challengeId) : importLinkIndex.title.has(link.challengeId))) throw new Error("CHALLENGE_NOT_FOUND"); } if (existingNames.has(item.name)) throw new Error("EVENT_IMPORT_NAME_CONFLICT"); }
        const timestamp = now(); const response = { importedCount: parsed.rows.length }; const statements: D1PreparedStatement[] = [];
        for (const item of parsed.rows) { const eventId = `event.${crypto.randomUUID()}`; statements.push(database.prepare("INSERT INTO random_events (id,name,category,rarity,description,duration_seconds,cooldown_seconds,weight,game_version,event_group,effect_tags_json,release_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId, item.name, item.category, randomEventRarityForWeight(item.weight), item.description, item.durationSeconds, item.cooldownSeconds, item.weight, item.gameVersion, item.eventGroup ?? null, JSON.stringify(item.effectTags), item.releaseStatus, timestamp, timestamp)); for (const link of item.challengeLinks) statements.push(database.prepare(link.family === "map" ? "INSERT INTO random_event_map_challenges (event_id,challenge_id) VALUES (?,?)" : "INSERT INTO random_event_title_challenges (event_id,challenge_id) VALUES (?,?)").bind(eventId, link.challengeId)); }
        statements.push(database.prepare("INSERT INTO random_event_imports (id,source_hash,file_name,row_count,imported_by,imported_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), parsed.sourceHash, input.fileName, parsed.rows.length, auth.subject, timestamp)); statements.push(database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)").bind(`${auth.subject}:admin.random-event.import:${idempotencyKey}`, auth.subject, "admin.random-event.import", await hashRequest(input), JSON.stringify(response), timestamp)); statements.push(database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, "admin.random-event.import", "random_event_import", parsed.sourceHash, JSON.stringify({ fileName: input.fileName, importedCount: parsed.rows.length }), timestamp));
        await database.batch(statements); return response;
      },
    } satisfies RandomEventPlatformServices,
    suspendedEventVersions,
  };
};
