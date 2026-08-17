import { describe, expect, it, vi } from "vitest";
import type { Challenge, RandomEvent } from "@owbastion/contracts";
import { canonicalizePlatformServices } from "./public";

type PlatformServices = Parameters<typeof canonicalizePlatformServices>[0];

const revisionId = "revision:map.paraiso:rework";
const definitionVersion = "2026.07.15";
const revisionVersion = "2026.08.17";

const mapChallenge = (challengeId: string): Challenge => ({
  challengeId,
  family: "map",
  gameplayRevisionId: revisionId,
  type: "map_completion",
  kind: "map_title_achievement",
  name: challengeId,
  mapId: "map.paraiso",
  mapName: "Paraíso",
  gameVersion: definitionVersion,
  status: "active",
} as Challenge);

const challenges: Challenge[] = [
  mapChallenge("challenge.paraiso.direct"),
  mapChallenge("map.paraiso.conqueror"),
  mapChallenge("title.paraiso.rework"),
  { challengeId: "title.global", family: "achievement", gameVersion: definitionVersion } as Challenge,
];

const event = {
  eventId: "event.projection",
  name: "Projection fixture",
  category: "test",
  rarity: "N",
  description: "fixture",
  durationSeconds: null,
  cooldownSeconds: null,
  weight: null,
  gameVersion: definitionVersion,
  effectTags: [],
  effectAnnotations: [],
  releaseStatus: "implemented",
  archived: false,
  challenges,
} as RandomEvent;

describe("public database service revision projection", () => {
  it("uses gameplay revision gameVersion for every map challenge without rewriting admin definition metadata", async () => {
    const adminResponse = {
      contractVersion: "1" as const,
      items: [
        { challengeId: "challenge.paraiso.direct", gameVersion: definitionVersion, introducedVersion: definitionVersion },
        { challengeId: "map.paraiso.conqueror", gameVersion: definitionVersion, introducedVersion: definitionVersion },
        { challengeId: "title.paraiso.rework", gameVersion: definitionVersion, introducedVersion: definitionVersion },
      ],
    };
    const raw = {
      listAgentMaps: vi.fn(async () => ({
        contractVersion: "1" as const,
        items: [{
          mapId: "map.paraiso",
          mapName: "Paraíso",
          gameVersion: revisionVersion,
          difficultyRating: null,
          mechanics: [],
          coverUrl: null,
          backgroundUrl: null,
          gameplayRevisions: [{ gameplayRevisionId: revisionId, gameVersion: revisionVersion }],
        }],
        page: 1,
        pageSize: 100,
        total: 1,
        hasMore: false,
      })),
      listChallenges: vi.fn(async () => challenges),
      listRandomEvents: vi.fn(async () => [event]),
      getRandomEvent: vi.fn(async () => event),
      listAdminChallenges: vi.fn(async () => adminResponse),
    } as unknown as PlatformServices;
    const services = canonicalizePlatformServices(raw);

    const projected = await services.listChallenges({ family: "map" });
    expect(projected.filter((challenge) => challenge.family === "map")).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "challenge.paraiso.direct", gameplayRevisionId: revisionId, gameVersion: revisionVersion }),
      expect.objectContaining({ challengeId: "map.paraiso.conqueror", gameplayRevisionId: revisionId, gameVersion: revisionVersion }),
      expect.objectContaining({ challengeId: "title.paraiso.rework", gameplayRevisionId: revisionId, gameVersion: revisionVersion }),
    ]));
    expect(projected.find((challenge) => challenge.family === "achievement")?.gameVersion).toBe(definitionVersion);

    const projectedEvents = await services.listRandomEvents({});
    expect(projectedEvents[0]?.challenges.filter((challenge) => challenge.family === "map").every((challenge) => challenge.gameVersion === revisionVersion)).toBe(true);
    await expect(services.getRandomEvent({ eventId: event.eventId })).resolves.toMatchObject({
      challenges: expect.arrayContaining([expect.objectContaining({ challengeId: "map.paraiso.conqueror", gameVersion: revisionVersion })]),
    });

    const admin = await services.listAdminChallenges({ family: "map" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" });
    expect(admin).toBe(adminResponse);
    expect(admin.items.every((item) => item.introducedVersion === definitionVersion)).toBe(true);
    expect(raw.listAgentMaps).toHaveBeenCalledTimes(1);
  });
});
