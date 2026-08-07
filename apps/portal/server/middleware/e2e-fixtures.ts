/**
 * Deterministic API fixtures for Portal browser e2e (#63).
 * Active only when NUXT_PORTAL_E2E_FIXTURES=1 so production builds are unaffected.
 *
 * Covers both SSR (Nitro) and browser same-origin /api/* requests, which Playwright
 * route interception cannot fully replace for server-side middleware auth.
 */
import { getHeader, getRequestURL, getQuery, readBody, setResponseHeader, setResponseStatus } from "h3";

const enabled = () => process.env.NUXT_PORTAL_E2E_FIXTURES === "1";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const player = {
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
      status: "ready_for_review",
      mapName: "Fixture Map",
      challengeId: "challenge_map_1",
      difficulty: "英雄",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_100_000,
    },
  ],
};

const adminPlayer = {
  ...player,
  player: { ...player.player, playerName: "AdminPlayer", isAdmin: true },
};

const maps = {
  items: [
    {
      mapId: "map_fixture_1",
      mapName: "测试地图甲",
      gameVersion: "26.0101.0",
      difficultyRating: "T2",
      mechanics: ["限时"],
      coverUrl: null,
      backgroundUrl: null,
    },
    {
      mapId: "map_fixture_2",
      mapName: "测试地图乙",
      gameVersion: "26.0101.0",
      difficultyRating: "T4",
      mechanics: ["机关", "护送"],
      coverUrl: null,
      backgroundUrl: null,
    },
  ],
};

const mapChallenges = {
  items: [
    {
      challengeId: "challenge_map_1",
      family: "map",
      type: "map_completion",
      kind: "difficulty_completion",
      name: "通关测试地图甲",
      mapId: "map_fixture_1",
      mapName: "测试地图甲",
      difficulty: "英雄",
      gameVersion: "26.0101.0",
      status: "active",
    },
  ],
};

const mapAchievements = {
  items: [
    {
      challengeId: "challenge_map_ach_1",
      family: "map",
      type: "map_completion",
      kind: "difficulty_completion",
      name: "地图成就甲",
      mapId: "map_fixture_1",
      mapName: "测试地图甲",
      difficulty: "英雄",
      condition: "完成一次",
      evidenceRule: "完整通关截图",
      submissionMode: "manual",
      status: "active",
      gameVersion: "26.0101.0",
      introducedVersion: "26.0101.0",
      retiredVersion: null,
    },
  ],
};

const titles = {
  items: [
    {
      grantId: "grant_1",
      titleKey: "FIXTURE_TITLE",
      label: "测试称号",
      icon: "i-lucide-trophy",
      category: "通关",
      condition: "完成任意地图",
      scope: "global",
      grantedAt: 1_700_000_000_000,
      sourceType: "submission",
    },
  ],
};

