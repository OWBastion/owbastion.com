import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { auth, createD1, installSchema } from "./review-test-harness";

const target = { targetType: "map" as const, targetId: "map.test", gameplayRevisionId: "revision:map.test:initial" };
const fixture = () => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  sqlite.exec(`
    INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('account-1', '1', 'One', 'one', 1, 1);
    INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.test', 'Test map', '1', 'active', '1', 1, 1);
  `);
  return { sqlite, services: createPlatformServices(database) };
};
const count = (services: ReturnType<typeof fixture>["services"]) => services.getReviewSummary(target).then((summary) => summary.reviewCount);

describe("review restore after withdrawal", () => {
  it("keeps a withdrawn review withdrawn when an admin invalidates and restores it", async () => {
    const { services } = fixture();
    const review = await services.upsertReview({ ...target, rating: 5 }, auth("1"), "create");
    await services.withdrawReview({ reviewId: review.reviewId }, auth("1"), "withdraw");
    await services.invalidateReview({ reviewId: review.reviewId }, auth("admin"), "invalidate");
    const restored = await services.restoreReview({ reviewId: review.reviewId }, auth("admin"), "restore");
    expect(restored.status).toBe("withdrawn");
    expect(await count(services)).toBe(0);
  });

  it("restores a never-withdrawn invalidated review as active", async () => {
    const { services } = fixture();
    const review = await services.upsertReview({ ...target, rating: 5 }, auth("1"), "create");
    await services.invalidateReview({ reviewId: review.reviewId }, auth("admin"), "invalidate");
    expect((await services.restoreReview({ reviewId: review.reviewId }, auth("admin"), "restore")).status).toBe("active");
    expect(await count(services)).toBe(1);
  });
});
