import { describe, expect, it } from "vitest";
import { featuredReviewCommentsResponseSchema } from "@owbastion/contracts";
import { createPlatformServices } from "./index";
import { createD1, installSchema } from "./review-test-harness";

const long = "这个事件很有意思，值得推荐";

describe("featured review comments", () => {
  it("returns only visible, high-rated, long-enough comments of shown events, at most three", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const event = (id: string, name: string, status: string, archived = "NULL") => `INSERT INTO random_events (id, name, category, rarity, description, game_version, release_status, archived_at, created_at, updated_at) VALUES ('${id}', '${name}', 't', 'N', 'd', '1', '${status}', ${archived}, 1, 1);`;
    const review = (n: number, event: string, rating: number, comment: string | null, status = "active", commentStatus = "visible") =>
      `INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('a${n}', '${n}', 'P${n}', 'p${n}', 1, 1);
       INSERT INTO reviews (id, player_account_id, target_type, target_id, rating, comment, status, comment_status, created_at, updated_at) VALUES ('r${n}', 'a${n}', 'event', '${event}', ${rating}, ${comment === null ? "NULL" : `'${comment}'`}, '${status}', '${commentStatus}', 1, 1);`;
    sqlite.exec([
      event("e1", "已实装", "implemented"), event("e2", "已移除", "removed"), event("e3", "开发中", "development"), event("e4", "已归档", "implemented", "5"),
      review(1, "e1", 5, long), review(2, "e2", 4, long),
      review(3, "e1", 3, long), review(4, "e1", 5, "太短"), review(5, "e1", 5, null), review(6, "e1", 5, long, "invalidated"), review(7, "e1", 5, long, "active", "hidden"),
      review(8, "e3", 5, long), review(9, "e4", 5, long),
      review(10, "e1", 5, long), review(11, "e1", 4, long),
      review(12, "e1", 5, long, "withdrawn"), review(13, "e1", 5, "   好   "),
      `INSERT INTO review_imports (id, source_hash, file_name, row_count, imported_by, imported_at) VALUES ('imp', 'h', 'f.csv', 1, 'admin', 1);
       INSERT INTO reviews (id, import_id, source_id, source_label, target_type, target_id, rating, comment, anonymous, created_at, updated_at) VALUES ('rimp', 'imp', 1, 'Teakowa', 'event', 'e2', 5, '${long}', 1, 1, 1);`,
    ].join("\n"));
    const services = createPlatformServices(database);

    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const featured = await services.listFeaturedReviewComments();
      expect(featuredReviewCommentsResponseSchema.safeParse({ contractVersion: "1", ...featured }).success).toBe(true);
      expect(featured.items).toHaveLength(3);
      for (const item of featured.items) {
        expect(["已实装", "已移除"]).toContain(item.targetName);
        expect(item).not.toHaveProperty("author");
        seen.add(item.targetName);
      }
    }
    expect(seen).toEqual(new Set(["已实装", "已移除"]));
    // The accountless imported review is eligible: with the other removed-event review gone, it still surfaces.
    sqlite.exec("DELETE FROM reviews WHERE id = 'r2'");
    const comments = new Set<string>();
    for (let i = 0; i < 20; i += 1) for (const item of (await services.listFeaturedReviewComments()).items) if (item.targetName === "已移除") comments.add(item.comment);
    expect(comments).toEqual(new Set([long]));
  });

  it("returns an empty list when nothing qualifies", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    await expect(createPlatformServices(database).listFeaturedReviewComments()).resolves.toEqual({ items: [] });
  });
});
