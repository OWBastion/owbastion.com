import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { hashRequest } from "./portal-session";
import { achievementChallenges, challenges, mapTitleRuleCompat, mapTitleRules, titleCatalog, titleChallenges } from "./schema";

type CanonicalChallengeSnapshot = {
  challengeId?: string;
  ruleId: string;
  titleKey: string;
  mapId: string | null;
  gameplayRevisionId: string | null;
  mapVariant: "classic" | null;
  condition: string;
  startsAt: number | null;
  endsAt: number | null;
};

export type CanonicalChallengeInput = {
  snapshot: CanonicalChallengeSnapshot;
  timestamp: number;
};

type CanonicalChallengeRow = typeof challenges.$inferSelect;

export type CanonicalChallengePlan = {
  row: CanonicalChallengeRow;
  archiveLegacyId: string | null;
  insert: boolean;
};

type CanonicalChallengeSource = {
  family: "title_challenge" | "map_challenge" | "map_title_rule";
  sourceId: string;
};

export type CanonicalChallengeOverlay = {
  rows: globalThis.Map<string, CanonicalChallengeRow>;
  archived: Set<string>;
};

export type CanonicalChallengeResolver = {
  resolvePlans: (plans: CanonicalChallengePlan[]) => Promise<string[]>;
  overlay: CanonicalChallengeOverlay | null;
};

