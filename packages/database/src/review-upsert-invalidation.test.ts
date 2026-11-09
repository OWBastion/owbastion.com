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

describe("review upsert vs concurrent invalidation", () => {
  it("does not undo an admin invalidation that lands between the player's check and write", async () => {
    const { services, sqlite } = fixture();
    const review = await services.upsertReview({ ...target, rating: 5 }, auth("1"), "create");
    // Simulates the concurrent admin: invalidates right after the player's pre-read, before the upsert write.
    sqlite.exec(`CREATE TRIGGER admin_invalidates BEFORE INSERT ON reviews BEGIN
      UPDATE reviews SET status = 'invalidated', invalidated_at = 9 WHERE id = '${review.reviewId}';
    END`);
    await expect(services.upsertReview({ ...target, rating: 1 }, auth("1"), "edit")).rejects.toThrow("REVIEW_INVALIDATED");
    expect(sqlite.prepare("SELECT status, rating, invalidated_at FROM reviews").get()).toEqual({ status: "invalidated", rating: 5, invalidated_at: 9 });
  });

  it("still lets a player edit a withdrawn review back to active", async () => {
    const { services } = fixture();
    const review = await services.upsertReview({ ...target, rating: 5 }, auth("1"), "create");
    await services.withdrawReview({ reviewId: review.reviewId }, auth("1"), "withdraw");
    const edited = await services.upsertReview({ ...target, rating: 2 }, auth("1"), "edit");
    expect(edited).toMatchObject({ reviewId: review.reviewId, status: "active", rating: 2, withdrawnAt: null });
  });
});
