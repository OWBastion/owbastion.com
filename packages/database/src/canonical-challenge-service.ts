import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { parseChallengeProgressRule } from "@owbastion/domain";
import type { ChallengeCondition } from "@owbastion/domain";
import { hashRequest } from "./portal-session";
import { achievementChallenges, challenges, mapTitleRuleCompat, mapTitleRules, titleCatalog, titleChallenges } from "./schema";
export type MapTitleRuleSnapshot = {
  challengeId?: string;
  challengeType?: string;
  ruleId: string;
  ruleRevision: number;
  mapId: string | null;
  gameplayRevisionId: string | null;
  titleKey: string;
  mapVariant: "classic" | null;
  slot: string | null;
  displayKind: string;
  condition: string;
  evidenceRule: string;
  submissionMode: string;
  defaultScope: string;
  exceptionId: string | null;
  startsAt: number | null;
  endsAt: number | null;
};

export type CanonicalChallengeInput = {
  snapshot?: MapTitleRuleSnapshot | null;
  legacyChallengeId: string;
  titleKey: string;
  mapId: string | null;
  gameplayRevisionId: string | null;
  timestamp: number;
};

type CanonicalChallengeRow = typeof challenges.$inferSelect;

export type CanonicalChallengePlan = {
  row: CanonicalChallengeRow;
  archiveLegacyId: string | null;
  insert: boolean;
};

export type CanonicalChallengeOverlay = {
  rows: globalThis.Map<string, CanonicalChallengeRow>;
  archived: Set<string>;
};

export type CanonicalChallengeResolver = {
  resolveMany: (inputs: CanonicalChallengeInput[]) => Promise<string[]>;
  resolvePlans: (plans: CanonicalChallengePlan[]) => Promise<string[]>;
  overlay: CanonicalChallengeOverlay | null;
};