export const createCanonicalChallengeServices = (db: ReturnType<typeof drizzle>) => {
  const canonicalChallengeTerms = (
    snapshot: CanonicalChallengeSnapshot,
    family: CanonicalChallengeSource["family"],
    rule?: Pick<typeof mapTitleRules.$inferSelect, "kind"> | null,
    mapChallenge?: Pick<typeof achievementChallenges.$inferSelect, "difficulty" | "type"> | null,
    titleChallenge?: Pick<typeof titleChallenges.$inferSelect, "startsAt" | "endsAt"> | null,
  ) => {
    const conditions: Array<Record<string, string>> = [];
    if (family === "title_challenge") {
      conditions.push({ type: "achievement_title", titleKey: snapshot.titleKey });
      if (snapshot.mapId) conditions.push({ type: "map", mapId: snapshot.mapId });
      if (snapshot.mapVariant === "classic") conditions.push({ type: "map_variant", variant: "classic" });
    } else if (snapshot.mapId) {
      conditions.push({ type: "map", mapId: snapshot.mapId });
      conditions.push({ type: "completed" });
      const difficulty = rule?.kind.toLocaleLowerCase() === "conqueror" ? "传奇"
        : ["dominator", "pioneer"].includes(rule?.kind.toLocaleLowerCase() ?? "") ? "地狱"
          : mapChallenge?.difficulty ?? null;
      if (difficulty) conditions.push({ type: "difficulty_at_least", difficulty });
      if (snapshot.mapVariant === "classic" || mapChallenge?.type === "classic_completion") conditions.push({ type: "map_variant", variant: "classic" });
    }
    const { condition } = snapshot;
    const startsAt = snapshot.startsAt ?? titleChallenge?.startsAt ?? null;
    const endsAt = snapshot.endsAt ?? titleChallenge?.endsAt ?? null;
    return { conditions, conditionsJson: JSON.stringify({ operator: "and", conditions }), condition, startsAt, endsAt };
  };
  const canonicalChallengeInsertPlan = (
    input: CanonicalChallengeInput,
    source: Pick<CanonicalChallengeSource, "family" | "sourceId">,
    ruleVersion: string,
    terms: ReturnType<typeof canonicalChallengeTerms>,
    legacy?: CanonicalChallengeRow,
  ): CanonicalChallengePlan => ({
    row: {
      id: `legacy:${source.family}:${source.sourceId}:${input.snapshot.mapId ?? ""}:${input.snapshot.gameplayRevisionId ?? ""}:${ruleVersion.slice(0, 16)}`,
      sourceFamily: source.family,
      sourceId: source.sourceId,
      titleKey: input.snapshot.titleKey,
      ruleVersion,
      mapId: input.snapshot.mapId,
      gameplayRevisionId: input.snapshot.gameplayRevisionId,
      status: "active",
      manual: 0,
      publicCondition: 1,
      conditionOperator: "and",
      conditionsJson: terms.conditionsJson,
      condition: terms.condition,
      startsAt: terms.startsAt,
      endsAt: terms.endsAt,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    },
    archiveLegacyId: legacy?.id ?? null,
    insert: true,
  });

  // Plans canonical Challenges for eligible auto-match snapshots with bulk-prefetched lookups.
  const batchPlanCanonicalChallenges = async (inputs: CanonicalChallengeInput[]): Promise<CanonicalChallengePlan[]> => {
    const compatRuleIds = [...new Set(inputs.map(({ snapshot }) => snapshot.ruleId)
      .filter((ruleId) => !ruleId.startsWith("title-challenge:") && !ruleId.startsWith("challenge:")))];
    const compatRows = compatRuleIds.length ? await db.select().from(mapTitleRuleCompat).where(sql`${mapTitleRuleCompat.ruleId} IN (SELECT value FROM json_each(${JSON.stringify(compatRuleIds)}))`) : [];
    const compatByRuleMap = new globalThis.Map(compatRows.map((row) => [`${row.ruleId}:${row.mapId}`, row.legacyChallengeId]));

    type Identified = { input: CanonicalChallengeInput; family: CanonicalChallengeSource["family"]; sourceId: string; ruleId: string };
    const identified: Identified[] = inputs.map((input) => {
      const { snapshot } = input;
      if (snapshot.ruleId.startsWith("title-challenge:")) {
        return { input, ruleId: snapshot.ruleId, family: "title_challenge", sourceId: snapshot.challengeId ?? snapshot.ruleId.slice("title-challenge:".length) };
      }
      if (snapshot.ruleId.startsWith("challenge:")) {
        return { input, ruleId: snapshot.ruleId, family: "map_challenge", sourceId: snapshot.challengeId ?? snapshot.ruleId.slice("challenge:".length) };
      }
      const sourceId = (snapshot.mapId ? compatByRuleMap.get(`${snapshot.ruleId}:${snapshot.mapId}`) : null) ?? snapshot.ruleId;
      return { input, ruleId: snapshot.ruleId, family: "map_title_rule", sourceId };
    });

    const titleKeys = [...new Set(identified.map(({ input }) => input.snapshot.titleKey))];
    const ruleIds = [...new Set(identified.filter(({ family }) => family === "map_title_rule").map(({ ruleId }) => ruleId))];
    const mapChallengeSourceIds = [...new Set(identified.filter(({ family }) => family === "map_challenge").map(({ sourceId }) => sourceId))];
    const titleChallengeSourceIds = [...new Set(identified.filter(({ family }) => family === "title_challenge").map(({ sourceId }) => sourceId))];
    const allSourceIds = [...new Set(identified.map(({ sourceId }) => sourceId))];

    const [titleRows, ruleRows, mapChallengeRows, titleChallengeRows, challengeRows] = await Promise.all([
      titleKeys.length ? db.select({ key: titleCatalog.key }).from(titleCatalog).where(sql`${titleCatalog.key} IN (SELECT value FROM json_each(${JSON.stringify(titleKeys)}))`) : Promise.resolve([]),
      ruleIds.length ? db.select({ id: mapTitleRules.id, kind: mapTitleRules.kind }).from(mapTitleRules).where(sql`${mapTitleRules.id} IN (SELECT value FROM json_each(${JSON.stringify(ruleIds)}))`) : Promise.resolve([]),
      mapChallengeSourceIds.length ? db.select({ id: achievementChallenges.id, difficulty: achievementChallenges.difficulty, type: achievementChallenges.type }).from(achievementChallenges).where(sql`${achievementChallenges.id} IN (SELECT value FROM json_each(${JSON.stringify(mapChallengeSourceIds)}))`) : Promise.resolve([]),
      titleChallengeSourceIds.length ? db.select({ id: titleChallenges.id, startsAt: titleChallenges.startsAt, endsAt: titleChallenges.endsAt }).from(titleChallenges).where(sql`${titleChallenges.id} IN (SELECT value FROM json_each(${JSON.stringify(titleChallengeSourceIds)}))`) : Promise.resolve([]),
      allSourceIds.length ? db.select().from(challenges).where(sql`${challenges.sourceId} IN (SELECT value FROM json_each(${JSON.stringify(allSourceIds)}))`) : Promise.resolve([]),
    ]);

    const titleKeySet = new Set(titleRows.map((row) => row.key));
    const ruleById = new globalThis.Map(ruleRows.map((row) => [row.id, row]));
    const mapChallengeById = new globalThis.Map(mapChallengeRows.map((row) => [row.id, row]));
    const titleChallengeById = new globalThis.Map(titleChallengeRows.map((row) => [row.id, row]));

    const ruleVersions = await Promise.all(identified.map(({ input, family, sourceId, ruleId }) => {
      const rule = family === "map_title_rule" ? ruleById.get(ruleId) : null;
      const mapChallenge = family === "map_challenge" ? mapChallengeById.get(sourceId) : null;
      const titleChallenge = family === "title_challenge" ? titleChallengeById.get(sourceId) : null;
      const terms = canonicalChallengeTerms(input.snapshot, family, rule, mapChallenge, titleChallenge);
      return hashRequest({ conditions: terms.conditions, condition: terms.condition, startsAt: terms.startsAt, endsAt: terms.endsAt })
        .then((ruleVersion) => ({ terms, ruleVersion }));
    }));

    return identified.map(({ input, family, sourceId }, i) => {
      const snapshot = input.snapshot;
      if (!titleKeySet.has(snapshot.titleKey)) throw new Error("TITLE_NOT_FOUND");
      const { terms, ruleVersion } = ruleVersions[i];
      const { conditionsJson, condition, startsAt, endsAt } = terms;
      const matches = challengeRows.filter((row) =>
        row.sourceFamily === family
        && row.sourceId === sourceId
        && row.titleKey === snapshot.titleKey
        && (row.mapId ?? null) === (snapshot.mapId ?? null)
        && (row.gameplayRevisionId ?? null) === (snapshot.gameplayRevisionId ?? null));
      const exact = matches.find((row) => row.ruleVersion === ruleVersion);
      if (exact) return { row: exact, archiveLegacyId: null, insert: false };
      const legacy = matches.find((row) => row.ruleVersion === "legacy");
      if (legacy && legacy.conditionsJson === conditionsJson && legacy.condition === condition && legacy.startsAt === startsAt && legacy.endsAt === endsAt) {
        return { row: legacy, archiveLegacyId: null, insert: false };
      }
      return canonicalChallengeInsertPlan(input, { family, sourceId }, ruleVersion, terms, legacy);
    });
  };

  const materializeCanonicalChallenge = async (plan: CanonicalChallengePlan) => {
    if (!plan.insert) return plan.row.id;
    const { row } = plan;
    if (plan.archiveLegacyId) await db.update(challenges).set({ status: "archived", updatedAt: row.updatedAt }).where(eq(challenges.id, plan.archiveLegacyId));
    await db.insert(challenges).values(row).onConflictDoNothing();
    return row.id;
  };

  // Write paths materialize canonical Challenges as they resolve them. Read-only
  // planning (approval preview) keeps planned rows and archivals in memory instead.
  const materializingCanonicalChallenges: CanonicalChallengeResolver = {
    overlay: null,
    resolvePlans: async (plans) => Promise.all(plans.map(materializeCanonicalChallenge)),
  };
  const planningCanonicalChallenges = (): CanonicalChallengeResolver => {
    const overlay: CanonicalChallengeOverlay = { rows: new globalThis.Map(), archived: new Set() };
    const resolvePlans = async (plans: CanonicalChallengePlan[]) => {
      for (const plan of plans) {
        if (!plan.insert) continue;
        overlay.rows.set(plan.row.id, plan.row);
        if (plan.archiveLegacyId) overlay.archived.add(plan.archiveLegacyId);
      }
      return plans.map((plan) => plan.row.id);
    };
    return {
      overlay,
      resolvePlans,
    };
  };
  const loadCanonicalChallenges = async (challengeIds: string[], overlay: CanonicalChallengeOverlay | null) => {
    const unresolvedIds = [...new Set(challengeIds.filter((id) => !overlay?.rows.has(id)))];
    const rows = unresolvedIds.length ? await db.select().from(challenges).where(sql`${challenges.id} IN (SELECT value FROM json_each(${JSON.stringify(unresolvedIds)}))`) : [];
    const rowsById = new globalThis.Map(rows.map((row) => [row.id, row]));
    return challengeIds.map((id) => {
      const row = overlay?.rows.get(id) ?? rowsById.get(id) ?? null;
      return row && overlay?.archived.has(row.id) ? { ...row, status: "archived" as const } : row;
    });
  };

  return { batchPlanCanonicalChallenges, materializingCanonicalChallenges, planningCanonicalChallenges, loadCanonicalChallenges };
};
