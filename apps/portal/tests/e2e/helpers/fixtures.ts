/**
 * Deterministic public-safe fixtures for Portal browser e2e.
 * No production data, QQ identifiers, or private evidence payloads.
 */

export const FIXTURE_PLAYER = {
  contractVersion: "1" as const,
  player: {
    playerId: "1001",
    playerName: "TestPlayer",
    bindingStatus: "bound" as const,
    isAdmin: false,
  },
  recentSubmissions: [
    {
      submissionId: "sub_fixture_1",
      status: "ready_for_review" as const,
      mapName: "Fixture Map",
      challengeId: "challenge_map_1",
      difficulty: "英雄",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    },
  ],
};

export const FIXTURE_ADMIN_PLAYER = {
  ...FIXTURE_PLAYER,
  player: {
    ...FIXTURE_PLAYER.player,
    playerName: "AdminPlayer",
    isAdmin: true,
  },
};

export const FIXTURE_TITLES = {
  items: [
    {
      grantId: "grant_1",
      titleKey: "FIXTURE_TITLE",
      label: "测试称号",
      icon: "i-lucide-trophy",
      category: "通关",
      condition: "完成任意地图",
      scope: "global" as const,
      grantedAt: 1_700_000_000_000,
      sourceType: "submission" as const,
    },
  ],
};

export const FIXTURE_MAPS = {
  items: [
    {
      mapId: "map_fixture_1",
      mapName: "测试地图甲",
      gameVersion: "26.0101.0",
      difficultyRating: "T2" as const,
      mechanics: ["限时"],
      coverUrl: null,
      backgroundUrl: null,
      mapVariant: undefined as undefined | "classic",
    },
    {
      mapId: "map_fixture_2",
      mapName: "测试地图乙",
      gameVersion: "26.0101.0",
      difficultyRating: "T4" as const,
      mechanics: ["机关", "护送"],
      coverUrl: null,
      backgroundUrl: null,
      mapVariant: undefined as undefined | "classic",
    },
  ],
};

export const FIXTURE_MAP_CHALLENGES = {
  items: [
    {
      challengeId: "challenge_map_1",
      family: "map" as const,
      type: "map_completion" as const,
      kind: "difficulty_completion" as const,
      name: "通关测试地图甲",
      mapId: "map_fixture_1",
      mapName: "测试地图甲",
      difficulty: "英雄",
      gameVersion: "26.0101.0",
      status: "active" as const,
    },
  ],
};

export const FIXTURE_MAP_ACHIEVEMENTS = {
  items: [
    {
      challengeId: "challenge_map_ach_1",
      family: "map" as const,
      type: "map_completion" as const,
      kind: "difficulty_completion" as const,
      name: "地图成就甲",
      mapId: "map_fixture_1",
      mapName: "测试地图甲",
      difficulty: "英雄",
      condition: "完成一次",
      evidenceRule: "完整通关截图",
      submissionMode: "manual" as const,
      status: "active" as const,
      gameVersion: "26.0101.0",
      introducedVersion: "26.0101.0",
      retiredVersion: null as string | null,
      mapTitleRule: undefined as undefined,
    },
  ],
};

export const FIXTURE_SUBMISSION_DETAIL = {
  submissionId: "sub_fixture_1",
  status: "ready_for_review",
  mapName: "测试地图甲",
  challengeId: "challenge_map_1",
  difficulty: "英雄",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  evidenceUrl: "/api/portal/submissions/sub_fixture_1/evidence",
  ocrFailCount: 0,
  manualReviewEligible: false,
  ocr: {
    mapName: "测试地图甲",
    difficulty: "英雄",
    playerName: "TestPlayer",
    challengeCompleted: true,
    achievementTitles: [] as string[],
  },
};

/** Larger synthetic PNG (8×12) for natural-aspect evidence checks. */
export const FIXTURE_PORTRAIT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAMCAYAAABfnvydAAAAFElEQVR4nGPQqLjzHx9mGFVALwUArVXuIUUIHRUAAAAASUVORK5CYII=";

export function fixturePortraitPngBuffer(): Buffer {
  return Buffer.from(FIXTURE_PORTRAIT_PNG_BASE64, "base64");
}