export const createCanonicalChallengeServices = (db: ReturnType<typeof drizzle>) => {
  const planCanonicalChallenge = async (input: CanonicalChallengeInput): Promise<CanonicalChallengePlan> => {
    let ruleId = input.snapshot?.ruleId ?? "";
    let family: "title_challenge" | "map_challenge" | "map_title_rule";
    let sourceId: string;
    if (ruleId.startsWith("title-challenge:")) {
      family = "title_challenge";
      sourceId = input.snapshot?.challengeId ?? ruleId.slice("title-challenge:".length);
    } else if (ruleId.startsWith("challenge:")) {
      family = "map_challenge";
      sourceId = input.snapshot?.challengeId ?? ruleId.slice("challenge:".length);
    } else if (ruleId) {
      family = "map_title_rule";
      const compat = input.mapId
        ? await db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId }).from(mapTitleRuleCompat)
          .where(and(eq(mapTitleRuleCompat.ruleId, ruleId), eq(mapTitleRuleCompat.mapId, input.mapId))).get()
        : null;
      sourceId = compat?.legacyChallengeId ?? ruleId;
    } else {
      const titleChallenge = await db.select({ id: titleChallenges.id }).from(titleChallenges).where(eq(titleChallenges.id, input.legacyChallengeId)).get();
      const mapChallenge = await db.select({ id: achievementChallenges.id }).from(achievementChallenges).where(eq(achievementChallenges.id, input.legacyChallengeId)).get();
      const compat = input.mapId
        ? await db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId, ruleId: mapTitleRuleCompat.ruleId }).from(mapTitleRuleCompat)
          .where(and(eq(mapTitleRuleCompat.legacyChallengeId, input.legacyChallengeId), eq(mapTitleRuleCompat.mapId, input.mapId))).get()
        : null;
      if (titleChallenge) {
        family = "title_challenge";
        sourceId = titleChallenge.id;
      } else if (mapChallenge) {
        family = "map_challenge";
        sourceId = mapChallenge.id;
      } else if (compat) {
        family = "map_title_rule";
        sourceId = compat.legacyChallengeId;
        ruleId = compat.ruleId;
      } else {
        const rule = await db.select({ id: mapTitleRules.id }).from(mapTitleRules).where(eq(mapTitleRules.id, input.legacyChallengeId)).get();
        if (!rule) throw new Error("CHALLENGE_NOT_FOUND");
        family = "map_title_rule";
        sourceId = rule.id;
        ruleId = rule.id;
      }
    }
    const title = await db.select({ key: titleCatalog.key }).from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
    if (!title) throw new Error("TITLE_NOT_FOUND");
    const legacyTitleChallenge = family === "title_challenge"
      ? await db.select({ condition: titleChallenges.condition, startsAt: titleChallenges.startsAt, endsAt: titleChallenges.endsAt, progressRule: titleChallenges.progressRule }).from(titleChallenges).where(eq(titleChallenges.id, sourceId)).get()
      : null;
    const progressRule = parseChallengeProgressRule(legacyTitleChallenge?.progressRule);
    const conditions: ChallengeCondition[] = [];
    if (family === "title_challenge") {
      // Aggregate progress Challenges carry a single canonical condition; the
      // required map set is part of the rule identity, never a snapshot mapId.
      if (progressRule) conditions.push(progressRule);
      else {
        conditions.push({ type: "achievement_title", titleKey: input.titleKey });
        if (input.mapId) conditions.push({ type: "map", mapId: input.mapId });
        if (input.snapshot?.mapVariant === "classic") conditions.push({ type: "map_variant", variant: "classic" });
      }
    } else if (input.mapId) {
      conditions.push({ type: "map", mapId: input.mapId });
      conditions.push({ type: "completed" });
      const rule = family === "map_title_rule"
        ? await db.select({ kind: mapTitleRules.kind, condition: mapTitleRules.condition }).from(mapTitleRules).where(eq(mapTitleRules.id, ruleId)).get()
        : null;
      const mapChallenge = family === "map_challenge"
        ? await db.select({ difficulty: achievementChallenges.difficulty, type: achievementChallenges.type, condition: achievementChallenges.condition }).from(achievementChallenges).where(eq(achievementChallenges.id, sourceId)).get()
        : null;
      const difficulty = rule?.kind.toLocaleLowerCase() === "conqueror" ? "传奇"
        : ["dominator", "pioneer"].includes(rule?.kind.toLocaleLowerCase() ?? "") ? "地狱"
          : mapChallenge?.difficulty ?? null;
      if (difficulty) conditions.push({ type: "difficulty_at_least", difficulty });
      if (input.snapshot?.mapVariant === "classic" || mapChallenge?.type === "classic_completion") conditions.push({ type: "map_variant", variant: "classic" });
    }
    const legacyRule = family === "map_title_rule" && ruleId
      ? await db.select({ condition: mapTitleRules.condition }).from(mapTitleRules).where(eq(mapTitleRules.id, ruleId)).get()
      : null;
    const legacyMapChallenge = family === "map_challenge"
      ? await db.select({ condition: achievementChallenges.condition }).from(achievementChallenges).where(eq(achievementChallenges.id, sourceId)).get()
      : null;
    const condition = input.snapshot?.condition ?? legacyRule?.condition ?? legacyMapChallenge?.condition ?? legacyTitleChallenge?.condition ?? "";
    const startsAt = input.snapshot?.startsAt ?? legacyTitleChallenge?.startsAt ?? null;
    const endsAt = input.snapshot?.endsAt ?? legacyTitleChallenge?.endsAt ?? null;
    const conditionsJson = JSON.stringify({ operator: "and", conditions });
    const ruleVersion = await hashRequest({ conditions, condition, startsAt, endsAt });
    const scope = and(
      eq(challenges.sourceFamily, family),
      eq(challenges.sourceId, sourceId),
      eq(challenges.titleKey, input.titleKey),
      input.mapId ? eq(challenges.mapId, input.mapId) : isNull(challenges.mapId),
      input.gameplayRevisionId ? eq(challenges.gameplayRevisionId, input.gameplayRevisionId) : isNull(challenges.gameplayRevisionId),
    );
    const exact = await db.select().from(challenges).where(and(scope, eq(challenges.ruleVersion, ruleVersion))).get();
    if (exact) return { row: exact, archiveLegacyId: null, insert: false };
    const legacy = await db.select().from(challenges).where(and(scope, eq(challenges.ruleVersion, "legacy"))).get();
    if (legacy && legacy.conditionsJson === conditionsJson && legacy.condition === condition && legacy.startsAt === startsAt && legacy.endsAt === endsAt) return { row: legacy, archiveLegacyId: null, insert: false };
    return {
      row: {
        id: `legacy:${family}:${sourceId}:${input.mapId ?? ""}:${input.gameplayRevisionId ?? ""}:${ruleVersion.slice(0, 16)}`,
        sourceFamily: family,
        sourceId,
        titleKey: input.titleKey,
        ruleVersion,
        mapId: input.mapId,
        gameplayRevisionId: input.gameplayRevisionId,
        status: "active",
        manual: 0,
        publicCondition: 1,
        conditionOperator: "and",
        conditionsJson,
        condition,
        startsAt,
        endsAt,
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
      },
      archiveLegacyId: legacy?.id ?? null,
      insert: true,
    };
  };

  // Batched equivalent of `planCanonicalChallenge` for the auto-match candidate scan,
  // where `input.snapshot` is always present with a resolved `ruleId` (title-challenge:/
  // challenge:/rule-id prefixed) — the branch that resolves a bare `legacyChallengeId`
  // never triggers there, so it is handled per-item as a fallback for any other caller
  // shape instead of being fully batched. Never writes: returns the same plan objects
  // `planCanonicalChallenge` would, computed against a handful of bulk-prefetched
  // lookups so the statement count stays flat as the candidate list grows.
  const batchPlanCanonicalChallenges = async (inputs: CanonicalChallengeInput[]): Promise<CanonicalChallengePlan[]> => {
    const results: Array<CanonicalChallengePlan | null> = new Array(inputs.length).fill(null);
    type Batchable = { index: number; input: CanonicalChallengeInput; ruleId: string };
    const batchable: Batchable[] = [];
    const fallbackIndices: number[] = [];
    inputs.forEach((input, index) => {
      const ruleId = input.snapshot?.ruleId ?? "";
      if (ruleId) batchable.push({ index, input, ruleId });
      else fallbackIndices.push(index);
    });

    if (fallbackIndices.length) {
      const fallbackPlans = await Promise.all(fallbackIndices.map((index) => planCanonicalChallenge(inputs[index])));
      fallbackIndices.forEach((index, i) => { results[index] = fallbackPlans[i]; });
    }
    if (!batchable.length) return results as CanonicalChallengePlan[];

    const compatCandidates = batchable.filter(({ ruleId }) => !ruleId.startsWith("title-challenge:") && !ruleId.startsWith("challenge:"));
    const compatRuleIds = [...new Set(compatCandidates.map(({ ruleId }) => ruleId))];
    const compatRows = compatRuleIds.length ? await db.select().from(mapTitleRuleCompat).where(sql`${mapTitleRuleCompat.ruleId} IN (SELECT value FROM json_each(${JSON.stringify(compatRuleIds)}))`) : [];
    const compatByRuleMap = new globalThis.Map(compatRows.map((row) => [`${row.ruleId}:${row.mapId}`, row.legacyChallengeId]));

    type Identified = Batchable & { family: "title_challenge" | "map_challenge" | "map_title_rule"; sourceId: string };
    const identified: Identified[] = batchable.map(({ index, input, ruleId }) => {
      if (ruleId.startsWith("title-challenge:")) {
        return { index, input, ruleId, family: "title_challenge" as const, sourceId: input.snapshot?.challengeId ?? ruleId.slice("title-challenge:".length) };
      }
      if (ruleId.startsWith("challenge:")) {
        return { index, input, ruleId, family: "map_challenge" as const, sourceId: input.snapshot?.challengeId ?? ruleId.slice("challenge:".length) };
      }
      const sourceId = (input.mapId ? compatByRuleMap.get(`${ruleId}:${input.mapId}`) : null) ?? ruleId;
      return { index, input, ruleId, family: "map_title_rule" as const, sourceId };
    });

    const titleKeys = [...new Set(identified.map(({ input }) => input.titleKey))];
    const ruleIds = [...new Set(identified.filter(({ family }) => family === "map_title_rule").map(({ ruleId }) => ruleId))];
    const mapChallengeSourceIds = [...new Set(identified.filter(({ family }) => family === "map_challenge").map(({ sourceId }) => sourceId))];
    const titleChallengeSourceIds = [...new Set(identified.filter(({ family }) => family === "title_challenge").map(({ sourceId }) => sourceId))];
    const allSourceIds = [...new Set(identified.map(({ sourceId }) => sourceId))];

    const [titleRows, ruleRows, mapChallengeRows, titleChallengeRows, challengeRows] = await Promise.all([
      titleKeys.length ? db.select({ key: titleCatalog.key }).from(titleCatalog).where(sql`${titleCatalog.key} IN (SELECT value FROM json_each(${JSON.stringify(titleKeys)}))`) : Promise.resolve([]),
      ruleIds.length ? db.select({ id: mapTitleRules.id, kind: mapTitleRules.kind, condition: mapTitleRules.condition }).from(mapTitleRules).where(sql`${mapTitleRules.id} IN (SELECT value FROM json_each(${JSON.stringify(ruleIds)}))`) : Promise.resolve([]),
      mapChallengeSourceIds.length ? db.select({ id: achievementChallenges.id, difficulty: achievementChallenges.difficulty, type: achievementChallenges.type, condition: achievementChallenges.condition }).from(achievementChallenges).where(sql`${achievementChallenges.id} IN (SELECT value FROM json_each(${JSON.stringify(mapChallengeSourceIds)}))`) : Promise.resolve([]),
      titleChallengeSourceIds.length ? db.select({ id: titleChallenges.id, condition: titleChallenges.condition, startsAt: titleChallenges.startsAt, endsAt: titleChallenges.endsAt, progressRule: titleChallenges.progressRule }).from(titleChallenges).where(sql`${titleChallenges.id} IN (SELECT value FROM json_each(${JSON.stringify(titleChallengeSourceIds)}))`) : Promise.resolve([]),
      allSourceIds.length ? db.select().from(challenges).where(sql`${challenges.sourceId} IN (SELECT value FROM json_each(${JSON.stringify(allSourceIds)}))`) : Promise.resolve([]),
    ]);

    const titleKeySet = new Set(titleRows.map((row) => row.key));
    const ruleById = new globalThis.Map(ruleRows.map((row) => [row.id, row]));
    const mapChallengeById = new globalThis.Map(mapChallengeRows.map((row) => [row.id, row]));
    const titleChallengeById = new globalThis.Map(titleChallengeRows.map((row) => [row.id, row]));

    const ruleVersions = await Promise.all(identified.map(({ input, family, sourceId, ruleId }) => {
      const rule = family === "map_title_rule" ? ruleById.get(ruleId) : null;
      const mapChallenge = family === "map_challenge" ? mapChallengeById.get(sourceId) : null;
      const legacyTitleChallenge = family === "title_challenge" ? titleChallengeById.get(sourceId) : null;
      const progressRule = parseChallengeProgressRule(legacyTitleChallenge?.progressRule);
      const conditions: ChallengeCondition[] = [];
      if (family === "title_challenge") {
        if (progressRule) conditions.push(progressRule);
        else {
          conditions.push({ type: "achievement_title", titleKey: input.titleKey });
          if (input.mapId) conditions.push({ type: "map", mapId: input.mapId });
          if (input.snapshot?.mapVariant === "classic") conditions.push({ type: "map_variant", variant: "classic" });
        }
      } else if (input.mapId) {
        conditions.push({ type: "map", mapId: input.mapId });
        conditions.push({ type: "completed" });
        const difficulty = rule?.kind.toLocaleLowerCase() === "conqueror" ? "传奇"
          : ["dominator", "pioneer"].includes(rule?.kind.toLocaleLowerCase() ?? "") ? "地狱"
            : mapChallenge?.difficulty ?? null;
        if (difficulty) conditions.push({ type: "difficulty_at_least", difficulty });
        if (input.snapshot?.mapVariant === "classic" || mapChallenge?.type === "classic_completion") conditions.push({ type: "map_variant", variant: "classic" });
      }
      const condition = input.snapshot?.condition ?? rule?.condition ?? mapChallenge?.condition ?? legacyTitleChallenge?.condition ?? "";
      const startsAt = input.snapshot?.startsAt ?? legacyTitleChallenge?.startsAt ?? null;
      const endsAt = input.snapshot?.endsAt ?? legacyTitleChallenge?.endsAt ?? null;
      const conditionsJson = JSON.stringify({ operator: "and", conditions });
      return hashRequest({ conditions, condition, startsAt, endsAt }).then((ruleVersion) => ({ conditionsJson, condition, startsAt, endsAt, ruleVersion }));
    }));

    identified.forEach(({ index, input, family, sourceId }, i) => {
      if (!titleKeySet.has(input.titleKey)) throw new Error("TITLE_NOT_FOUND");
      const { conditionsJson, condition, startsAt, endsAt, ruleVersion } = ruleVersions[i];
      const matches = challengeRows.filter((row) =>
        row.sourceFamily === family
        && row.sourceId === sourceId
        && row.titleKey === input.titleKey
        && (row.mapId ?? null) === (input.mapId ?? null)
        && (row.gameplayRevisionId ?? null) === (input.gameplayRevisionId ?? null));
      const exact = matches.find((row) => row.ruleVersion === ruleVersion);
      if (exact) { results[index] = { row: exact, archiveLegacyId: null, insert: false }; return; }
      const legacy = matches.find((row) => row.ruleVersion === "legacy");
      if (legacy && legacy.conditionsJson === conditionsJson && legacy.condition === condition && legacy.startsAt === startsAt && legacy.endsAt === endsAt) {
        results[index] = { row: legacy, archiveLegacyId: null, insert: false };
        return;
      }
      results[index] = {
        row: {
          id: `legacy:${family}:${sourceId}:${input.mapId ?? ""}:${input.gameplayRevisionId ?? ""}:${ruleVersion.slice(0, 16)}`,
          sourceFamily: family,
          sourceId,
          titleKey: input.titleKey,
          ruleVersion,
          mapId: input.mapId,
          gameplayRevisionId: input.gameplayRevisionId,
          status: "active",
          manual: 0,
          publicCondition: 1,
          conditionOperator: "and",
          conditionsJson,
          condition,
          startsAt,
          endsAt,
          createdAt: input.timestamp,
          updatedAt: input.timestamp,
        },
        archiveLegacyId: legacy?.id ?? null,
        insert: true,
      };
    });

    return results as CanonicalChallengePlan[];
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
    resolveMany: async (inputs) => Promise.all((await batchPlanCanonicalChallenges(inputs)).map(materializeCanonicalChallenge)),
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
      resolveMany: async (inputs) => resolvePlans(await batchPlanCanonicalChallenges(inputs)),
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