const submissionDetail = {
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

type Scenario = {
  auth: "anonymous" | "player" | "admin";
  mapsFail?: boolean;
  meFail?: boolean;
  titlesFail?: boolean;
  submissionFail?: boolean;
  mapSaveFail?: boolean;
};

function scenarioFromCookie(cookieHeader: string | undefined): Scenario {
  const raw = cookieHeader?.match(/(?:^|;\s*)owbastion-e2e-scenario=([^;]+)/)?.[1];
  if (!raw) return { auth: "anonymous" };
  try {
    return JSON.parse(decodeURIComponent(raw)) as Scenario;
  } catch {
    return { auth: "anonymous" };
  }
}

function sendJson(event: Parameters<typeof setResponseStatus>[0], body: unknown, status = 200) {
  setResponseStatus(event, status);
  setResponseHeader(event, "content-type", "application/json");
  return body;
}

export default defineEventHandler(async (event) => {
  if (!enabled()) return;

  const requestUrl = getRequestURL(event);
  const path = requestUrl.pathname;
  if (!path.startsWith("/api/portal") && !path.startsWith("/api/admin")) return;

  const method = event.method.toUpperCase();
  const scenario = scenarioFromCookie(getHeader(event, "cookie"));
  const portalPath = path.replace(/^\/api\/portal/, "") || "/";
  const adminPath = path.replace(/^\/api\/admin/, "") || "/";

  if (path.startsWith("/api/portal")) {
    if (portalPath === "/v1/me" && method === "GET") {
      if (scenario.meFail) return sendJson(event, { error: { code: "upstream_error", message: "player unavailable" } }, 503);
      if (scenario.auth === "anonymous") return sendJson(event, { error: { code: "unauthorized", message: "not authenticated" } }, 401);
      return sendJson(event, scenario.auth === "admin" ? adminPlayer : player);
    }
    if (portalPath === "/v1/auth/logout" && method === "POST") return sendJson(event, { ok: true });
    if (portalPath === "/v1/me/titles" && method === "GET") {
      if (scenario.auth === "anonymous") return sendJson(event, { error: { code: "unauthorized", message: "not authenticated" } }, 401);
      if (scenario.titlesFail) return sendJson(event, { error: { code: "upstream_error", message: "titles unavailable" } }, 503);
      return sendJson(event, titles);
    }
    if (portalPath === "/v1/maps" && method === "GET") {
      if (scenario.mapsFail) return sendJson(event, { error: { code: "upstream_error", message: "maps unavailable" } }, 503);
      return sendJson(event, maps);
    }
    if (portalPath.startsWith("/v1/challenges") && method === "GET") {
      if (scenario.mapsFail) return sendJson(event, { error: { code: "upstream_error", message: "challenges unavailable" } }, 503);
      const family = String(getQuery(event).family ?? "");
      if (family === "achievement") return sendJson(event, { items: [] });
      return sendJson(event, mapChallenges);
    }
    if (portalPath.match(/^\/v1\/me\/submissions\//) && method === "GET") {
      if (scenario.auth === "anonymous") return sendJson(event, { error: { code: "unauthorized", message: "not authenticated" } }, 401);
      if (scenario.submissionFail) return sendJson(event, { error: { code: "not_found", message: "not found" } }, 404);
      return sendJson(event, submissionDetail);
    }
    if (portalPath.match(/^\/submissions\/.+\/evidence$/) && method === "GET") {
      setResponseStatus(event, 200);
      setResponseHeader(event, "content-type", "image/png");
      return PNG_1X1;
    }
    if (
      (portalPath.startsWith("/v1/uploads") || portalPath.startsWith("/v1/player/submissions") || portalPath.startsWith("/v1/me/submissions"))
      && (method === "POST" || method === "PUT")
    ) {
      return sendJson(event, { submissionId: "sub_fixture_new", status: "ocr_pending", contractVersion: "1" });
    }
    if (portalPath.startsWith("/v1/achievements") && method === "GET") return sendJson(event, { items: [] });
    if (method === "GET") return sendJson(event, { items: [] });
    return sendJson(event, { error: { code: "not_found", message: `unmocked portal ${method} ${portalPath}` } }, 404);
  }

  // Admin
  if (scenario.auth !== "admin") {
    return sendJson(event, { error: { code: "forbidden", message: "forbidden" } }, 403);
  }
  if (adminPath === "/v1/maps" && method === "GET") return sendJson(event, maps);
  if (adminPath.startsWith("/v1/achievements") && method === "GET") return sendJson(event, mapAchievements);
  if (adminPath.match(/^\/v1\/maps\/.+\/metadata$/) && method === "PUT") {
    if (scenario.mapSaveFail) return sendJson(event, { error: { code: "upstream_error", message: "save failed" } }, 500);
    const mapId = decodeURIComponent(adminPath.split("/")[3] ?? "map_fixture_1");
    const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
    const existing = maps.items.find((m) => m.mapId === mapId) ?? maps.items[0]!;
    return sendJson(event, {
      ...existing,
      mapId,
      difficultyRating: body.difficultyRating ?? existing.difficultyRating,
      mechanics: body.mechanics ?? existing.mechanics,
      coverUrl: body.coverUrl ?? existing.coverUrl,
      backgroundUrl: body.backgroundUrl ?? existing.backgroundUrl,
    });
  }
  if (method === "GET") return sendJson(event, { items: [], page: 1, pageSize: 20, total: 0, hasMore: false });
  return sendJson(event, { error: { code: "not_found", message: `unmocked admin ${method} ${adminPath}` } }, 404);
});
