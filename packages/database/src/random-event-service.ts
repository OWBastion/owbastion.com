import { count, desc, eq, and, inArray, isNull, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { randomEventRarityForWeight } from "@owbastion/domain";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminRandomEventCreateRequest, AdminRandomEventImportRequest, AdminRandomEventVersionListResponse, Challenge, RandomEvent, RandomEventVersion } from "@owbastion/contracts";
import { achievementChallenges, auditEvents, effectGlossaryTerms, idempotencyKeys, randomEventImports, randomEventMapChallenges, randomEvents, randomEventTitleChallenges, randomEventVersions, titleChallenges } from "./schema";

type EventImportRow = Omit<AdminRandomEventCreateRequest, "contractVersion">;
type RandomEventPlatformServices = Pick<PlatformServices,
  | "listRandomEvents"
  | "getRandomEvent"
  | "listAdminRandomEventVersions"
  | "updateAdminRandomEventVersion"
  | "createAdminRandomEvent"
  | "updateAdminRandomEvent"
  | "archiveAdminRandomEvent"
  | "previewAdminRandomEventImport"
  | "importAdminRandomEvents"
>;

type RandomEventDependencies = {
  now: () => number;
  hashRequest: (value: unknown) => Promise<string>;
  replayOrConflict: <T>(db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (db: ReturnType<typeof drizzle>, auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
  publicEventChallenges: (eventId: string) => Promise<Challenge[]>;
  fetchAllPublicChallenges: () => Promise<Challenge[]>;
};

export const createRandomEventServices = (database: D1Database, db: ReturnType<typeof drizzle>, dependencies: RandomEventDependencies) => {
  const { now, hashRequest, replayOrConflict, recordIdempotency, recordAudit, publicEventChallenges, fetchAllPublicChallenges } = dependencies;
  const eventImportHeaders = ["事件名称", "事件效果", "事件类别", "稀有度级别", "类别概率", "内置冷却", "持续时间（秒）", "权重", "组内总权重", "组内个数", "单次失败率(Q)", "保底触发率", "最终出现概率", "全局出现概率", "版本", "效果类型", "事件状态"];
  const parseCsv = (csv: string) => {
    const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
    for (let index = 0; index < csv.length; index += 1) { const char = csv[index]; const next = csv[index + 1]; if (quoted) { if (char === '"' && next === '"') { field += '"'; index += 1; } else if (char === '"') quoted = false; else field += char; } else if (char === '"') quoted = true; else if (char === ",") { row.push(field.trim()); field = ""; } else if (char === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; } else if (char !== "\r") field += char; }
    if (quoted) throw new Error("CSV_QUOTE_INVALID"); if (field || row.length) { row.push(field.trim()); rows.push(row); } return rows;
  };
  const parseEventImport = async (input: AdminRandomEventImportRequest) => {
    const rows = parseCsv(input.csv.replace(/^\uFEFF/, "")); const errors: Array<{ row: number; message: string }> = [];
    if (!rows.length || eventImportHeaders.some((header, index) => rows[0][index] !== header)) return { sourceHash: await hashRequest(input.csv), rows: [] as EventImportRow[], errors: [{ row: 1, message: `表头必须为：${eventImportHeaders.join("、")}` }] };
    const parsed: EventImportRow[] = [];
    rows.slice(1).forEach((values, index) => { const rowNumber = index + 2; if (!values.some(Boolean)) return; const number = (value: string) => value === "" ? null : Number(value); const status = values[16] === "已实装" ? "implemented" : values[16] === "已移除" ? "removed" : values[16] === "开发中" ? "development" : ""; const candidate = { name: values[0], description: values[1], category: values[2], cooldownSeconds: number(values[5]), durationSeconds: number(values[6]), weight: number(values[7]), gameVersion: values[14], effectTags: values[15] ? values[15].split(/[、,]/).map((tag) => tag.trim()).filter(Boolean) : [], releaseStatus: status, challengeLinks: [] }; const valid = candidate.name && candidate.category && candidate.description && candidate.gameVersion && status && [candidate.cooldownSeconds, candidate.durationSeconds, candidate.weight].every((value) => value === null || Number.isFinite(value) && value >= 0) && Number.isInteger(candidate.durationSeconds ?? 0); if (!valid) errors.push({ row: rowNumber, message: "字段缺失、状态或数值格式无效" }); else parsed.push(candidate as EventImportRow); });
    const duplicates = new Set<string>(); parsed.forEach((item) => { if (duplicates.has(item.name)) errors.push({ row: rows.findIndex((values) => values[0] === item.name) + 1, message: "文件内事件名称重复" }); duplicates.add(item.name); });
    return { sourceHash: await hashRequest(input.csv), rows: parsed, errors };
  };

  const glossary = async () => (await db.select().from(effectGlossaryTerms)).map((term) => ({ key: term.key, nameZh: term.nameZh, aliases: JSON.parse(term.aliasesJson) as string[], category: term.category, summary: term.summary, definition: term.definition, rules: JSON.parse(term.rulesJson) as string[], sourceVersion: term.sourceVersion }));
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
    effectTags,
    effectAnnotations,
    releaseStatus: row.releaseStatus as RandomEvent["releaseStatus"],
    archived: row.archivedAt !== null,
    challenges,
  });
  const asRandomEvent = async (row: typeof randomEvents.$inferSelect): Promise<RandomEvent> => {
    const effectTags = JSON.parse(row.effectTagsJson) as string[];
    return toRandomEvent(row, effectTags, await annotateEffects(effectTags), await publicEventChallenges(row.id));
  };
  const suspendedEventVersions = async () => new Set((await db.select({ gameVersion: randomEventVersions.gameVersion }).from(randomEventVersions).where(eq(randomEventVersions.availability, "suspended"))).map((row) => row.gameVersion));
  const validateEventLinks = async (links: EventImportRow["challengeLinks"]) => { for (const link of links) { const table = link.family === "map" ? achievementChallenges : titleChallenges; const found = await db.select({ id: table.id }).from(table).where(eq(table.id, link.challengeId)).get(); if (!found) throw new Error("CHALLENGE_NOT_FOUND"); } };
  const replaceEventLinks = async (eventId: string, links: EventImportRow["challengeLinks"]) => { await db.delete(randomEventMapChallenges).where(eq(randomEventMapChallenges.eventId, eventId)); await db.delete(randomEventTitleChallenges).where(eq(randomEventTitleChallenges.eventId, eventId)); const mapsLinks = links.filter((link) => link.family === "map"); const titleLinks = links.filter((link) => link.family === "achievement"); if (mapsLinks.length) await db.insert(randomEventMapChallenges).values(mapsLinks.map((link) => ({ eventId, challengeId: link.challengeId }))); if (titleLinks.length) await db.insert(randomEventTitleChallenges).values(titleLinks.map((link) => ({ eventId, challengeId: link.challengeId }))); };

  return {
    services: {
      async listRandomEvents(input) {
        const filters = [input.includeArchived ? undefined : isNull(randomEvents.archivedAt), input.status ? eq(randomEvents.releaseStatus, input.status) : input.includeArchived === undefined ? inArray(randomEvents.releaseStatus, ["implemented", "removed"]) : undefined, input.category ? eq(randomEvents.category, input.category) : undefined, input.rarity ? eq(randomEvents.rarity, input.rarity) : undefined, input.query ? like(randomEvents.name, `%${input.query}%`) : undefined].filter(Boolean) as any[];
        const rows = await db.select().from(randomEvents).where(and(...filters)).orderBy(randomEvents.name);
        if (!rows.length) return [];
          // Batch path: 3 parallel queries regardless of event count, then in-memory assembly.
          // Cold-cache cost: O(1) queries instead of O(4N).
          const eventIds = rows.map((row) => row.id);
          const [mapLinks, titleLinks, allChallenges, terms] = await Promise.all([
            // D1 limits bound SQL parameters. Read the small catalog link tables once
            // and discard links outside the selected public event IDs below.
            db.select().from(randomEventMapChallenges),
            db.select().from(randomEventTitleChallenges),
            fetchAllPublicChallenges(),
            glossary(),
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
        return rows.map((row) => {
          const effectTags = JSON.parse(row.effectTagsJson) as string[];
          return toRandomEvent(row, effectTags, annotateEffectTags(effectTags, termForTag), challengesByEvent.get(row.id) ?? []);
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
        }).from(randomEvents).leftJoin(randomEventVersions, eq(randomEventVersions.gameVersion, randomEvents.gameVersion))
          .groupBy(randomEvents.gameVersion, randomEventVersions.availability)
          .orderBy(desc(randomEvents.gameVersion));
        return { contractVersion: "1", items: rows.map((row) => ({ gameVersion: row.gameVersion, availability: row.availability as RandomEventVersion["availability"], eventCount: Number(row.eventCount) })) };
      },
      async updateAdminRandomEventVersion(input, auth, idempotencyKey): Promise<RandomEventVersion> {
        const operation = "admin.random-event-version.availability";
        const replay = await replayOrConflict<RandomEventVersion>(db, auth.subject, operation, idempotencyKey, input);
        if (replay) return replay;
        const eventCount = Number((await db.select({ count: count(randomEvents.id) }).from(randomEvents).where(eq(randomEvents.gameVersion, input.gameVersion)))[0]?.count ?? 0);
        if (!eventCount) throw new Error("EVENT_VERSION_NOT_FOUND");
        const previous = await db.select().from(randomEventVersions).where(eq(randomEventVersions.gameVersion, input.gameVersion)).get();
        const timestamp = now();
        const response: RandomEventVersion = { gameVersion: input.gameVersion, availability: input.availability, eventCount };
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
        await validateEventLinks(input.challengeLinks); const timestamp = now(); const eventId = `event.${crypto.randomUUID()}`;
        await db.insert(randomEvents).values({ id: eventId, name: input.name, category: input.category, rarity: randomEventRarityForWeight(input.weight), description: input.description, durationSeconds: input.durationSeconds, cooldownSeconds: input.cooldownSeconds, weight: input.weight, gameVersion: input.gameVersion, effectTagsJson: JSON.stringify([...new Set(input.effectTags)]), releaseStatus: input.releaseStatus, createdAt: timestamp, updatedAt: timestamp });
        await replaceEventLinks(eventId, input.challengeLinks); const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, eventId)).get())!);
        await recordIdempotency(db, auth.subject, "admin.random-event.create", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.create", "random_event", eventId, input); return response;
      },
      async updateAdminRandomEvent(input, auth, idempotencyKey) {
        const replay = await replayOrConflict<RandomEvent>(db, auth.subject, "admin.random-event.update", idempotencyKey, input); if (replay) return replay;
        const existing = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!existing) throw new Error("EVENT_NOT_FOUND"); await validateEventLinks(input.challengeLinks);
        await db.update(randomEvents).set({ name: input.name, category: input.category, rarity: randomEventRarityForWeight(input.weight), description: input.description, durationSeconds: input.durationSeconds, cooldownSeconds: input.cooldownSeconds, weight: input.weight, gameVersion: input.gameVersion, effectTagsJson: JSON.stringify([...new Set(input.effectTags)]), releaseStatus: input.releaseStatus, updatedAt: now() }).where(eq(randomEvents.id, input.eventId)); await replaceEventLinks(input.eventId, input.challengeLinks);
        const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get())!); await recordIdempotency(db, auth.subject, "admin.random-event.update", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.update", "random_event", input.eventId, input); return response;
      },
      async archiveAdminRandomEvent(input, auth, idempotencyKey) {
        const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.random-event.archive", idempotencyKey, input); if (replay) return;
        const event = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!event) throw new Error("EVENT_NOT_FOUND"); await db.update(randomEvents).set({ archivedAt: now(), archivedBy: auth.subject, updatedAt: now() }).where(eq(randomEvents.id, input.eventId)); await recordIdempotency(db, auth.subject, "admin.random-event.archive", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.random-event.archive", "random_event", input.eventId, {});
      },
      async previewAdminRandomEventImport(input) {
        const parsed = await parseEventImport(input); for (const item of parsed.rows) { try { await validateEventLinks(item.challengeLinks); } catch { parsed.errors.push({ row: 0, message: `未知挑战关联：${item.name}` }); } }
        return { sourceHash: parsed.sourceHash, validRowCount: parsed.errors.length ? 0 : parsed.rows.length, errors: parsed.errors, rows: parsed.rows.slice(0, 20).map((row) => ({ name: row.name, category: row.category, releaseStatus: row.releaseStatus })) };
      },
      async importAdminRandomEvents(input, auth, idempotencyKey) {
        const replay = await replayOrConflict<{ importedCount: number }>(db, auth.subject, "admin.random-event.import", idempotencyKey, input); if (replay) return replay;
        const parsed = await parseEventImport(input); if (parsed.errors.length) throw new Error("EVENT_IMPORT_INVALID"); const duplicate = await db.select().from(randomEventImports).where(eq(randomEventImports.sourceHash, parsed.sourceHash)).get(); if (duplicate) throw new Error("EVENT_IMPORT_DUPLICATE");
        for (const item of parsed.rows) { await validateEventLinks(item.challengeLinks); const exists = await db.select({ id: randomEvents.id }).from(randomEvents).where(eq(randomEvents.name, item.name)).get(); if (exists) throw new Error("EVENT_IMPORT_NAME_CONFLICT"); }
        const timestamp = now(); const response = { importedCount: parsed.rows.length }; const statements: D1PreparedStatement[] = [];
        for (const item of parsed.rows) { const eventId = `event.${crypto.randomUUID()}`; statements.push(database.prepare("INSERT INTO random_events (id,name,category,rarity,description,duration_seconds,cooldown_seconds,weight,game_version,effect_tags_json,release_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId, item.name, item.category, randomEventRarityForWeight(item.weight), item.description, item.durationSeconds, item.cooldownSeconds, item.weight, item.gameVersion, JSON.stringify(item.effectTags), item.releaseStatus, timestamp, timestamp)); for (const link of item.challengeLinks) statements.push(database.prepare(link.family === "map" ? "INSERT INTO random_event_map_challenges (event_id,challenge_id) VALUES (?,?)" : "INSERT INTO random_event_title_challenges (event_id,challenge_id) VALUES (?,?)").bind(eventId, link.challengeId)); }
        statements.push(database.prepare("INSERT INTO random_event_imports (id,source_hash,file_name,row_count,imported_by,imported_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), parsed.sourceHash, input.fileName, parsed.rows.length, auth.subject, timestamp)); statements.push(database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)").bind(`${auth.subject}:admin.random-event.import:${idempotencyKey}`, auth.subject, "admin.random-event.import", await hashRequest(input), JSON.stringify(response), timestamp)); statements.push(database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, "admin.random-event.import", "random_event_import", parsed.sourceHash, JSON.stringify({ fileName: input.fileName, importedCount: parsed.rows.length }), timestamp));
        await database.batch(statements); return response;
      },
    } satisfies RandomEventPlatformServices,
    suspendedEventVersions,
  };
};
