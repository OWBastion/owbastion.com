import { describe, expect, it } from "vitest";
import { featuredReviewCommentsResponseSchema } from "@owbastion/contracts";
import type { PlatformServices } from "@owbastion/domain";
import { createApp } from "./app";

describe("GET /v1/public/reviews/featured", () => {
  it("serves the featured comments uncached", async () => {
    const items = [{ rating: 5 as const, comment: "这个事件很有意思，值得推荐", targetName: "有点松弛" }];
    const app = createApp({ services: () => ({ listFeaturedReviewComments: async () => ({ items }) }) as unknown as PlatformServices, authenticate: async () => null });
    const response = await app.request("http://localhost/v1/public/reviews/featured", {}, {} as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(featuredReviewCommentsResponseSchema.parse(body)).toEqual({ contractVersion: "1", items });
  });
});
