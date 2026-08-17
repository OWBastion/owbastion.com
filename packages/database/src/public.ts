import type { Challenge, RandomEvent } from "@owbastion/contracts";
import { createPlatformServices as createRawPlatformServices } from "./index";

export * from "./index";

type PlatformServices = ReturnType<typeof createRawPlatformServices>;
type RevisionVersions = ReadonlyMap<string, string>;

const canonicalizeChallenge = (challenge: Challenge, revisionVersions: RevisionVersions): Challenge => {
  if (challenge.family !== "map") return challenge;
  const gameVersion = revisionVersions.get(challenge.gameplayRevisionId);
  return gameVersion && challenge.gameVersion !== gameVersion
    ? { ...challenge, gameVersion }
    : challenge;
};

const canonicalizeEvent = (event: RandomEvent, revisionVersions: RevisionVersions): RandomEvent => ({
  ...event,
  challenges: event.challenges.map((challenge) => canonicalizeChallenge(challenge, revisionVersions)),
});

/**
 * Public database-service facade.
 *
 * A map challenge is a projection onto an immutable gameplay revision, so the
 * revision owns the projected gameVersion. Challenge/rule game-version fields
 * remain definition/history metadata and are intentionally left untouched for
 * admin authoring reads.
 */
export const canonicalizePlatformServices = (raw: PlatformServices): PlatformServices => {
  let revisionVersionsPromise: Promise<Map<string, string>> | null = null;

  const revisionVersions = () => {
    revisionVersionsPromise ??= (async () => {
      const versions = new Map<string, string>();
      const pageSize = 100;
      for (let page = 1; ; page += 1) {
        const response = await raw.listAgentMaps({ page, pageSize });
        for (const map of response.items) {
          for (const revision of map.gameplayRevisions) {
            versions.set(revision.gameplayRevisionId, revision.gameVersion);
          }
        }
        if (!response.hasMore) break;
      }
      return versions;
    })();
    return revisionVersionsPromise;
  };

  return {
    ...raw,
    async listChallenges(input) {
      const [items, versions] = await Promise.all([raw.listChallenges(input), revisionVersions()]);
      return items.map((challenge) => canonicalizeChallenge(challenge, versions));
    },
    async listRandomEvents(input) {
      const [events, versions] = await Promise.all([raw.listRandomEvents(input), revisionVersions()]);
      return events.map((event) => canonicalizeEvent(event, versions));
    },
    async getRandomEvent(input) {
      const [event, versions] = await Promise.all([raw.getRandomEvent(input), revisionVersions()]);
      return event ? canonicalizeEvent(event, versions) : null;
    },
  };
};

export const createPlatformServices = (...args: Parameters<typeof createRawPlatformServices>): PlatformServices =>
  canonicalizePlatformServices(createRawPlatformServices(...args));
