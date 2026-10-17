import { describe, expect, it } from "vitest";
import { buildMapProgressRows } from "./map-progress";

const maps = [
  { mapId: "map.unplayed", mapName: "未完成地图", defaultGameplayRevisionId: "revision:unplayed:default" },
  { mapId: "map.partial", mapName: "部分完成地图", defaultGameplayRevisionId: "revision:partial:default" },
  { mapId: "map.complete", mapName: "已完成地图", defaultGameplayRevisionId: "revision:complete:default" },
];
const challenges = [
  { challengeId: "unplayed.pioneer", mapId: "map.unplayed", gameplayRevisionId: "revision:unplayed:default", titleKey: "UNPLAYED_PIONEER", name: "开拓者", status: "active" as const },
  { challengeId: "partial.pioneer", mapId: "map.partial", gameplayRevisionId: "revision:partial:default", titleKey: "PARTIAL_PIONEER", name: "开拓者", status: "active" as const },
  { challengeId: "partial.conqueror", mapId: "map.partial", gameplayRevisionId: "revision:partial:default", titleKey: "PARTIAL_CONQUEROR", name: "征服者", status: "active" as const },
  { challengeId: "partial.classic", mapId: "map.partial", gameplayRevisionId: "revision:partial:classic", titleKey: "PARTIAL_CLASSIC", name: "经典", status: "active" as const },
  { challengeId: "complete.pioneer", mapId: "map.complete", gameplayRevisionId: "revision:complete:default", titleKey: "COMPLETE_PIONEER", name: "开拓者", status: "active" as const },
];

describe("buildMapProgressRows", () => {
  it("keeps zero-progress maps visible and orders unfinished work first", () => {
    const rows = buildMapProgressRows({
      maps,
      challenges,
      titles: [
        { grantId: "grant-partial", titleKey: "PARTIAL_PIONEER", scope: "map", mapId: "map.partial", gameplayRevisionId: "revision:partial:default" },
        { grantId: "grant-classic", titleKey: "PARTIAL_CLASSIC", scope: "map", mapId: "map.partial", gameplayRevisionId: "revision:partial:classic" },
        { grantId: "grant-complete", titleKey: "COMPLETE_PIONEER", scope: "map", mapId: "map.complete", gameplayRevisionId: "revision:complete:default" },
      ],
      profiles: [],
    });

    expect(rows.map((row) => row.map.mapId)).toEqual(["map.unplayed", "map.partial", "map.complete"]);
    expect(rows[0]?.earnedChallenges).toHaveLength(0);
    expect(rows[1]?.challenges).toHaveLength(2);
    expect(rows[1]?.earnedChallenges).toHaveLength(1);
    expect(rows[2]?.earnedChallenges).toHaveLength(1);
  });

  it("does not count a selectable or historical grant in the default revision", () => {
    const rows = buildMapProgressRows({
      maps: [{ mapId: "map.test", mapName: "测试地图", defaultGameplayRevisionId: "revision:test:default" }],
      challenges: [
        { challengeId: "default", mapId: "map.test", gameplayRevisionId: "revision:test:default", titleKey: "TITLE", name: "默认", status: "active" },
      ],
      titles: [
        { grantId: "grant-selectable", titleKey: "TITLE", scope: "map", mapId: "map.test", gameplayRevisionId: "revision:test:selectable" },
      ],
      profiles: [],
    });

    expect(rows[0]?.earnedChallenges).toHaveLength(0);
  });

  it("omits the fraction when a map has no current title target", () => {
    const rows = buildMapProgressRows({
      maps: [{ mapId: "map.empty", mapName: "无目标地图", defaultGameplayRevisionId: "revision:empty:default" }],
      challenges: [],
      titles: [],
      profiles: [],
    });

    expect(rows[0]?.challenges).toHaveLength(0);
  });
});
